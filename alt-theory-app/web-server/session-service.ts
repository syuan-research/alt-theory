import { cpSync, existsSync, rmSync, statSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import type {
  AgentSession,
  AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import {
  capabilityModeFromPromptMode,
  createAltTheorySession,
  KB_DISABLED_DOMAIN,
  openAltTheorySession,
  promptModeFromCapabilityMode,
  type AssemblyManifest,
  type CapabilityMode,
  type PromptMode,
  type ResourceDiscoveryMode,
} from "../core/alt-theory-core.js";
import {
  allocateReadableSessionId,
  createSessionDirs,
  getSessionDirs,
  writeJsonAtomic,
  type SessionDirectories,
} from "../core/data-dir.js";
import { isAbsolute, join, relative, resolve } from "path";
import type { AgentAssetPaths } from "../core/agent-assets.js";
import {
  isKnownKbDomain,
  resolveRolePresetSlug,
  resolveSoulSlug,
} from "./asset-registry.js";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import {
  ApprovalBridge,
  type ApprovalRequest,
  type ApprovalResolution,
  type ApprovalResponse,
} from "./approval-bridge.js";
import { appendSessionEvent } from "./session-events.js";
import {
  appendAbComparisonRecord,
  type AbComparisonRecord,
} from "./ab-records.js";
import {
  buildSessionMetrics,
  persistSessionMetrics,
  type SessionCounters,
} from "./session-metrics.js";
import {
  latestActiveLeafEntryId,
  listSessionSummaries,
  readSessionDetail,
  getSessionRootForRequest,
  stripSkillWrapper,
} from "./session-store.js";
import { readAppSettings } from "./app-settings.js";
import {
  readV4SessionHeader,
  writeFoundationRecords,
  writeSessionHeader,
  type ForkPurpose,
  type SessionModelOverride,
  type StudyTag,
} from "./session-records.js";
import {
  calculateRetentionDueAt,
  refreshRetention,
  refreshSessionRetention,
} from "./session-retention.js";
import {
  appendConfigEvent,
  buildEffectiveConfig,
} from "./config-events.js";
import { loadInstructionAsset } from "./instruction-assets.js";
import {
  appendRunRecord,
  latestRunSnapshots,
  type RunRecord,
} from "./run-records.js";
import type {
  SessionMetrics,
  SessionSnapshot,
  TranscriptMessage,
} from "./websocket-protocol.js";
import {
  continueAgentTurnAfterModelSwitch,
  loadModelFallbackConfig,
  ModelFallbackCoordinator,
  type ModelRef,
  resolveModelFallbackStatePath,
} from "../core/model-fallback.js";

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
  instructionsDir?: string;
  runLabel: string | null;
  testBatch: string | null;
  resolveRuntimeModelConfig?: () => RuntimeModelConfig;
  /**
   * Per-mode user-enabled external skill paths (spec §6.1). Read at every
   * session open so settings changes apply on reload without touching
   * running sessions.
   */
  resolveExternalSkillPaths?: () => { pure: string[]; full: string[] };
  /**
   * Inline Pi extension factories loaded into every session (M4 policy
   * layer, tests). The only extension entry point — ambient discovery
   * stays off (spec §3.4/§4.2).
   */
  extensionFactories?: ExtensionFactory[];
  modelFallbackConfigPath?: string | null;
}

interface RuntimeModelConfig {
  modelProvider?: string;
  modelId?: string;
  modelsPath?: string;
  runtimeApiKey?: string;
}

export interface SessionSelectors {
  projectId?: string | null;
  rolePresetSlug: string | null;
  kbDomain: string;
  soulSlug: string | null;
  customInstructionRef?: string | null;
}

export interface SessionCreationMetadata {
  ownerAccountId?: string | null;
  roleCondition?: string | null;
  visibility?: "research" | "private";
  consentSnapshot?: {
    researcherReadable: boolean;
    quoteAfterAnonymization: boolean;
    privateOverride: boolean;
  } | null;
  /**
   * Full workspace (spec §5.1). primaryDir replaces the default session
   * workspace as Pi's cwd; additionalDirs are intentional user additions.
   * Local app form only — the server layer gates this.
   */
  workspace?: {
    primaryDir?: string;
    additionalDirs?: string[];
  } | null;
  studyTag?: StudyTag | null;
  modelOverride?: SessionModelOverride | null;
  /** Internal child relationship used by fresh-context children. */
  forkedFrom?: { sessionId: string; purpose: ForkPurpose } | null;
  /** Internal mode override used when a fresh child inherits its parent mode. */
  mode?: CapabilityMode;
}

export type { ForkPurpose, StudyTag, SessionModelOverride };

export interface RunHandle {
  ids: {
    sessionId: string;
    branchId: string;
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
  | { type: "thinking_delta"; payload: { text: string } }
  | {
      type: "run_phase";
      payload: { phase: "connecting" | "thinking" | "idle" };
    }
  | {
      type: "tool_started";
      payload: { toolName: string; callId: string; path?: string | null };
    }
  | { type: "tool_updated"; payload: { callId: string } }
  | { type: "tool_finished"; payload: { callId: string; success: boolean } }
  | { type: "run_completed"; payload: SessionSnapshot }
  | { type: "run_failed"; payload: { error: string } }
  | { type: "session_metrics"; payload: SessionMetrics }
  | { type: "approval_requested"; payload: ApprovalRequest }
  | {
      type: "approval_resolved";
      payload: { approvalId: string; resolution: ApprovalResolution };
    }
  | {
      type: "extension_notice";
      payload: { message: string; level: "info" | "warning" | "error" };
    };

interface ManagedSession {
  session: AgentSession;
  manifest: AssemblyManifest;
  getMode: () => CapabilityMode;
  setMode: (mode: CapabilityMode) => Promise<void>;
  getWorkspace: () => { primaryDir: string; additionalDirs: string[] };
  addWorkspaceDir: (dir: string) => Promise<string[]>;
  approvalBridge: ApprovalBridge;
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
  branchId: string;
  fallbackAttempts: number;
  pendingRunWork: Promise<void> | null;
}

export class SessionService {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly modelFallback: ModelFallbackCoordinator | null;

  constructor(private readonly config: SessionServiceConfig) {
    const fallbackConfigPath = this.config.modelFallbackConfigPath;
    if (fallbackConfigPath) {
      const fallbackConfig = loadModelFallbackConfig(fallbackConfigPath);
      this.modelFallback =
        fallbackConfig && fallbackConfig.enabled
          ? new ModelFallbackCoordinator(
              fallbackConfig,
              resolveModelFallbackStatePath(this.config.dataDir)
            )
          : null;
    } else {
      this.modelFallback = null;
    }
  }

  private resolveRuntimeModelConfig(): RuntimeModelConfig {
    return (
      this.config.resolveRuntimeModelConfig?.() ?? {
        modelProvider: this.config.modelProvider,
        modelId: this.config.modelId,
        modelsPath: this.config.modelsPath,
        runtimeApiKey: this.config.runtimeApiKey,
      }
    );
  }

  private resolveEffectiveRuntimeModelConfig(): RuntimeModelConfig {
    const base = this.resolveRuntimeModelConfig();
    const coordinator = this.modelFallback;
    if (
      !coordinator?.isEnabled() ||
      !base.modelProvider ||
      !base.modelId ||
      base.modelProvider !== coordinator.provider
    ) {
      return base;
    }
    const usable = coordinator.resolveFirstUsableModel(base.modelId);
    if (!usable) {
      return base;
    }
    return {
      ...base,
      modelProvider: usable.provider,
      modelId: usable.modelId,
    };
  }

  /**
   * Model args for opening a session: a persisted per-session override (M7
   * §5b) wins over the deployment-global config; thinking falls back global.
   */
  private modelArgsFor(
    override: SessionModelOverride | null | undefined
  ): RuntimeModelConfig & { thinkingLevel?: ThinkingLevel } {
    const base = this.resolveEffectiveRuntimeModelConfig();
    return {
      ...base,
      ...(override
        ? { modelProvider: override.provider, modelId: override.modelId }
        : {}),
      thinkingLevel: override?.thinkingLevel ?? this.config.thinkingLevel,
    };
  }

  private persistManifestModel(managed: ManagedSession): void {
    writeJsonAtomic(
      join(managed.manifest.recordsDir, "assembly-manifest.json"),
      managed.manifest
    );
    if (managed.openedFrom === "existing") {
      writeJsonAtomic(
        join(managed.manifest.recordsDir, "resume-manifest.json"),
        managed.manifest
      );
    }
  }

  private syncManifestModelFromSession(managed: ManagedSession): void {
    const current = managed.session.model;
    if (!current) {
      return;
    }
    if (
      managed.manifest.provider === current.provider &&
      managed.manifest.model === current.id
    ) {
      return;
    }
    managed.manifest.provider = current.provider;
    managed.manifest.model = current.id;
    this.persistManifestModel(managed);
  }

  /**
   * Auto-name a conversation after its first real turn (v1.2.1). Best-effort:
   * runs once (only when no ui-alias.json exists — imports seed one, manual
   * renames create one), fires-and-forgets, and swallows all errors so a failed
   * title never disturbs the run. Model chain: pinned model (settings) →
   * session model → no write (frontend keeps the first-words snippet).
   */
  private async maybeAutoTitle(managed: ManagedSession): Promise<void> {
    try {
      const aliasPath = join(managed.manifest.recordsDir, "ui-alias.json");
      if (existsSync(aliasPath)) return;

      const settings = readAppSettings(this.config.dataDir);
      if (settings.autoTitle?.enabled === false) return;

      const firstUser = firstUserMessageText(
        managed.session.sessionManager.getEntries()
      );
      if (!firstUser) return;

      const sessionModel = managed.session.model;
      const pin = settings.autoTitle?.model ?? null;
      const pinnedModel = pin
        ? managed.session.modelRegistry.find(pin.provider, pin.modelId)
        : null;

      let title = await completeTitle(pinnedModel ?? sessionModel, firstUser);
      if (!title && pinnedModel && sessionModel) {
        // Pinned model failed → fall back to the conversation model.
        title = await completeTitle(sessionModel, firstUser);
      }
      if (!title) return; // leave the first-words snippet fallback in place

      // A manual rename may have landed while the model was thinking.
      if (existsSync(aliasPath)) return;
      writeJsonAtomic(aliasPath, {
        schemaVersion: 1,
        alias: title,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Best-effort; never disturb the run.
    }
  }

  async createSession(
    selectors: SessionSelectors,
    metadata: SessionCreationMetadata = {}
  ): Promise<SessionSnapshot> {
    const runtimeModelConfig = this.resolveEffectiveRuntimeModelConfig();
    const sessionId = allocateReadableSessionId(this.config.dataDir, {
      rolePresetSlug: selectors.rolePresetSlug,
      soulSlug: selectors.soulSlug,
      modelId: runtimeModelConfig.modelId,
    });
    const managed = await this.createManagedFromDirs(
      createSessionDirs(this.config.dataDir, sessionId),
      selectors,
      metadata,
      runtimeModelConfig
    );
    this.sessions.set(managed.manifest.sessionId, managed);
    appendConfigEvent(managed.manifest.recordsDir, {
      sessionId: managed.manifest.sessionId,
      branchId: managed.branchId,
      reason: "creation",
      effective: buildEffectiveConfig(
        managed.manifest,
        managed.selectors.projectId
      ),
      changedFields: [],
      warnings: [],
    });
    return this.snapshot(managed);
  }

  async openSession(
    sessionId: string,
    fallbackSelectors: SessionSelectors
  ): Promise<SessionSnapshot> {
    // A live session keeps its managed instance. Re-opening from disk would
    // stack a second runtime over the same files and orphan any in-flight
    // run — the multi-conversation UI switches freely between a live parent
    // and its children, so this path is now hot.
    const live = this.sessions.get(sessionId);
    if (live) {
      return this.snapshot(live);
    }
    const managed = await this.createManagedFromExisting(
      sessionId,
      fallbackSelectors
    );
    // Reading a private session counts as activity: reopening refreshes the
    // retention timer so a conversation the user still returns to never
    // expires out from under them (owner decision 2026-07-23).
    const header = readV4SessionHeader(managed.manifest.recordsDir);
    if (header?.visibility === "private") {
      refreshSessionRetention(managed.manifest.recordsDir);
    }
    this.sessions.set(managed.manifest.sessionId, managed);
    return this.snapshot(managed);
  }

  async replaceSession(
    sessionId: string,
    selectors: SessionSelectors,
    _abortReason: string
  ): Promise<SessionSnapshot> {
    const previous = this.requireSession(sessionId);
    if (previous.busy || previous.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    if (selectors.rolePresetSlug !== previous.selectors.rolePresetSlug) {
      appendSessionEvent(previous.manifest.recordsDir, {
        sessionId: previous.manifest.sessionId,
        type: "role_preset_selected",
        details: { rolePresetSlug: selectors.rolePresetSlug },
      });
    }
    if (selectors.soulSlug !== previous.selectors.soulSlug) {
      appendSessionEvent(previous.manifest.recordsDir, {
        sessionId: previous.manifest.sessionId,
        type: "soul_selected",
        details: { soulSlug: selectors.soulSlug },
      });
    }
    const dirs = getSessionDirs(this.config.dataDir, previous.manifest.sessionId);
    if (!dirs) {
      throw new Error(`Invalid session id: ${previous.manifest.sessionId}`);
    }

    const replacement = this.hasSessionHistory(previous)
      ? await this.createManagedFromExistingWithSelectors(
          previous.manifest.sessionId,
          selectors,
          previous
        )
      : await this.createManagedFromDirs(dirs, selectors);
    this.sessions.set(replacement.manifest.sessionId, replacement);
    await this.disposeManaged(previous);
    appendConfigEvent(replacement.manifest.recordsDir, {
      sessionId: replacement.manifest.sessionId,
      reason: "user_change",
      effective: buildEffectiveConfig(
        replacement.manifest,
        replacement.selectors.projectId
      ),
      changedFields: configChangedFields(previous.selectors, selectors),
      warnings: [],
      branchId: replacement.branchId,
    });
    return this.snapshot(replacement);
  }

  /**
   * Switch capability mode on the live session (spec §3.2). Applies from the
   * next turn via Pi's own loader reload + active-tool swap; the session, its
   * conversation, and its Pi JSONL are untouched.
   */
  async switchMode(
    sessionId: string,
    mode: CapabilityMode
  ): Promise<SessionSnapshot> {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    if (managed.getMode() === mode) {
      return this.snapshot(managed);
    }
    await managed.setMode(mode);
    managed.manifest.promptMode = promptModeFromCapabilityMode(mode);
    const header = readV4SessionHeader(managed.manifest.recordsDir);
    if (header) {
      writeSessionHeader(managed.manifest.recordsDir, { ...header, mode });
    }
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId,
      type: "mode_selected",
      details: { mode },
    });
    appendConfigEvent(managed.manifest.recordsDir, {
      sessionId,
      branchId: managed.branchId,
      reason: "user_change",
      effective: buildEffectiveConfig(
        managed.manifest,
        managed.selectors.projectId
      ),
      changedFields: ["promptMode"],
      warnings: [],
    });
    return this.snapshot(managed);
  }

  /**
   * Add a workspace directory to a live session (spec §5.1) — an intentional
   * user act. Applies from the next turn via loader reload; persisted in the
   * session header so reopen restores it.
   */
  async addWorkspaceDir(
    sessionId: string,
    dir: string
  ): Promise<SessionSnapshot> {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    await managed.addWorkspaceDir(dir);
    const workspace = managed.getWorkspace();
    managed.manifest.workspace = workspace;
    this.persistManifestModel(managed);
    const header = readV4SessionHeader(managed.manifest.recordsDir);
    if (header) {
      writeSessionHeader(managed.manifest.recordsDir, { ...header, workspace });
    }
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId,
      type: "workspace_dir_added",
      details: {
        dir: resolve(dir),
        additionalDirCount: workspace.additionalDirs.length,
      },
    });
    return this.snapshot(managed);
  }

  /**
   * Re-point a session's working folder (M4). Header is the source of truth;
   * a live session is disposed and reopened so Pi's cwd and the security
   * boundary rebuild against the new folder — which also resets session
   * approval allowances (conservative: re-ask in the new context).
   * additionalDirs are dropped for the same reason. Returns null when the
   * session was not live (header-only change; next open picks it up).
   */
  async setSessionWorkspace(
    sessionId: string,
    primaryDir: string | null
  ): Promise<SessionSnapshot | null> {
    const resolved = primaryDir ? resolve(primaryDir) : null;
    if (resolved) {
      const stat = statSync(resolved, { throwIfNoEntry: false });
      if (!stat?.isDirectory()) {
        throw new Error(`Working folder does not exist: ${resolved}`);
      }
    }
    // Branches move with their conversation (owner decision 2026-07-24): one
    // re-point carries the whole fork family so a moved parent never strands
    // its branches in the old folder — and the list grouping stays truthful.
    const family = [sessionId, ...this.forkDescendants(sessionId)];
    for (const id of family) {
      const member = this.sessions.get(id);
      if (member && (member.busy || member.session.isStreaming)) {
        throw new SessionBusyError(id);
      }
    }
    let target: SessionSnapshot | null = null;
    for (const id of family) {
      const snapshot = await this.repointOne(id, resolved);
      if (id === sessionId) target = snapshot;
    }
    return target;
  }

  /** All fork/side/helper/arm descendants of a session, breadth-first. */
  private forkDescendants(sessionId: string): string[] {
    const childrenByParent = new Map<string, string[]>();
    for (const summary of listSessionSummaries(this.config.dataDir).sessions) {
      const parentId = summary.forkedFrom?.sessionId;
      if (!parentId) continue;
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId)?.push(summary.sessionId);
    }
    const out: string[] = [];
    const queue = [...(childrenByParent.get(sessionId) ?? [])];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      out.push(id);
      queue.push(...(childrenByParent.get(id) ?? []));
    }
    return out;
  }

  private async repointOne(
    sessionId: string,
    resolved: string | null
  ): Promise<SessionSnapshot | null> {
    const live = this.sessions.get(sessionId);
    const recordsDir =
      live?.manifest.recordsDir ??
      getSessionDirs(this.config.dataDir, sessionId)?.recordsDir;
    if (!recordsDir || !existsSync(recordsDir)) {
      throw new Error(`Unknown session id: ${sessionId}`);
    }
    const header = readV4SessionHeader(recordsDir);
    if (!header) {
      throw new Error(`Session header missing: ${sessionId}`);
    }
    writeSessionHeader(recordsDir, {
      ...header,
      workspace: resolved
        ? { primaryDir: resolved, additionalDirs: [] }
        : undefined,
    });
    appendSessionEvent(recordsDir, {
      sessionId,
      type: "workspace_repointed",
      details: { primaryDir: resolved },
    });
    if (!live) return null;
    const selectors = { ...live.selectors };
    this.sessions.delete(sessionId);
    await this.disposeManaged(live);
    let replacement: ManagedSession;
    try {
      replacement = await this.createManagedFromExisting(sessionId, selectors);
    } catch (error) {
      // Roll back so a failed reopen never leaves the conversation closed:
      // restore the previous header and reopen against the old folder.
      writeSessionHeader(recordsDir, header);
      appendSessionEvent(recordsDir, {
        sessionId,
        type: "workspace_repointed",
        details: {
          primaryDir: header.workspace?.primaryDir ?? null,
          rollback: true,
        },
      });
      replacement = await this.createManagedFromExisting(sessionId, selectors);
      replacement.listeners = live.listeners;
      this.sessions.set(sessionId, replacement);
      throw error;
    }
    // Reuse the old Set (not a copy): existing unsubscribe closures captured
    // it, so WebSocket subscriptions survive the reopen and still detach.
    replacement.listeners = live.listeners;
    this.sessions.set(sessionId, replacement);
    return this.snapshot(replacement);
  }

  /**
   * Resolve a pending extension approval dialog (spec §5.2). Unknown ids
   * return false (already resolved by timeout/abort, or never existed).
   */
  respondApproval(
    sessionId: string,
    approvalId: string,
    response: ApprovalResponse
  ): boolean {
    const managed = this.requireSession(sessionId);
    return managed.approvalBridge.respond(approvalId, response);
  }

  invokeSkill(
    sessionId: string,
    skillName: string,
    userText?: string
  ): RunHandle {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    const skill = managed.manifest.skills?.find(
      (candidate) => candidate.name === skillName
    );
    if (!skill) {
      throw new Error(`Unknown Alt Theory skill: ${skillName}`);
    }
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId,
      type: "skill_invoked",
      details: { skillName, skillPath: skill.path },
    });
    return this.runPromptWithLineage(
      managed,
      `/skill:${skillName}${userText?.trim() ? ` ${userText.trim()}` : ""}`
    );
  }

  setKbDomain(sessionId: string, domain: string): SessionSnapshot {
    if (domain !== KB_DISABLED_DOMAIN && !isKnownKbDomain(this.config.kbDir, domain)) {
      throw new Error(`Unknown KB domain: ${domain}`);
    }
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    managed.selectors.kbDomain = domain;
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId: managed.manifest.sessionId,
      type: "kb_selected",
      details: { kbDomain: domain },
    });
    appendConfigEvent(managed.manifest.recordsDir, {
      sessionId: managed.manifest.sessionId,
      reason: "user_change",
      effective: buildEffectiveConfig({
        ...managed.manifest,
        kbDomain: domain,
        kb: {
          ...managed.manifest.kb,
          domain,
        },
      }, managed.selectors.projectId),
      changedFields: ["kbDomain"],
      warnings: [],
      branchId: managed.branchId,
    });
    return this.snapshot(managed);
  }

  runPrompt(sessionId: string, text: string): RunHandle {
    const managed = this.requireSession(sessionId);
    const header = readV4SessionHeader(managed.manifest.recordsDir);
    if (
      header?.forkedFrom?.purpose === "helper" &&
      latestRunSnapshots(managed.manifest.recordsDir).length === 0 &&
      managed.manifest.skills?.some((skill) => skill.name === "alt-theory-help")
    ) {
      return this.invokeSkill(sessionId, "alt-theory-help", text);
    }
    // Imported sessions (session-import-source.json in the records dir) get
    // the imported-session-context skill on their first Alt Theory run, so
    // the agent learns what the import preserved and lost before continuing.
    if (
      existsSync(join(managed.manifest.recordsDir, "session-import-source.json")) &&
      latestRunSnapshots(managed.manifest.recordsDir).length === 0 &&
      managed.manifest.skills?.some(
        (skill) => skill.name === "imported-session-context"
      )
    ) {
      return this.invokeSkill(sessionId, "imported-session-context", text);
    }
    return this.runPromptWithLineage(managed, text);
  }

  reviseLatest(sessionId: string, text: string): RunHandle {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    const latest = this.requireLatestActiveCompletedUserRun(managed, "revise");
    return this.reviseFromRun(managed, latest, text);
  }

  /**
   * Rewind to ANY earlier completed user turn on the current branch and re-run
   * it with new text ("edit" in the UI). The target turn and every completed
   * turn after it are superseded; superseded entries stay in Pi's tree as
   * evidence, exactly like reviseLatest.
   */
  reviseAt(sessionId: string, userEntryId: string, text: string): RunHandle {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    if (
      !managed.session.sessionManager
        .getBranch()
        .some((entry) => entry.id === userEntryId)
    ) {
      throw new Error("Revise point must be in the current Pi conversation");
    }
    const allRuns = latestRunSnapshots(managed.manifest.recordsDir).filter(
      (run) => run.branchId === managed.branchId
    );
    const target = allRuns.find(
      (run) => run.status === "completed" && run.userEntryId === userEntryId
    );
    if (target?.userEntryId) {
      // Rewinding rewrites everything after the target: later completed runs
      // on this branch are superseded alongside it.
      for (const run of allRuns.slice(allRuns.indexOf(target) + 1)) {
        if (run.status !== "completed") continue;
        appendRunRecord(managed.manifest.recordsDir, {
          ...runRecordBody(run),
          status: "superseded",
          completedAt: new Date().toISOString(),
        });
      }
      return this.reviseFromRun(
        managed,
        target as RunRecord & { userEntryId: string },
        text
      );
    }
    // Inherited turn (fork or import history): the entry predates this
    // session's own run records, so every local completed run comes after it —
    // supersede them all and rewind Pi directly.
    const userEntry = managed.session.sessionManager.getEntry(userEntryId) as
      | { parentId?: string; type?: string; message?: { role?: string } }
      | undefined;
    if (userEntry?.type !== "message" || userEntry.message?.role !== "user") {
      throw new Error("Revise point must be a user message");
    }
    for (const run of allRuns) {
      if (run.status !== "completed") continue;
      appendRunRecord(managed.manifest.recordsDir, {
        ...runRecordBody(run),
        status: "superseded",
        completedAt: new Date().toISOString(),
      });
    }
    if (userEntry.parentId) {
      managed.session.sessionManager.branch(userEntry.parentId);
    } else {
      managed.session.sessionManager.resetLeaf();
    }
    return this.runPromptWithLineage(managed, text);
  }

  private reviseFromRun(
    managed: ManagedSession,
    run: RunRecord & { userEntryId: string },
    text: string
  ): RunHandle {
    const userEntry = managed.session.sessionManager.getEntry(run.userEntryId);
    if (!userEntry) {
      throw new Error("User entry is missing from Pi history");
    }
    if (userEntry.parentId) {
      managed.session.sessionManager.branch(userEntry.parentId);
    } else {
      managed.session.sessionManager.resetLeaf();
    }
    appendRunRecord(managed.manifest.recordsDir, {
      ...runRecordBody(run),
      status: "superseded",
      completedAt: new Date().toISOString(),
    });
    return this.runPromptWithLineage(managed, text, {
      turnId: run.turnId,
      supersedesRunId: run.runId,
    });
  }

  deleteLatest(sessionId: string): SessionSnapshot {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    const latest = this.requireLatestActiveCompletedUserRun(managed, "delete");
    const userEntry = managed.session.sessionManager.getEntry(latest.userEntryId);
    if (!userEntry) {
      throw new Error("Latest user entry is missing from Pi history");
    }
    if (userEntry.parentId) {
      managed.session.sessionManager.branch(userEntry.parentId);
    } else {
      managed.session.sessionManager.resetLeaf();
    }
    const activeLeafEntryId = managed.session.sessionManager.getLeafId() ?? null;
    appendRunRecord(managed.manifest.recordsDir, {
      ...runRecordBody(latest),
      status: "deleted",
      completedAt: new Date().toISOString(),
    });
    managed.transcript =
      readSessionDetail(this.config.dataDir, sessionId)?.transcript ??
      managed.transcript;
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId,
      type: "latest_turn_deleted",
      details: {
        branchId: managed.branchId,
        turnId: latest.turnId,
        runId: latest.runId,
        activeLeafEntryId,
      },
    });
    return this.snapshot(managed);
  }

  async forkSession(
    sessionId: string,
    purpose: ForkPurpose,
    forkPointEntryId?: string,
    selectorOverrides?: Partial<SessionSelectors>
  ): Promise<SessionSnapshot> {
    const previous = this.requireSession(sessionId);
    if (previous.busy || previous.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    // The sub-session substrate (M5): a fork inherits the parent by default, but
    // an A/B arm (or any child that must differ) can override any assembly layer
    // — role, KB domain, soul, instruction — while keeping the parent's
    // conversation. The child still routes through createManaged, so it is
    // mediated and non-headless like any session.
    const childSelectors: SessionSelectors = selectorOverrides
      ? { ...previous.selectors, ...selectorOverrides }
      : previous.selectors;
    let leafId =
      forkPointEntryId ?? previous.session.sessionManager.getLeafId();
    if (!leafId) {
      throw new Error("Fork requires an existing conversation entry");
    }
    // "Branch from here" on a user message forks the COMPLETE turn: advance
    // the fork point to that run's last assistant entry so the child doesn't
    // end on a dangling user message.
    const leafEntry = previous.session.sessionManager.getEntry(leafId) as
      | { type?: string; message?: { role?: string } }
      | undefined;
    if (leafEntry?.type === "message" && leafEntry.message?.role === "user") {
      // Advance to the last entry before the next user message on the active
      // path. Scanning the Pi branch (not run records) also covers inherited
      // fork/import history that has no local run records.
      const branch = previous.session.sessionManager.getBranch();
      const start = branch.findIndex((entry) => entry.id === leafId);
      if (start !== -1) {
        let end = branch.length - 1;
        for (let i = start + 1; i < branch.length; i += 1) {
          const entry = branch[i] as {
            type?: string;
            message?: { role?: string };
          };
          if (entry?.type === "message" && entry.message?.role === "user") {
            end = i - 1;
            break;
          }
        }
        leafId = branch[end].id;
      }
    }
    if (
      !previous.session.sessionManager
        .getBranch()
        .some((entry) => entry.id === leafId)
    ) {
      throw new Error("Fork point must be in the current Pi conversation");
    }
    const runtimeModelConfig = this.resolveEffectiveRuntimeModelConfig();
    const forkSessionId = allocateReadableSessionId(this.config.dataDir, {
      rolePresetSlug: childSelectors.rolePresetSlug,
      soulSlug: childSelectors.soulSlug,
      modelId: runtimeModelConfig.modelId,
    });
    const forkDirs = createSessionDirs(this.config.dataDir, forkSessionId);
    // Build the child's session file by COPYING the parent's persisted path —
    // never via createBranchedSession, which is Pi's TUI extract-and-move: it
    // re-points the live parent's SessionManager at the new file, forcing a
    // dispose+restore of the parent that survives only one fork cycle. Copying
    // getBranch(leafId) keeps the parent untouched, so forking is N-repeatable
    // and non-kicking (A/B arms, /btw, helper all fork the same live parent).
    const parentManager = previous.session.sessionManager;
    const parentHeader = parentManager.getHeader();
    if (!parentHeader) {
      throw new Error("Fork requires a persisted parent session");
    }
    const forkTimestamp = new Date().toISOString();
    const forkPiId = randomUUID();
    const forkHeader = {
      ...parentHeader,
      id: forkPiId,
      timestamp: forkTimestamp,
      parentSession: parentManager.getSessionFile(),
    };
    // Same label handling as Pi's createBranchedSession: drop label entries
    // and re-chain parentIds so the retained path stays a valid chain.
    const forkPath: Array<Record<string, unknown>> = [];
    let forkParentId: string | null = null;
    for (const entry of parentManager.getBranch(leafId)) {
      if (entry.type === "label") continue;
      forkPath.push({ ...entry, parentId: forkParentId });
      forkParentId = entry.id;
    }
    const copiedForkFile = join(
      forkDirs.piSessionDir,
      `${forkTimestamp.replace(/[:.]/g, "-")}_${forkPiId}.jsonl`
    );
    let activated = false;
    // A workspace session's primary is the user's own project directory
    // (spec §5.1): the fork keeps pointing at it instead of copying it into
    // the data dir. Default sessions copy their session workspace as before.
    const sourceCwd = resolve(previous.session.sessionManager.getCwd());
    const externalPrimary = !isInsideDataDir(this.config.dataDir, sourceCwd);
    try {
      if (!externalPrimary) {
        rmSync(forkDirs.sessionCwd, { recursive: true, force: true });
        cpSync(sourceCwd, forkDirs.sessionCwd, {
          recursive: true,
        });
      }
      const forkEntries = [forkHeader, ...forkPath];
      writeFileSync(
        copiedForkFile,
        `${forkEntries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
        "utf-8"
      );
      const result = await this.openManagedRuntime({
        sessionId: forkSessionId,
        sessionFile: copiedForkFile,
        sessionDirs: forkDirs,
        selectors: childSelectors,
        originalManifest: previous.manifest,
        branchId: "main",
        openedFrom: previous.openedFrom,
        resumeWarnings: previous.resumeWarnings,
        counters: previous.counters,
        transcript: previous.transcript,
        overrideSessionCwd: !externalPrimary,
        activeLeafEntryId: leafId,
        mode: previous.getMode(),
        ...(readV4SessionHeader(previous.manifest.recordsDir)?.workspace
          ? { workspace: previous.getWorkspace() }
          : {}),
        modelOverride:
          readV4SessionHeader(previous.manifest.recordsDir)?.modelOverride ??
          null,
      });
      writeJsonAtomic(
        join(result.manifest.recordsDir, "assembly-manifest.json"),
        result.manifest
      );
      const sourceHeader = readV4SessionHeader(previous.manifest.recordsDir);
      writeFoundationRecords({
        sessionRoot: forkDirs.sessionRoot,
        recordsDir: forkDirs.recordsDir,
        manifest: result.manifest,
        projectId: childSelectors.projectId ?? null,
        ownerAccountId: sourceHeader?.ownerAccountId ?? null,
        roleCondition: sourceHeader?.roleCondition ?? null,
        visibility: sourceHeader?.visibility ?? "research",
        consentSnapshot: sourceHeader?.consentSnapshot ?? null,
        lastActivityAt: result.manifest.createdAt,
        retentionDueAt: sourceHeader?.retentionDueAt ?? null,
        mode: previous.getMode(),
        workspace: sourceHeader?.workspace
          ? result.manifest.workspace
          : null,
        forkedFrom: { sessionId, purpose },
        studyTag: sourceHeader?.studyTag ?? null,
        modelOverride: sourceHeader?.modelOverride ?? null,
      });
      appendConfigEvent(result.manifest.recordsDir, {
        sessionId: result.manifest.sessionId,
        branchId: result.branchId,
        reason: "creation",
        effective: buildEffectiveConfig(
          result.manifest,
          result.selectors.projectId
        ),
        changedFields: [],
        warnings: result.resumeWarnings,
      });
      activated = true;
      result.transcript =
        readSessionDetail(this.config.dataDir, forkSessionId)?.transcript ??
        result.transcript;
      this.sessions.set(forkSessionId, result);
      appendSessionEvent(result.manifest.recordsDir, {
        sessionId: forkSessionId,
        type: "session_forked_from",
        details: {
          sourceSessionId: sessionId,
          sourceBranchId: previous.branchId,
          forkPointEntryId: leafId,
          purpose,
        },
      });
      appendSessionEvent(previous.manifest.recordsDir, {
        sessionId,
        type: "session_forked",
        details: {
          forkSessionId,
          forkPointEntryId: leafId,
          purpose,
        },
      });
      return this.snapshot(result);
    } catch (error) {
      if (!activated && existsSync(forkDirs.sessionRoot)) {
        rmSync(forkDirs.sessionRoot, { recursive: true, force: true });
      }
      throw error;
    }
  }

  /**
   * M6 Pure response comparison (spec §14.6), thin over the M5 substrate:
   * fork one Pure-pinned arm per config off the same live parent, run the
   * same prompt in every arm, and record the outputs as an ab-comparison on
   * the parent. The participant's choice/scores arrive later via the existing
   * POST endpoint; continue-from-choice is a separate, undecided step.
   */
  async generateAbComparison(
    sessionId: string,
    prompt: string,
    arms: Array<{
      label?: string | null;
      selectorOverrides?: Partial<SessionSelectors>;
    }>
  ): Promise<AbComparisonRecord> {
    if (!prompt.trim()) {
      throw new Error("A/B comparison requires a prompt");
    }
    if (arms.length < 2 || arms.length > 8) {
      throw new Error("A/B comparison takes 2-8 arms");
    }
    // Validate every arm before creating any (HTTP callers pass overrides
    // verbatim); a bad arm must not leave earlier arms behind as orphans.
    for (const arm of arms) {
      const overrides = arm.selectorOverrides;
      if (!overrides) continue;
      for (const key of Object.keys(overrides)) {
        if (
          !["projectId", "rolePresetSlug", "kbDomain", "soulSlug", "customInstructionRef"].includes(key)
        ) {
          throw new Error(`Unknown selector override: ${key}`);
        }
      }
      if (overrides.rolePresetSlug !== undefined) {
        this.resolveOptionalRolePresetPath(overrides.rolePresetSlug);
      }
      if (overrides.soulSlug !== undefined) {
        this.resolveOptionalSoulPath(overrides.soulSlug);
      }
      if (
        overrides.kbDomain !== undefined &&
        overrides.kbDomain !== KB_DISABLED_DOMAIN &&
        !isKnownKbDomain(this.config.kbDir, overrides.kbDomain)
      ) {
        throw new Error(`Unknown KB domain: ${overrides.kbDomain}`);
      }
    }
    const parent = this.requireSession(sessionId);
    if (parent.busy || parent.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    const promptEntryId = parent.session.sessionManager.getLeafId();
    // Forks are sequential (each reads the live parent); the arm runs are
    // independent sessions and execute in parallel.
    const armSnapshots: SessionSnapshot[] = [];
    for (const arm of arms) {
      const forked = await this.forkSession(
        sessionId,
        "ab-arm",
        undefined,
        arm.selectorOverrides
      );
      await this.switchMode(forked.sessionId, "pure");
      armSnapshots.push(forked);
    }
    await Promise.all(
      armSnapshots.map(
        (snap) => this.runPrompt(snap.sessionId, prompt).completion
      )
    );
    const candidates = armSnapshots.map((snap, index) => {
      const manifest = this.getManifest(snap.sessionId);
      const transcript =
        readSessionDetail(this.config.dataDir, snap.sessionId)?.transcript ??
        [];
      const lastAssistant = [...transcript]
        .reverse()
        .find((message) => message.role === "assistant");
      return {
        candidateId: snap.sessionId,
        label: arms[index].label ?? null,
        provider: manifest.provider,
        model: manifest.model,
        role: manifest.rolePreset.slug,
        instructionRef: manifest.customInstruction.ref,
        kbDomain: manifest.kb.domain,
        outputText: lastAssistant?.text?.slice(0, 20000) ?? null,
        artifact: { sessionId: snap.sessionId },
      };
    });
    return appendAbComparisonRecord(parent.manifest.recordsDir, {
      sessionId,
      trigger: "backend_request",
      prompt,
      promptEntryId,
      candidates,
    });
  }

  private runPromptWithLineage(
    managed: ManagedSession,
    text: string,
    options: {
      turnId?: string;
      supersedesRunId?: string | null;
    } = {}
  ): RunHandle {
    const sessionId = managed.manifest.sessionId;
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }

    managed.busy = true;
    managed.fallbackAttempts = 0;
    managed.counters.messageCount++;
    const turnId =
      options.turnId ?? formatCounter("turn", managed.nextTurnIndex++);
    const revisionId = formatCounter("rev", managed.nextRevisionIndex++);
    const runId = formatCounter("run", managed.nextRunIndex++);
    const acceptedAt = new Date().toISOString();
    refreshSessionRetention(managed.manifest.recordsDir, new Date(acceptedAt));
    const beforeEntryIds = new Set(
      managed.session.sessionManager.getEntries().map((entry) => entry.id)
    );

    appendRunRecord(managed.manifest.recordsDir, {
      sessionId,
      branchId: managed.branchId,
      turnId,
      revisionId,
      runId,
      status: "accepted",
      piSessionFile: managed.session.sessionFile ?? null,
      userEntryId: null,
      assistantEntryIds: [],
      supersedesRunId: options.supersedesRunId ?? null,
      acceptedAt,
      completedAt: null,
    });

    this.emitRunPhase(managed, "connecting");

    const completion = (async () => {
      let promptError: unknown = null;
      let pendingError: unknown = null;
      try {
        await managed.session.prompt(text);
      } catch (error) {
        promptError = error;
      }

      try {
        await this.waitForPendingRunWork(managed);
      } catch (error) {
        pendingError = error;
      }

      const finalError =
        managed.session.state.errorMessage ??
        (pendingError instanceof Error
          ? pendingError.message
          : pendingError
            ? String(pendingError)
            : null);
      if (finalError || /abort|interrupt/i.test(String(promptError))) {
        appendRunRecord(managed.manifest.recordsDir, {
          sessionId,
          branchId: managed.branchId,
          turnId,
          revisionId,
          runId,
          status: /abort|interrupt/i.test(String(promptError))
            ? "aborted"
            : "failed",
          piSessionFile: managed.session.sessionFile ?? null,
          userEntryId: null,
          assistantEntryIds: [],
          supersedesRunId: options.supersedesRunId ?? null,
          acceptedAt,
          completedAt: new Date().toISOString(),
        });
        throw promptError ?? pendingError ?? new Error(finalError ?? "Run failed");
      }

      const entries = managed.session.sessionManager
        .getEntries()
        .filter((entry) => !beforeEntryIds.has(entry.id));
      const userEntryId =
        entries.find(
          (entry) =>
            entry.type === "message" &&
            (entry.message as { role?: string }).role === "user"
        )?.id ?? null;
      const assistantEntryIds = entries
        .filter(
          (entry) =>
            entry.type === "message" &&
            (entry.message as { role?: string }).role === "assistant"
        )
        .map((entry) => entry.id);
      appendRunRecord(managed.manifest.recordsDir, {
        sessionId,
        branchId: managed.branchId,
        turnId,
        revisionId,
        runId,
        status: "completed",
        piSessionFile: managed.session.sessionFile ?? null,
        userEntryId,
        assistantEntryIds,
        supersedesRunId: options.supersedesRunId ?? null,
        acceptedAt,
        completedAt: new Date().toISOString(),
      });

      // Auto-name the conversation once, after its first real turn (v1.2.1).
      // Fire-and-forget: title generation must never affect the run.
      void this.maybeAutoTitle(managed);
    })().finally(() => {
      managed.busy = false;
    });

    return {
      ids: {
        sessionId,
        branchId: managed.branchId,
        turnId,
        revisionId,
        runId,
      },
      completion,
      abort: () => this.abort(sessionId, "run_handle_abort"),
    };
  }

  private async waitForPendingRunWork(managed: ManagedSession): Promise<void> {
    while (managed.pendingRunWork) {
      const pending = managed.pendingRunWork;
      try {
        await pending;
      } finally {
        if (managed.pendingRunWork === pending) {
          managed.pendingRunWork = null;
        }
      }
    }
  }

  async abort(sessionId: string, reason?: string): Promise<void> {
    const managed = this.requireSession(sessionId);
    await managed.session.abort();
    managed.busy = false;
    this.emitRunPhase(managed, "idle");
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId: managed.manifest.sessionId,
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
    const managed = this.requireSession(sessionId);
    managed.transcript =
      readSessionDetail(this.config.dataDir, sessionId)?.transcript ??
      managed.transcript;
    return [...managed.transcript];
  }

  getSelectors(sessionId: string): SessionSelectors {
    return { ...this.requireSession(sessionId).selectors };
  }

  setProjectId(sessionId: string, projectId: string | null): SessionSnapshot {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    if (managed.selectors.projectId === projectId) {
      return this.snapshot(managed);
    }
    const header = readV4SessionHeader(managed.manifest.recordsDir);
    if (!header) throw new Error("v0.4 session header is required");
    writeSessionHeader(managed.manifest.recordsDir, {
      ...header,
      projectId,
    });
    managed.selectors.projectId = projectId;
    appendConfigEvent(managed.manifest.recordsDir, {
      sessionId,
      branchId: managed.branchId,
      reason: "user_change",
      effective: buildEffectiveConfig(managed.manifest, projectId),
      changedFields: ["projectId"],
      warnings: [],
    });
    return this.snapshot(managed);
  }

  setVisibility(
    sessionId: string,
    visibility: "research" | "private",
    consentSnapshot?: SessionCreationMetadata["consentSnapshot"]
  ): SessionSnapshot {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    const header = readV4SessionHeader(managed.manifest.recordsDir);
    if (!header) throw new Error("v0.4 session header is required");
    if (header.visibility === visibility) {
      return this.snapshot(managed);
    }
    const nextBase = {
      ...header,
      visibility,
      consentSnapshot:
        visibility === "private"
          ? {
              researcherReadable: false,
              quoteAfterAnonymization: false,
              privateOverride: true,
            }
          : consentSnapshot
            ? { ...consentSnapshot, privateOverride: false }
            : header.consentSnapshot
              ? { ...header.consentSnapshot, privateOverride: false }
              : undefined,
    };
    const next =
      visibility === "private"
        ? refreshRetention(nextBase, new Date())
        : {
            ...nextBase,
            retentionDueAt: null,
          };
    writeSessionHeader(managed.manifest.recordsDir, next);
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId,
      type: "visibility_changed",
      details: { visibility },
    });
    return this.snapshot(managed);
  }

  setStudyTag(sessionId: string, studyTag: StudyTag | null): SessionSnapshot {
    const managed = this.requireSession(sessionId);
    const header = readV4SessionHeader(managed.manifest.recordsDir);
    if (!header) throw new Error("v0.4 session header is required");
    const { studyTag: _dropped, ...rest } = header;
    writeSessionHeader(
      managed.manifest.recordsDir,
      studyTag ? { ...rest, studyTag } : rest
    );
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId,
      type: "study_tag_changed",
      details: { studyTag },
    });
    return this.snapshot(managed);
  }

  /**
   * Per-session model choice (M7 §5b). Persists to the v0.4 header and, when
   * the model is resolvable in the live registry, switches the running
   * session immediately (same mechanism as the fallback chain); otherwise it
   * applies on next open. null clears back to the deployment-global config.
   */
  async setSessionModel(
    sessionId: string,
    override: SessionModelOverride | null
  ): Promise<SessionSnapshot> {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    const header = readV4SessionHeader(managed.manifest.recordsDir);
    if (!header) throw new Error("v0.4 session header is required");
    const { modelOverride: _dropped, ...rest } = header;
    writeSessionHeader(
      managed.manifest.recordsDir,
      override ? { ...rest, modelOverride: override } : rest
    );
    let applied = false;
    if (override) {
      const resolved = managed.session.modelRegistry.find(
        override.provider,
        override.modelId
      );
      if (resolved) {
        await managed.session.setModel(resolved);
        managed.manifest.provider = override.provider;
        managed.manifest.model = override.modelId;
        this.persistManifestModel(managed);
        applied = true;
      }
      if (override.thinkingLevel) {
        managed.session.setThinkingLevel(override.thinkingLevel);
      }
    } else {
      const base = this.resolveEffectiveRuntimeModelConfig();
      const resolved =
        base.modelProvider && base.modelId
          ? managed.session.modelRegistry.find(base.modelProvider, base.modelId)
          : undefined;
      if (resolved) {
        await managed.session.setModel(resolved);
        managed.manifest.provider = base.modelProvider!;
        managed.manifest.model = base.modelId!;
        this.persistManifestModel(managed);
        applied = true;
      }
      managed.session.setThinkingLevel(this.config.thinkingLevel ?? "off");
    }
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId,
      type: "model_override_changed",
      details: { override, appliedLive: applied },
    });
    return this.snapshot(managed);
  }

  async disposeAll(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(sessions.map((managed) => this.disposeManaged(managed)));
  }

  private async createManagedFromDirs(
    sessionDirs: SessionDirectories,
    selectors: SessionSelectors,
    metadata: SessionCreationMetadata = {},
    runtimeModelConfig = this.resolveEffectiveRuntimeModelConfig()
  ): Promise<ManagedSession> {
    const rolePresetPath = this.resolveOptionalRolePresetPath(
      selectors.rolePresetSlug
    );
    const soulPath = this.resolveOptionalSoulPath(selectors.soulSlug);
    const instruction = this.resolveOptionalInstruction(
      selectors.customInstructionRef
    );
    // Workspace (spec §5.1): the primary directory replaces the default
    // session workspace as Pi's cwd. The session's own workspace dir stays
    // as the Alt writable root (writeDir), untouched.
    const primaryDir = metadata.workspace?.primaryDir
      ? resolve(metadata.workspace.primaryDir)
      : null;
    if (primaryDir && !statSync(primaryDir, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Workspace primary directory does not exist: ${primaryDir}`);
    }
    const result = await createAltTheorySession({
      ...sessionDirs,
      ...(primaryDir ? { sessionCwd: primaryDir } : {}),
      workspaceDirs: metadata.workspace?.additionalDirs,
      appContextPath: this.config.assetPaths.appContextPath,
      soulPath,
      soulSlug: selectors.soulSlug,
      rolePresetPath,
      rolePresetSlug: selectors.rolePresetSlug,
      customInstructionPath: instruction?.path ?? null,
      customInstructionRef: instruction?.ref ?? null,
      kbDir: this.config.kbDir,
      kbDomain: selectors.kbDomain,
      piPromptTemplatesDir: this.config.assetPaths.piPromptTemplatesDir,
      ...runtimeModelConfig,
      ...(metadata.modelOverride
        ? {
            modelProvider: metadata.modelOverride.provider,
            modelId: metadata.modelOverride.modelId,
          }
        : {}),
      thinkingLevel:
        metadata.modelOverride?.thinkingLevel ?? this.config.thinkingLevel,
      promptMode: metadata.mode
        ? promptModeFromCapabilityMode(metadata.mode)
        : this.config.promptMode,
      resourceDiscovery: this.config.resourceDiscovery,
      skillsDir: this.config.skillsDir,
      runLabel: this.config.runLabel,
      testBatch: this.config.testBatch,
      readOnly: this.config.readOnly,
      externalSkillPaths: this.config.resolveExternalSkillPaths?.(),
      extensionFactories: this.config.extensionFactories,
    });
    const visibility = metadata.visibility ?? "research";
    const consentSnapshot =
      visibility === "private"
        ? {
            researcherReadable: metadata.consentSnapshot?.researcherReadable ?? false,
            quoteAfterAnonymization:
              metadata.consentSnapshot?.quoteAfterAnonymization ?? false,
            privateOverride: true,
          }
        : metadata.consentSnapshot ?? null;
    writeFoundationRecords({
      sessionRoot: sessionDirs.sessionRoot,
      recordsDir: sessionDirs.recordsDir,
      manifest: result.manifest,
      projectId: selectors.projectId ?? null,
      ownerAccountId: metadata.ownerAccountId ?? null,
      roleCondition: metadata.roleCondition ?? null,
      visibility,
      consentSnapshot,
      lastActivityAt: result.manifest.createdAt,
      retentionDueAt:
        visibility === "private"
          ? calculateRetentionDueAt(result.manifest.createdAt)
          : null,
      mode: result.getMode(),
      workspace: metadata.workspace ? result.manifest.workspace : null,
      forkedFrom: metadata.forkedFrom ?? null,
      studyTag: metadata.studyTag ?? null,
      modelOverride: metadata.modelOverride ?? null,
    });

    const managed = await this.createManaged({
      ...result,
      selectors,
      openedFrom: "new",
      resumeWarnings: [],
      counters: { messageCount: 0, toolCallCount: 0, turnCount: 0 },
      transcript: [],
    });
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId: managed.manifest.sessionId,
      type: "session_created",
      details: {
        kbDomain: selectors.kbDomain,
        rolePresetSlug: selectors.rolePresetSlug,
        soulSlug: selectors.soulSlug,
        visibility,
        model: managed.manifest.model,
        provider: managed.manifest.provider,
      },
    });
    return managed;
  }

  async createRelatedSession(
    sessionId: string,
    purpose: "side" | "helper",
    forkPointEntryId?: string
  ): Promise<SessionSnapshot> {
    if (purpose === "side") {
      return this.forkSession(sessionId, purpose, forkPointEntryId);
    }

    const parent = this.requireSession(sessionId);
    if (parent.busy || parent.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    const header = readV4SessionHeader(parent.manifest.recordsDir);
    const child = await this.createSession(parent.selectors, {
      ownerAccountId: header?.ownerAccountId ?? null,
      roleCondition: header?.roleCondition ?? null,
      visibility: header?.visibility ?? "research",
      consentSnapshot: header?.consentSnapshot ?? null,
      workspace: header?.workspace ?? null,
      studyTag: header?.studyTag ?? null,
      modelOverride: header?.modelOverride ?? null,
      forkedFrom: { sessionId, purpose },
      mode: parent.getMode(),
    });
    appendSessionEvent(parent.manifest.recordsDir, {
      sessionId,
      type: "related_session_created",
      details: { childSessionId: child.sessionId, purpose },
    });
    appendSessionEvent(this.requireSession(child.sessionId).manifest.recordsDir, {
      sessionId: child.sessionId,
      type: "session_forked_from",
      details: { sourceSessionId: sessionId, purpose, freshContext: true },
    });
    return child;
  }

  promoteRelatedSession(sessionId: string): SessionSnapshot | null {
    const dirs = getSessionDirs(this.config.dataDir, sessionId);
    if (!dirs) throw new Error(`Unknown session id: ${sessionId}`);
    const header = readV4SessionHeader(dirs.recordsDir);
    if (!header?.forkedFrom) {
      throw new Error("Only a related child can be promoted");
    }
    if (!(["side", "helper"] as ForkPurpose[]).includes(header.forkedFrom.purpose)) {
      throw new Error("This related conversation is already a normal branch");
    }
    const previousPurpose = header.forkedFrom.purpose;
    writeSessionHeader(dirs.recordsDir, {
      ...header,
      forkedFrom: { ...header.forkedFrom, purpose: "fork" },
    });
    appendSessionEvent(dirs.recordsDir, {
      sessionId,
      type: "related_session_promoted",
      details: { previousPurpose, purpose: "fork" },
    });
    const live = this.sessions.get(sessionId);
    return live ? this.snapshot(live) : null;
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

    const effectiveConfig = detail.effectiveConfig;
    const effectiveCustomInstructionRef =
      effectiveConfig?.customInstruction?.ref ?? null;
    const requestedRoleSlug =
      effectiveConfig?.rolePresetSlug ?? detail.manifest?.rolePreset?.slug;
    const activeRolePresetSlug = this.activeOptionalSlug(
      requestedRoleSlug,
      fallbackSelectors.rolePresetSlug,
      (slug) => this.resolveOptionalRolePresetPath(slug)
    );
    const requestedSoulSlug =
      effectiveConfig?.soulSlug ?? detail.manifest?.soul?.slug;
    const activeSoulSlug = this.activeOptionalSlug(
      requestedSoulSlug,
      fallbackSelectors.soulSlug,
      (slug) => this.resolveOptionalSoulPath(slug)
    );
    // Pre-release compat policy: assets referenced by old sessions may vanish
    // between alpha builds. Falling back is fine; doing it silently is not —
    // surface every substitution as a resume warning in the conversation.
    const assetWarnings: string[] = [];
    if (
      typeof requestedRoleSlug === "string" &&
      activeRolePresetSlug !== requestedRoleSlug
    ) {
      assetWarnings.push(
        `This conversation's original role "${requestedRoleSlug}" is not in this build — continuing with ${
          activeRolePresetSlug ? `"${activeRolePresetSlug}"` : "no role"
        }.`
      );
    }
    if (
      typeof requestedSoulSlug === "string" &&
      activeSoulSlug !== requestedSoulSlug
    ) {
      assetWarnings.push(
        `This conversation's original soul "${requestedSoulSlug}" is not in this build — continuing with ${
          activeSoulSlug ? `"${activeSoulSlug}"` : "no soul"
        }.`
      );
    }
    const originalDomain =
      effectiveConfig?.kbDomain ??
      detail.manifest?.kb?.domain ??
      detail.manifest?.kbDomain ??
      null;
    const activeDomain =
      originalDomain === KB_DISABLED_DOMAIN
        ? KB_DISABLED_DOMAIN
        : originalDomain && isKnownKbDomain(this.config.kbDir, originalDomain)
          ? originalDomain
          : fallbackSelectors.kbDomain;
    if (originalDomain && activeDomain !== originalDomain) {
      assetWarnings.push(
        `This conversation's original knowledge domain "${originalDomain}" is not in this build — continuing with "${activeDomain}".`
      );
    }
    const activeInstructionRef = this.activeInstructionRef(
      effectiveCustomInstructionRef ?? detail.manifest?.customInstruction?.ref,
      fallbackSelectors.customInstructionRef
    );
    const instruction = this.resolveOptionalInstruction(activeInstructionRef);
    const persistedHeader = readV4SessionHeader(sessionDirs.recordsDir);
    const persistedMode =
      persistedHeader?.mode ??
      capabilityModeFromPromptMode(this.config.promptMode);

    // Stale-workspace recovery (v1.2.1): the recorded working folder can vanish
    // between sessions (rename / merge / delete). Don't point Pi's cwd at a dead
    // path — open without a workspace and surface a visible notice so the user
    // can re-point (drag onto a folder / folder selector) or continue without.
    // The persisted header is NOT mutated; the old path stays until the user acts.
    const persistedPrimaryDir = persistedHeader?.workspace?.primaryDir ?? null;
    const workspaceMissing =
      !!persistedPrimaryDir &&
      !statSync(persistedPrimaryDir, { throwIfNoEntry: false })?.isDirectory();
    if (workspaceMissing) {
      assetWarnings.push(
        `This conversation's working folder "${persistedPrimaryDir}" no longer exists — continuing without a working folder. Drag the conversation onto a folder, or use the folder selector, to keep working there.`
      );
    }

    const openArgs = {
      ...sessionDirs,
      // Workspace sessions keep their user-chosen primary directory as cwd
      // across reopen (spec §5.1); default sessions keep the data-dir one.
      ...(persistedHeader?.workspace && !workspaceMissing
        ? { sessionCwd: persistedHeader.workspace.primaryDir }
        : {}),
      workspaceDirs: workspaceMissing
        ? undefined
        : persistedHeader?.workspace?.additionalDirs,
      sessionFile: detail.pi.sessionFile,
      originalManifest: detail.manifest,
      appContextPath: this.config.assetPaths.appContextPath,
      soulPath: this.resolveOptionalSoulPath(activeSoulSlug),
      soulSlug: activeSoulSlug,
      rolePresetPath: this.resolveOptionalRolePresetPath(activeRolePresetSlug),
      rolePresetSlug: activeRolePresetSlug,
      customInstructionPath: instruction?.path ?? null,
      customInstructionRef: instruction?.ref ?? null,
      kbDir: this.config.kbDir,
      kbDomain: activeDomain,
      piPromptTemplatesDir: this.config.assetPaths.piPromptTemplatesDir,
      ...this.modelArgsFor(persistedHeader?.modelOverride),
      promptMode: promptModeFromCapabilityMode(persistedMode),
      resourceDiscovery: this.config.resourceDiscovery,
      skillsDir: this.config.skillsDir,
      runLabel: this.config.runLabel,
      testBatch: this.config.testBatch,
      readOnly: this.config.readOnly,
      externalSkillPaths: this.config.resolveExternalSkillPaths?.(),
      extensionFactories: this.config.extensionFactories,
    };
    // Model-on-resume recovery (v1.2.1 item 2): a per-session model override can
    // point at a model that's since been removed from config — core then throws
    // "Unknown model" and the reopen fails. Don't block: fall back to the default
    // model and surface a visible notice. The stale override stays in the header
    // (not mutated) so if the model returns, a later reopen restores it.
    let result;
    try {
      result = await openAltTheorySession(openArgs);
    } catch (err) {
      const override = persistedHeader?.modelOverride;
      if (!override || !isUnknownModelError(err)) throw err;
      const fallback = this.modelArgsFor(null);
      assetWarnings.push(
        `The model this conversation used (${override.provider}/${override.modelId}) is no longer available — switched to ${
          fallback.modelId ?? "the default model"
        }. Your next message will use it; you can pick another model any time.`
      );
      result = await openAltTheorySession({ ...openArgs, ...fallback });
    }
    alignSessionManagerToLatestRun(
      result.session.sessionManager,
      latestRunSnapshots(result.manifest.recordsDir),
      "latest active run"
    );

    const managed = await this.createManaged({
      ...result,
      selectors: {
        projectId: detail.session.projectId ?? fallbackSelectors.projectId ?? null,
        rolePresetSlug: activeRolePresetSlug,
        kbDomain: activeDomain,
        soulSlug: activeSoulSlug,
        customInstructionRef: activeInstructionRef,
      },
      openedFrom: "existing",
      resumeWarnings: [...assetWarnings, ...result.resumeWarnings],
      counters: {
        messageCount: detail.metrics?.messageCount ?? 0,
        toolCallCount: detail.metrics?.toolCallCount ?? 0,
        turnCount: detail.metrics?.turnCount ?? 0,
      },
      transcript: detail.transcript,
      branchId: "main",
    });
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId: managed.manifest.sessionId,
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
      sessionId: managed.manifest.sessionId,
      type: "session_resumed",
      details: {
        model: managed.manifest.model,
        provider: managed.manifest.provider,
      },
    });
    if (managed.resumeWarnings.length > 0) {
      appendSessionEvent(managed.manifest.recordsDir, {
        sessionId: managed.manifest.sessionId,
        type: "resume_warning",
        details: {
          warningCount: managed.resumeWarnings.length,
          warnings: managed.resumeWarnings.join(" | "),
        },
      });
    }
    const fallbackChangedFields = configChangedFields(
      {
        rolePresetSlug:
          effectiveConfig?.rolePresetSlug ??
          detail.manifest?.rolePreset?.slug ??
          null,
        kbDomain: originalDomain ?? fallbackSelectors.kbDomain,
        soulSlug:
          effectiveConfig?.soulSlug ?? detail.manifest?.soul?.slug ?? null,
        customInstructionRef:
          effectiveCustomInstructionRef ??
          detail.manifest?.customInstruction?.ref ??
          null,
      },
      managed.selectors
    );
    if (fallbackChangedFields.length > 0) {
      appendConfigEvent(managed.manifest.recordsDir, {
        sessionId: managed.manifest.sessionId,
        reason: "resume_fallback",
        effective: buildEffectiveConfig(
          managed.manifest,
          managed.selectors.projectId
        ),
        changedFields: fallbackChangedFields,
        warnings: managed.resumeWarnings,
        branchId: managed.branchId,
      });
    }
    return managed;
  }

  private async createManagedFromExistingWithSelectors(
    sessionId: string,
    selectors: SessionSelectors,
    previous: ManagedSession
  ): Promise<ManagedSession> {
    const detail = readSessionDetail(this.config.dataDir, sessionId);
    const sessionFile = detail?.pi.sessionFile ?? previous.session.sessionFile;
    if (!sessionFile) {
      throw new Error(
        `Session cannot be reconfigured because Pi JSONL is missing: ${sessionId}`
      );
    }
    const sessionDirs = getSessionDirs(this.config.dataDir, sessionId);
    if (!sessionDirs) {
      throw new Error(`Invalid session id: ${sessionId}`);
    }

    const activeSessionDirs = {
      ...sessionDirs,
      sessionCwd: previous.manifest.sessionCwd ?? sessionDirs.sessionCwd,
    };
    const persistedMode = previous.getMode();
    const result = await openAltTheorySession({
      ...activeSessionDirs,
      workspaceDirs: previous.getWorkspace().additionalDirs,
      sessionFile,
      originalManifest: detail?.manifest ?? previous.manifest,
      appContextPath: this.config.assetPaths.appContextPath,
      soulPath: this.resolveOptionalSoulPath(selectors.soulSlug),
      soulSlug: selectors.soulSlug,
      rolePresetPath: this.resolveOptionalRolePresetPath(selectors.rolePresetSlug),
      rolePresetSlug: selectors.rolePresetSlug,
      customInstructionPath: this.resolveOptionalInstruction(
        selectors.customInstructionRef
      )?.path,
      customInstructionRef: selectors.customInstructionRef ?? null,
      kbDir: this.config.kbDir,
      kbDomain: selectors.kbDomain,
      piPromptTemplatesDir: this.config.assetPaths.piPromptTemplatesDir,
      ...this.modelArgsFor(
        readV4SessionHeader(sessionDirs.recordsDir)?.modelOverride
      ),
      promptMode: promptModeFromCapabilityMode(persistedMode),
      resourceDiscovery: this.config.resourceDiscovery,
      skillsDir: this.config.skillsDir,
      runLabel: this.config.runLabel,
      testBatch: this.config.testBatch,
      readOnly: this.config.readOnly,
      externalSkillPaths: this.config.resolveExternalSkillPaths?.(),
      extensionFactories: this.config.extensionFactories,
      overrideSessionCwd: true,
    });
    if (detail) {
      alignSessionManagerToLatestRun(
        result.session.sessionManager,
        latestRunSnapshots(result.manifest.recordsDir),
        "latest active run"
      );
    }

    return await this.createManaged({
      ...result,
      selectors,
      openedFrom: previous.openedFrom,
      resumeWarnings: result.resumeWarnings,
      counters: previous.counters,
      transcript: previous.transcript,
      branchId: previous.branchId,
    });
  }

  private async openManagedRuntime(args: {
    sessionId: string;
    sessionFile: string;
    sessionDirs: SessionDirectories;
    selectors: SessionSelectors;
    originalManifest: AssemblyManifest;
    branchId: string;
    openedFrom: "new" | "existing";
    resumeWarnings: string[];
    counters: SessionCounters;
    transcript: TranscriptMessage[];
    overrideSessionCwd: boolean;
    activeLeafEntryId?: string | null;
    mode?: CapabilityMode;
    workspace?: { primaryDir: string; additionalDirs: string[] };
    modelOverride?: SessionModelOverride | null;
  }): Promise<ManagedSession> {
    const instruction = this.resolveOptionalInstruction(
      args.selectors.customInstructionRef
    );
    const persistedHeader = readV4SessionHeader(args.sessionDirs.recordsDir);
    const persistedMode =
      args.mode ??
      persistedHeader?.mode ??
      capabilityModeFromPromptMode(this.config.promptMode);
    const persistedWorkspace = args.workspace ?? persistedHeader?.workspace;
    const result = await openAltTheorySession({
      ...args.sessionDirs,
      // Workspace sessions keep their primary directory as cwd unless the
      // caller forces the data-dir workspace (copy-based forks).
      ...(persistedWorkspace && !args.overrideSessionCwd
        ? { sessionCwd: persistedWorkspace.primaryDir }
        : {}),
      workspaceDirs: persistedWorkspace?.additionalDirs,
      sessionId: args.sessionId,
      sessionFile: args.sessionFile,
      originalManifest: args.originalManifest,
      overrideSessionCwd: args.overrideSessionCwd,
      appContextPath: this.config.assetPaths.appContextPath,
      soulPath: this.resolveOptionalSoulPath(args.selectors.soulSlug),
      soulSlug: args.selectors.soulSlug,
      rolePresetPath: this.resolveOptionalRolePresetPath(
        args.selectors.rolePresetSlug
      ),
      rolePresetSlug: args.selectors.rolePresetSlug,
      customInstructionPath: instruction?.path ?? null,
      customInstructionRef: instruction?.ref ?? null,
      kbDir: this.config.kbDir,
      kbDomain: args.selectors.kbDomain,
      piPromptTemplatesDir: this.config.assetPaths.piPromptTemplatesDir,
      ...this.modelArgsFor(args.modelOverride ?? persistedHeader?.modelOverride),
      promptMode: promptModeFromCapabilityMode(persistedMode),
      resourceDiscovery: this.config.resourceDiscovery,
      skillsDir: this.config.skillsDir,
      runLabel: this.config.runLabel,
      testBatch: this.config.testBatch,
      readOnly: this.config.readOnly,
      externalSkillPaths: this.config.resolveExternalSkillPaths?.(),
      extensionFactories: this.config.extensionFactories,
    });
    if ("activeLeafEntryId" in args) {
      alignSessionManagerLeaf(
        result.session.sessionManager,
        args.activeLeafEntryId ?? null,
        `current Pi leaf for ${args.branchId}`
      );
    }
    return await this.createManaged({
      ...result,
      selectors: args.selectors,
      openedFrom: args.openedFrom,
      resumeWarnings: args.resumeWarnings,
      counters: args.counters,
      transcript: args.transcript,
      branchId: args.branchId,
    });
  }

  private async createManaged(args: {
    session: AgentSession;
    manifest: AssemblyManifest;
    getMode: () => CapabilityMode;
    setMode: (mode: CapabilityMode) => Promise<void>;
    getWorkspace: () => { primaryDir: string; additionalDirs: string[] };
    addWorkspaceDir: (dir: string) => Promise<string[]>;
    selectors: SessionSelectors;
    openedFrom: "new" | "existing";
    resumeWarnings: string[];
    counters: SessionCounters;
    transcript: TranscriptMessage[];
    branchId?: string;
  }): Promise<ManagedSession> {
    const persistedRuns = latestRunSnapshots(args.manifest.recordsDir);
    const approvalBridge = new ApprovalBridge({
      onRequest: (request) =>
        this.emit(managed, { type: "approval_requested", payload: request }),
      onResolve: (approvalId, resolution) =>
        this.emit(managed, {
          type: "approval_resolved",
          payload: { approvalId, resolution },
        }),
      onNotify: (message, level) =>
        this.emit(managed, {
          type: "extension_notice",
          payload: { message, level },
        }),
    });
    const managed: ManagedSession = {
      ...args,
      approvalBridge,
      listeners: new Set(),
      internalUnsubscribe: () => {},
      busy: false,
      nextTurnIndex: Math.max(
        1,
        args.counters.turnCount + 1,
        maxCounter(persistedRuns.map((run) => run.turnId), "turn") + 1
      ),
      nextRevisionIndex:
        maxCounter(persistedRuns.map((run) => run.revisionId), "rev") + 1,
      nextRunIndex:
        maxCounter(persistedRuns.map((run) => run.runId), "run") + 1,
      branchId: args.branchId ?? "main",
      fallbackAttempts: 0,
      pendingRunWork: null,
    };
    managed.internalUnsubscribe = managed.session.subscribe((event) =>
      this.handleAgentEvent(managed, event)
    );
    // Approval bridge (spec §5.2): hand Pi extensions a dialog-capable UI
    // context backed by the web UI. Bound before the session is returned so
    // extension mediation is in place before any prompt can run.
    await managed.session.bindExtensions({
      uiContext: approvalBridge.uiContext,
      mode: "rpc",
    });
    return managed;
  }

  private requireLatestActiveCompletedUserRun(
    managed: ManagedSession,
    action: "revise" | "delete"
  ): RunRecord & { userEntryId: string } {
    const allRuns = latestRunSnapshots(managed.manifest.recordsDir).filter(
      (run) => run.branchId === managed.branchId
    );
    // Entry IDs whose runs are deleted or superseded remain in Pi's persisted tree
    // for evidence, but no longer count as active transcript turns.
    const inactiveUserEntryIds = new Set(
      allRuns
        .filter((run) => run.status === "deleted" || run.status === "superseded")
        .map((run) => run.userEntryId)
        .filter(Boolean) as string[]
    );
    const latest = allRuns
      .filter((run) => run.status === "completed" && run.userEntryId)
      .at(-1);
    if (!latest?.userEntryId) {
      throw new Error(`No completed latest user turn is available to ${action}`);
    }
    const activeUserEntries = managed.session.sessionManager
      .getBranch()
      .filter(
        (entry) =>
          entry.type === "message" &&
          (entry.message as { role?: string }).role === "user" &&
          !inactiveUserEntryIds.has(entry.id)
      );
    if (activeUserEntries.at(-1)?.id !== latest.userEntryId) {
      throw new Error(
        `Only the current latest user turn can be ${action === "revise" ? "revised" : "deleted"}`
      );
    }
    return latest as RunRecord & { userEntryId: string };
  }

  private async finalizeRunFailure(managed: ManagedSession): Promise<void> {
    let error = managed.session.state.errorMessage;
    if (!error) {
      return;
    }
    try {
      if (await this.tryModelFallback(managed, error)) {
        return;
      }
    } catch (fallbackError) {
      error =
        fallbackError instanceof Error
          ? fallbackError.message
          : String(fallbackError);
      managed.session.state.errorMessage = error;
    }
    managed.busy = false;
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId: managed.manifest.sessionId,
      type: "run_failed",
      details: { error },
    });
    this.emitRunPhase(managed, "idle");
    this.emit(managed, { type: "run_failed", payload: { error } });
  }

  private async tryModelFallback(
    managed: ManagedSession,
    error: string
  ): Promise<boolean> {
    const coordinator = this.modelFallback;
    if (!coordinator?.isEnabled()) {
      return false;
    }

    const currentModel = managed.session.model;
    if (!currentModel) {
      return false;
    }
    if (currentModel.provider !== coordinator.provider) {
      return false;
    }

    const decision = coordinator.evaluate(error);
    if (decision.action !== "exclude_and_fallback") {
      return false;
    }

    managed.fallbackAttempts += 1;
    if (managed.fallbackAttempts > coordinator.maxFallbacksPerRun) {
      return false;
    }

    coordinator.exclude(
      currentModel.provider,
      currentModel.id,
      decision.ruleId ?? "unknown",
      error
    );

    let chainCursor = currentModel.id;
    let next: ModelRef | null = null;
    let resolved = null;
    const triedModelIds = new Set<string>();
    while (true) {
      next = coordinator.resolveNext(chainCursor);
      if (!next || triedModelIds.has(next.modelId)) {
        return false;
      }
      triedModelIds.add(next.modelId);
      resolved = managed.session.modelRegistry.find(
        next.provider,
        next.modelId
      );
      if (resolved) {
        break;
      }
      chainCursor = next.modelId;
    }

    await managed.session.setModel(resolved);
    managed.manifest.provider = next.provider;
    managed.manifest.model = next.modelId;
    this.persistManifestModel(managed);

    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId: managed.manifest.sessionId,
      type: "model_fallback",
      details: {
        fromModel: currentModel.id,
        toModel: next.modelId,
        ruleId: decision.ruleId ?? "unknown",
        error,
      },
    });

    await continueAgentTurnAfterModelSwitch(managed.session);
    return true;
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
      case "message_update": {
        const assistantEvent = event.assistantMessageEvent;
        if (assistantEvent?.type === "thinking_delta") {
          this.emitRunPhase(managed, "thinking");
          this.emit(managed, {
            type: "thinking_delta",
            payload: { text: assistantEvent.delta ?? "" },
          });
        } else if (assistantEvent?.type === "text_delta") {
          this.emitRunPhase(managed, "idle");
          this.emit(managed, {
            type: "assistant_delta",
            payload: { text: assistantEvent.delta ?? "" },
          });
        }
        break;
      }
      case "tool_execution_start":
        this.emitRunPhase(managed, "idle");
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
        if (managed.busy || managed.session.isStreaming) {
          this.emitRunPhase(managed, "connecting");
        }
        break;
      case "agent_end": {
        if (event.willRetry) {
          // Pi auto-retries this error and emits another agent_end afterwards;
          // finalizing now would double-handle the failure.
          break;
        }
        const error = managed.session.state.errorMessage;
        if (error) {
          const pending = this.finalizeRunFailure(managed);
          managed.pendingRunWork = pending;
          void pending.catch(() => {});
        } else {
          managed.busy = false;
          managed.fallbackAttempts = 0;
          this.syncManifestModelFromSession(managed);
          managed.counters.turnCount++;
          const metrics = this.persistMetrics(managed);
          appendSessionEvent(managed.manifest.recordsDir, {
            sessionId: managed.manifest.sessionId,
            type: "run_completed",
            details: {
              turnCount: managed.counters.turnCount,
              toolCallCount: managed.counters.toolCallCount,
            },
          });
          this.emitRunPhase(managed, "idle");
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

  private emitRunPhase(
    managed: ManagedSession,
    phase: "connecting" | "thinking" | "idle"
  ): void {
    this.emit(managed, { type: "run_phase", payload: { phase } });
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
      sessionId: managed.manifest.sessionId,
      projectId: managed.selectors.projectId ?? null,
      visibility:
        readV4SessionHeader(managed.manifest.recordsDir)?.visibility ??
        "research",
      status: managed.session.isStreaming ? "running" : "idle",
      currentDomain: managed.selectors.kbDomain,
      rolePresetSlug: managed.selectors.rolePresetSlug,
      soulSlug: managed.selectors.soulSlug,
      customInstructionRef: managed.selectors.customInstructionRef ?? null,
      mode: managed.getMode(),
      workspace: managed.getWorkspace(),
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
    managed.approvalBridge.disposeAll();
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

  private resolveOptionalInstruction(ref: string | null | undefined) {
    return ref
      ? loadInstructionAsset(
          this.config.instructionsDir ??
            this.config.assetPaths.instructionsDir ??
            `${this.config.assetPaths.rootDir}/instructions`,
          ref
        )
      : null;
  }

  private activeInstructionRef(
    original: string | null | undefined,
    fallback: string | null | undefined
  ): string | null {
    if (original === null) return null;
    if (original) {
      try {
        this.resolveOptionalInstruction(original);
        return original;
      } catch {
        // Fall through to the current selector fallback.
      }
    }
    return fallback ?? null;
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

function maxCounter(values: string[], prefix: string): number {
  return values.reduce((max, value) => {
    const match = new RegExp(`^${prefix}-(\\d+)$`).exec(value);
    return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
  }, 0);
}

function runRecordBody(
  record: RunRecord
): Omit<RunRecord, "schemaVersion" | "recordType" | "status"> {
  const {
    schemaVersion: _schemaVersion,
    recordType: _recordType,
    status: _status,
    ...body
  } = record;
  return body;
}

function alignSessionManagerLeaf(
  sessionManager: {
    branch(entryId: string): void;
    getEntry(entryId: string): unknown;
    resetLeaf(): void;
  },
  activeLeafEntryId: string | null,
  context: string
): void {
  if (!activeLeafEntryId) {
    sessionManager.resetLeaf();
    return;
  }
  if (!sessionManager.getEntry(activeLeafEntryId)) {
    throw new Error(
      `Cannot restore ${context}: active leaf is missing from Pi history`
    );
  }
  sessionManager.branch(activeLeafEntryId);
}

function alignSessionManagerToLatestRun(
  sessionManager: {
    branch(entryId: string): void;
    getEntry(entryId: string): unknown;
    resetLeaf(): void;
  },
  latestRuns: RunRecord[],
  context: string
): void {
  // Imported sessions have valid Pi history before Alt Theory has produced a
  // run record. SessionManager.open() already points at that history's final
  // entry, so only persisted Alt Theory run state should override the leaf.
  if (latestRuns.length === 0) return;
  alignSessionManagerLeaf(
    sessionManager,
    latestActiveLeafEntryId(latestRuns),
    context
  );
}

function configChangedFields(
  before: SessionSelectors,
  after: SessionSelectors
): string[] {
  const fields: string[] = [];
  if ((before.projectId ?? null) !== (after.projectId ?? null)) {
    fields.push("projectId");
  }
  if (before.kbDomain !== after.kbDomain) fields.push("kbDomain");
  if (before.rolePresetSlug !== after.rolePresetSlug) {
    fields.push("rolePresetSlug");
  }
  if (before.soulSlug !== after.soulSlug) fields.push("soulSlug");
  if (
    (before.customInstructionRef ?? null) !==
    (after.customInstructionRef ?? null)
  ) {
    fields.push("customInstructionRef");
  }
  return fields;
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

/** Whether a session cwd lives inside the app data dir (a managed session
 * workspace) as opposed to a user project directory (spec §5.1 primary). */
function isInsideDataDir(dataDir: string, target: string): boolean {
  const relativePath = relative(resolve(dataDir), resolve(target));
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

/** True when core rejected the requested model as unresolvable (removed from
 *  config). Matches the message thrown by createAltTheorySession. */
export function isUnknownModelError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("Unknown model");
}

// --- Auto-title helpers (v1.2.1) -------------------------------------------

/** A bare completion (no app system prompt, no tools) that returns a short
 *  title, or null on any failure. */
async function completeTitle(
  model: Model<any> | undefined,
  firstUser: string
): Promise<string | null> {
  if (!model) return null;
  try {
    const result = await completeSimple(model, {
      messages: [
        {
          role: "user",
          content:
            "Give a short 5-8 word title for a conversation that begins with " +
            "the message below. Reply with only the title — no quotes, no " +
            "trailing punctuation.\n\n" +
            firstUser.slice(0, 2000),
          timestamp: Date.now(),
        },
      ],
    });
    const text = (result.content ?? [])
      .filter(
        (part): part is { type: "text"; text: string } =>
          !!part && (part as { type?: string }).type === "text"
      )
      .map((part) => part.text)
      .join(" ");
    return cleanTitle(text);
  } catch {
    return null;
  }
}

/** First genuine user message text; skill invocations strip to empty and are
 *  skipped so a title is never built from a skill wrapper. */
function firstUserMessageText(entries: unknown[]): string {
  for (const entry of entries) {
    const e = entry as {
      type?: string;
      message?: { role?: string; content?: unknown };
    };
    if (e.type !== "message" || e.message?.role !== "user") continue;
    const text = stripSkillWrapper(contentToText(e.message.content)).trim();
    if (text) return text;
  }
  return "";
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string"
          ? part
          : part && typeof part === "object" && "text" in part
            ? String((part as { text?: unknown }).text ?? "")
            : ""
      )
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object" && "text" in content) {
    return String((content as { text?: unknown }).text ?? "");
  }
  return "";
}

/** Normalize a model's reply into a clean short title: first line, quotes and
 *  trailing punctuation stripped, capped at 8 words / 60 chars. */
export function cleanTitle(raw: string): string | null {
  let t = (raw.split(/\r?\n/)[0] ?? "").trim();
  t = t
    .replace(/^["'“”\s]+/, "")
    .replace(/["'“”.\s]+$/, "")
    .trim();
  if (!t) return null;
  const words = t.split(/\s+/);
  if (words.length > 8) t = words.slice(0, 8).join(" ");
  if (t.length > 60) t = t.slice(0, 60).trim();
  return t || null;
}
