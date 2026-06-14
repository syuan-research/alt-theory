import { existsSync } from "fs";
import type {
  AgentSession,
  AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import {
  createAltTheorySession,
  openAltTheorySession,
  type AssemblyManifest,
  type PromptMode,
  type ResourceDiscoveryMode,
} from "../core/alt-theory-core.js";
import {
  allocateReadableSessionId,
  createSessionDirs,
  getSessionDirs,
  type SessionDirectories,
} from "../core/data-dir.js";
import type { AgentAssetPaths } from "../core/agent-assets.js";
import {
  isKnownKbDomain,
  resolveRolePresetSlug,
  resolveSoulSlug,
} from "./asset-registry.js";
import { appendSessionEvent } from "./session-events.js";
import {
  buildSessionMetrics,
  persistSessionMetrics,
  type SessionCounters,
} from "./session-metrics.js";
import { readSessionDetail, getSessionRootForRequest } from "./session-store.js";
import {
  writeFoundationRecords,
} from "./session-records.js";
import type {
  SessionMetrics,
  SessionSnapshot,
  TranscriptMessage,
} from "./websocket-protocol.js";

export class SessionBusyError extends Error {
  readonly code = "session_busy";

  constructor(sessionId: string) {
    super(`Session is busy: ${sessionId}`);
  }
}

export interface SessionServiceConfig {
  dataDir: string;
  assetPaths: AgentAssetPaths;
  kbDir: string;
  rolePresetsDir: string;
  soulDir: string;
  legacySoulPath: string | null;
  readOnly: boolean;
  modelProvider?: string;
  modelId?: string;
  modelsPath?: string;
  runtimeApiKey?: string;
  thinkingLevel?: ThinkingLevel;
  promptMode: PromptMode;
  resourceDiscovery: ResourceDiscoveryMode;
  skillsDir?: string;
  runLabel: string | null;
  testBatch: string | null;
  coreSoulPath?: string;
  coreSoulModulesDir?: string;
  coreSoulModules?: string[];
}

export interface SessionSelectors {
  rolePresetSlug: string | null;
  kbDomain: string;
  soulSlug: string | null;
}

export interface RunHandle {
  ids: {
    sessionId: string;
    branchId: "main";
    turnId: string;
    revisionId: string;
    runId: string;
  };
  completion: Promise<void>;
  abort(): Promise<void>;
}

export type SessionServiceEvent =
  | { type: "snapshot"; payload: SessionSnapshot }
  | { type: "assistant_delta"; payload: { text: string } }
  | {
      type: "tool_started";
      payload: { toolName: string; callId: string; path?: string | null };
    }
  | { type: "tool_updated"; payload: { callId: string } }
  | { type: "tool_finished"; payload: { callId: string; success: boolean } }
  | { type: "run_completed"; payload: SessionSnapshot }
  | { type: "run_failed"; payload: { error: string } }
  | { type: "session_metrics"; payload: SessionMetrics };

interface ManagedSession {
  session: AgentSession;
  manifest: AssemblyManifest;
  selectors: SessionSelectors;
  openedFrom: "new" | "existing";
  resumeWarnings: string[];
  counters: SessionCounters;
  transcript: TranscriptMessage[];
  listeners: Set<(event: SessionServiceEvent) => void>;
  internalUnsubscribe: () => void;
  busy: boolean;
  nextTurnIndex: number;
  nextRevisionIndex: number;
  nextRunIndex: number;
}

export class SessionService {
  private readonly sessions = new Map<string, ManagedSession>();

  constructor(private readonly config: SessionServiceConfig) {}

  async createSession(selectors: SessionSelectors): Promise<SessionSnapshot> {
    const sessionId = allocateReadableSessionId(this.config.dataDir, {
      rolePresetSlug: selectors.rolePresetSlug,
      soulSlug: selectors.soulSlug,
      modelId: this.config.modelId,
    });
    const managed = await this.createManagedFromDirs(
      createSessionDirs(this.config.dataDir, sessionId),
      selectors
    );
    this.sessions.set(managed.session.sessionId, managed);
    return this.snapshot(managed);
  }

  async openSession(
    sessionId: string,
    fallbackSelectors: SessionSelectors
  ): Promise<SessionSnapshot> {
    const managed = await this.createManagedFromExisting(
      sessionId,
      fallbackSelectors
    );
    this.sessions.set(managed.session.sessionId, managed);
    return this.snapshot(managed);
  }

  async replaceSession(
    sessionId: string,
    selectors: SessionSelectors,
    abortReason: string
  ): Promise<SessionSnapshot> {
    const previous = this.requireSession(sessionId);
    if (selectors.rolePresetSlug !== previous.selectors.rolePresetSlug) {
      appendSessionEvent(previous.manifest.recordsDir, {
        sessionId: previous.session.sessionId,
        type: "role_preset_selected",
        details: { rolePresetSlug: selectors.rolePresetSlug },
      });
    }
    if (selectors.soulSlug !== previous.selectors.soulSlug) {
      appendSessionEvent(previous.manifest.recordsDir, {
        sessionId: previous.session.sessionId,
        type: "soul_selected",
        details: { soulSlug: selectors.soulSlug },
      });
    }
    if (previous.busy || previous.session.isStreaming) {
      await this.abort(sessionId, abortReason);
    }
    const reuseCurrentSession = this.hasSessionHistory(previous) === false;
    const dirs = reuseCurrentSession
      ? getSessionDirs(this.config.dataDir, previous.session.sessionId)
      : createSessionDirs(this.config.dataDir);
    if (!dirs) {
      throw new Error(`Invalid session id: ${previous.session.sessionId}`);
    }

    const replacement = await this.createManagedFromDirs(dirs, selectors);
    this.sessions.set(replacement.session.sessionId, replacement);
    await this.disposeManaged(previous);
    if (replacement.session.sessionId !== previous.session.sessionId) {
      this.sessions.delete(previous.session.sessionId);
    }
    return this.snapshot(replacement);
  }

  setKbDomain(sessionId: string, domain: string): SessionSnapshot {
    if (!isKnownKbDomain(this.config.kbDir, domain)) {
      throw new Error(`Unknown KB domain: ${domain}`);
    }
    const managed = this.requireSession(sessionId);
    managed.selectors.kbDomain = domain;
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId: managed.session.sessionId,
      type: "kb_selected",
      details: { kbDomain: domain },
    });
    return this.snapshot(managed);
  }

  runPrompt(sessionId: string, text: string): RunHandle {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }

    managed.busy = true;
    managed.counters.messageCount++;
    const turnId = formatCounter("turn", managed.nextTurnIndex++);
    const revisionId = formatCounter("rev", managed.nextRevisionIndex++);
    const runId = formatCounter("run", managed.nextRunIndex++);
    const contextPrefix =
      managed.selectors.kbDomain !== "all"
        ? `[Context: Search in ${this.config.kbDir}/${managed.selectors.kbDomain}/ unless user says otherwise.]\n`
        : "";

    const completion = managed.session
      .prompt(contextPrefix + text)
      .finally(() => {
        managed.busy = false;
      });

    return {
      ids: {
        sessionId,
        branchId: "main",
        turnId,
        revisionId,
        runId,
      },
      completion,
      abort: () => this.abort(sessionId, "run_handle_abort"),
    };
  }

  async abort(sessionId: string, reason?: string): Promise<void> {
    const managed = this.requireSession(sessionId);
    await managed.session.abort();
    managed.busy = false;
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId: managed.session.sessionId,
      type: "run_aborted",
      details: reason ? { reason } : undefined,
    });
  }

  attach(
    sessionId: string,
    listener: (event: SessionServiceEvent) => void
  ): () => void {
    const managed = this.requireSession(sessionId);
    managed.listeners.add(listener);
    return () => {
      managed.listeners.delete(listener);
    };
  }

  getSnapshot(sessionId: string): SessionSnapshot {
    return this.snapshot(this.requireSession(sessionId));
  }

  getManifest(sessionId: string): AssemblyManifest {
    return this.requireSession(sessionId).manifest;
  }

  getMetrics(sessionId: string): SessionMetrics {
    return this.buildMetrics(this.requireSession(sessionId));
  }

  getTranscript(sessionId: string): TranscriptMessage[] {
    return [...this.requireSession(sessionId).transcript];
  }

  getSelectors(sessionId: string): SessionSelectors {
    return { ...this.requireSession(sessionId).selectors };
  }

  async disposeAll(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(sessions.map((managed) => this.disposeManaged(managed)));
  }

  private async createManagedFromDirs(
    sessionDirs: SessionDirectories,
    selectors: SessionSelectors
  ): Promise<ManagedSession> {
    const rolePresetPath = this.resolveOptionalRolePresetPath(
      selectors.rolePresetSlug
    );
    const soulPath = this.resolveOptionalSoulPath(selectors.soulSlug);
    const result = await createAltTheorySession({
      ...sessionDirs,
      appContextPath: this.config.assetPaths.appContextPath,
      soulPath,
      soulSlug: selectors.soulSlug,
      rolePresetPath,
      rolePresetSlug: selectors.rolePresetSlug,
      kbDir: this.config.kbDir,
      kbDomain: selectors.kbDomain,
      piPromptTemplatesDir: this.config.assetPaths.piPromptTemplatesDir,
      coreSoulPath: this.config.coreSoulPath,
      coreSoulModulesDir: this.config.coreSoulModulesDir,
      coreSoulModules: this.config.coreSoulModules,
      modelProvider: this.config.modelProvider,
      modelId: this.config.modelId,
      modelsPath: this.config.modelsPath,
      runtimeApiKey: this.config.runtimeApiKey,
      thinkingLevel: this.config.thinkingLevel,
      promptMode: this.config.promptMode,
      resourceDiscovery: this.config.resourceDiscovery,
      skillsDir: this.config.skillsDir,
      runLabel: this.config.runLabel,
      testBatch: this.config.testBatch,
      readOnly: this.config.readOnly,
    });
    writeFoundationRecords({
      sessionRoot: sessionDirs.sessionRoot,
      recordsDir: sessionDirs.recordsDir,
      manifest: result.manifest,
    });

    const managed = this.createManaged({
      ...result,
      selectors,
      openedFrom: "new",
      resumeWarnings: [],
      counters: { messageCount: 0, toolCallCount: 0, turnCount: 0 },
      transcript: [],
    });
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId: managed.session.sessionId,
      type: "session_created",
      details: {
        kbDomain: selectors.kbDomain,
        rolePresetSlug: selectors.rolePresetSlug,
        soulSlug: selectors.soulSlug,
        model: managed.manifest.model,
        provider: managed.manifest.provider,
      },
    });
    return managed;
  }

  private async createManagedFromExisting(
    sessionId: string,
    fallbackSelectors: SessionSelectors
  ): Promise<ManagedSession> {
    const root = getSessionRootForRequest(this.config.dataDir, sessionId);
    if (root.status === "invalid") {
      throw new Error(`Invalid session id: ${sessionId}`);
    }
    if (root.status === "missing") {
      throw new Error(`Unknown session id: ${sessionId}`);
    }

    const detail = readSessionDetail(this.config.dataDir, sessionId);
    if (!detail?.pi.sessionFile) {
      throw new Error(
        `Session cannot be opened because Pi JSONL is missing: ${sessionId}`
      );
    }
    const sessionDirs = getSessionDirs(this.config.dataDir, sessionId);
    if (!sessionDirs) {
      throw new Error(`Invalid session id: ${sessionId}`);
    }

    const activeRolePresetSlug = this.activeOptionalSlug(
      detail.manifest?.rolePreset?.slug,
      fallbackSelectors.rolePresetSlug,
      (slug) => this.resolveOptionalRolePresetPath(slug)
    );
    const activeSoulSlug = this.activeOptionalSlug(
      detail.manifest?.soul?.slug,
      fallbackSelectors.soulSlug,
      (slug) => this.resolveOptionalSoulPath(slug)
    );
    const originalDomain =
      detail.manifest?.kb?.domain ?? detail.manifest?.kbDomain ?? null;
    const activeDomain =
      originalDomain && isKnownKbDomain(this.config.kbDir, originalDomain)
        ? originalDomain
        : fallbackSelectors.kbDomain;

    const result = await openAltTheorySession({
      ...sessionDirs,
      sessionFile: detail.pi.sessionFile,
      originalManifest: detail.manifest,
      appContextPath: this.config.assetPaths.appContextPath,
      soulPath: this.resolveOptionalSoulPath(activeSoulSlug),
      soulSlug: activeSoulSlug,
      rolePresetPath: this.resolveOptionalRolePresetPath(activeRolePresetSlug),
      rolePresetSlug: activeRolePresetSlug,
      kbDir: this.config.kbDir,
      kbDomain: activeDomain,
      piPromptTemplatesDir: this.config.assetPaths.piPromptTemplatesDir,
      coreSoulPath: this.config.coreSoulPath,
      coreSoulModulesDir: this.config.coreSoulModulesDir,
      coreSoulModules: this.config.coreSoulModules,
      modelProvider: this.config.modelProvider,
      modelId: this.config.modelId,
      modelsPath: this.config.modelsPath,
      runtimeApiKey: this.config.runtimeApiKey,
      thinkingLevel: this.config.thinkingLevel,
      promptMode: this.config.promptMode,
      resourceDiscovery: this.config.resourceDiscovery,
      skillsDir: this.config.skillsDir,
      runLabel: this.config.runLabel,
      testBatch: this.config.testBatch,
      readOnly: this.config.readOnly,
    });

    const managed = this.createManaged({
      ...result,
      selectors: {
        rolePresetSlug: activeRolePresetSlug,
        kbDomain: activeDomain,
        soulSlug: activeSoulSlug,
      },
      openedFrom: "existing",
      resumeWarnings: result.resumeWarnings,
      counters: {
        messageCount: detail.metrics?.messageCount ?? 0,
        toolCallCount: detail.metrics?.toolCallCount ?? 0,
        turnCount: detail.metrics?.turnCount ?? 0,
      },
      transcript: detail.transcript,
    });
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId: managed.session.sessionId,
      type: "session_opened_existing",
      details: {
        requestedSessionId: sessionId,
        kbDomain: activeDomain,
        rolePresetSlug: activeRolePresetSlug,
        soulSlug: activeSoulSlug,
        warningCount: managed.resumeWarnings.length,
      },
    });
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId: managed.session.sessionId,
      type: "session_resumed",
      details: {
        model: managed.manifest.model,
        provider: managed.manifest.provider,
      },
    });
    if (managed.resumeWarnings.length > 0) {
      appendSessionEvent(managed.manifest.recordsDir, {
        sessionId: managed.session.sessionId,
        type: "resume_warning",
        details: {
          warningCount: managed.resumeWarnings.length,
          warnings: managed.resumeWarnings.join(" | "),
        },
      });
    }
    return managed;
  }

  private createManaged(args: {
    session: AgentSession;
    manifest: AssemblyManifest;
    selectors: SessionSelectors;
    openedFrom: "new" | "existing";
    resumeWarnings: string[];
    counters: SessionCounters;
    transcript: TranscriptMessage[];
  }): ManagedSession {
    const managed: ManagedSession = {
      ...args,
      listeners: new Set(),
      internalUnsubscribe: () => {},
      busy: false,
      nextTurnIndex: Math.max(1, args.counters.turnCount + 1),
      nextRevisionIndex: 1,
      nextRunIndex: 1,
    };
    managed.internalUnsubscribe = managed.session.subscribe((event) =>
      this.handleAgentEvent(managed, event)
    );
    return managed;
  }

  private handleAgentEvent(
    managed: ManagedSession,
    event: AgentSessionEvent
  ): void {
    switch (event.type) {
      case "agent_start":
        this.emit(managed, {
          type: "snapshot",
          payload: this.snapshot(managed, { status: "running" }),
        });
        break;
      case "message_update":
        if (event.assistantMessageEvent?.type === "text_delta") {
          this.emit(managed, {
            type: "assistant_delta",
            payload: { text: event.assistantMessageEvent.delta ?? "" },
          });
        }
        break;
      case "tool_execution_start":
        this.emit(managed, {
          type: "tool_started",
          payload: {
            toolName: event.toolName,
            callId: event.toolCallId,
            path: extractToolPathFromEvent(event),
          },
        });
        break;
      case "tool_execution_update":
        this.emit(managed, {
          type: "tool_updated",
          payload: { callId: event.toolCallId },
        });
        break;
      case "tool_execution_end":
        managed.counters.toolCallCount++;
        this.emit(managed, {
          type: "tool_finished",
          payload: { callId: event.toolCallId, success: !event.isError },
        });
        break;
      case "agent_end": {
        managed.busy = false;
        const error = managed.session.state.errorMessage;
        if (error) {
          appendSessionEvent(managed.manifest.recordsDir, {
            sessionId: managed.session.sessionId,
            type: "run_failed",
            details: { error },
          });
          this.emit(managed, { type: "run_failed", payload: { error } });
        } else {
          managed.counters.turnCount++;
          const metrics = this.persistMetrics(managed);
          appendSessionEvent(managed.manifest.recordsDir, {
            sessionId: managed.session.sessionId,
            type: "run_completed",
            details: {
              turnCount: managed.counters.turnCount,
              toolCallCount: managed.counters.toolCallCount,
            },
          });
          this.emit(managed, {
            type: "run_completed",
            payload: this.snapshot(managed, { status: "idle" }),
          });
          this.emit(managed, { type: "session_metrics", payload: metrics });
        }
        break;
      }
    }
  }

  private emit(managed: ManagedSession, event: SessionServiceEvent): void {
    for (const listener of managed.listeners) {
      listener(event);
    }
  }

  private snapshot(
    managed: ManagedSession,
    overrides?: Partial<SessionSnapshot>
  ): SessionSnapshot {
    return {
      sessionId: managed.session.sessionId,
      status: managed.session.isStreaming ? "running" : "idle",
      currentDomain: managed.selectors.kbDomain,
      rolePresetSlug: managed.selectors.rolePresetSlug,
      profileSlug: managed.selectors.rolePresetSlug,
      soulSlug: managed.selectors.soulSlug,
      openedFrom: managed.openedFrom,
      resumeWarnings: managed.resumeWarnings,
      messageCount: managed.counters.messageCount,
      ...overrides,
    };
  }

  private buildMetrics(managed: ManagedSession): SessionMetrics {
    return buildSessionMetrics(managed.session, managed.counters);
  }

  private persistMetrics(managed: ManagedSession): SessionMetrics {
    const metrics = this.buildMetrics(managed);
    persistSessionMetrics(managed.manifest.recordsDir, metrics);
    return metrics;
  }

  private hasSessionHistory(managed: ManagedSession): boolean {
    try {
      const context = managed.session.sessionManager.buildSessionContext();
      return Array.isArray(context.messages) && context.messages.length > 0;
    } catch {
      return Boolean(
        managed.session.sessionFile && existsSync(managed.session.sessionFile)
      );
    }
  }

  private async disposeManaged(managed: ManagedSession): Promise<void> {
    managed.internalUnsubscribe();
    if (managed.session.isStreaming) {
      await managed.session.abort();
    }
    managed.session.dispose();
  }

  private requireSession(sessionId: string): ManagedSession {
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      throw new Error(`Unknown managed session: ${sessionId}`);
    }
    return managed;
  }

  private resolveOptionalRolePresetPath(slug: string | null): string | null {
    if (!slug) return null;
    const path = resolveRolePresetSlug(this.config.rolePresetsDir, slug);
    if (!path) {
      throw new Error(`Unknown role preset slug: ${slug}`);
    }
    return path;
  }

  private resolveOptionalSoulPath(slug: string | null): string | null {
    if (!slug) return null;
    const path = resolveSoulSlug(
      this.config.soulDir,
      slug,
      this.config.legacySoulPath
    );
    if (!path) {
      throw new Error(`Unknown soul slug: ${slug}`);
    }
    return path;
  }

  private activeOptionalSlug(
    original: string | null | undefined,
    fallback: string | null,
    resolvePath: (slug: string | null) => string | null
  ): string | null {
    if (original === null) return null;
    if (typeof original === "string") {
      try {
        if (resolvePath(original)) return original;
      } catch {
        // Fall through to the current selector fallback.
      }
    }
    return fallback;
  }
}

function formatCounter(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(6, "0")}`;
}

function extractToolPathFromEvent(event: AgentSessionEvent): string | null {
  const args = (event as { args?: unknown }).args;
  if (!args || typeof args !== "object") return null;
  const value = args as {
    path?: unknown;
    file?: unknown;
    filePath?: unknown;
    file_path?: unknown;
    dir?: unknown;
    directory?: unknown;
  };
  for (const candidate of [
    value.path,
    value.file,
    value.filePath,
    value.file_path,
    value.dir,
    value.directory,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}
