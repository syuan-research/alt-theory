import { cpSync, existsSync, rmSync } from "fs";
import type {
  AgentSession,
  AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import {
  createAltTheorySession,
  KB_DISABLED_DOMAIN,
  openAltTheorySession,
  type AssemblyManifest,
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
import { join } from "path";
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
  readBranchIndex,
  readV4SessionHeader,
  resolveBranchWorkspace,
  writeFoundationRecords,
  writeSessionHeader,
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
  addAndActivateBranch,
  allocateBranchId,
  appendRunRecord,
  latestRunSnapshots,
  type RunRecord,
  updateBranchHead,
} from "./lineage-records.js";
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
  coreSoulPath?: string;
  coreSoulModulesDir?: string;
  coreSoulModules?: string[];
  resolveRuntimeModelConfig?: () => RuntimeModelConfig;
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
}

export type ForkPurpose = "collaboration" | "comparison";

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
  branchId: string;
  fallbackAttempts: number;
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
    const managed = await this.createManagedFromExisting(
      sessionId,
      fallbackSelectors
    );
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
    return this.runPrompt(
      sessionId,
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
    return this.runPromptWithLineage(managed, text);
  }

  reviseLatest(sessionId: string, text: string): RunHandle {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    const latest = this.requireLatestActiveCompletedUserRun(managed, "revise");
    const userEntry = managed.session.sessionManager.getEntry(latest.userEntryId);
    if (!userEntry) {
      throw new Error("Latest user entry is missing from Pi history");
    }
    if (userEntry.parentId) {
      managed.session.sessionManager.branch(userEntry.parentId);
    } else {
      managed.session.sessionManager.resetLeaf();
    }
    appendRunRecord(managed.manifest.recordsDir, {
      ...runRecordBody(latest),
      status: "superseded",
      completedAt: new Date().toISOString(),
    });
    return this.runPromptWithLineage(managed, text, {
      turnId: latest.turnId,
      supersedesRunId: latest.runId,
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
    updateBranchHead(managed.manifest.recordsDir, managed.branchId, {
      activePiSessionFile: managed.session.sessionFile ?? null,
      activeLeafEntryId,
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
    forkPointEntryId?: string
  ): Promise<SessionSnapshot> {
    const previous = this.requireSession(sessionId);
    if (previous.busy || previous.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    const leafId =
      forkPointEntryId ?? previous.session.sessionManager.getLeafId();
    if (!leafId) {
      throw new Error("Fork requires an existing conversation entry");
    }
    if (
      !previous.session.sessionManager
        .getBranch()
        .some((entry) => entry.id === leafId)
    ) {
      throw new Error("Fork point must be on the active branch");
    }
    const dirs = getSessionDirs(this.config.dataDir, sessionId);
    if (!dirs) throw new Error(`Invalid session id: ${sessionId}`);
    const branchIndex = readBranchIndex(previous.manifest.recordsDir);
    if (!branchIndex) throw new Error("v0.4 branch index is required");
    const branchId = allocateBranchId(branchIndex);
    const sourceBranch = branchIndex.branches.find(
      (branch) => branch.branchId === previous.branchId
    );
    if (!sourceBranch) {
      throw new Error(`Unknown active branch: ${previous.branchId}`);
    }
    const workspaceRef =
      purpose === "collaboration"
        ? dirs.sessionCwd
        : resolveBranchWorkspace(dirs.sessionRoot, branchId);
    const forkFile =
      previous.session.sessionManager.createBranchedSession(leafId);
    if (!forkFile) {
      throw new Error("Pi did not create a persisted fork session");
    }
    let copiedWorkspace = false;
    let activated = false;
    try {
      if (purpose === "comparison") {
        cpSync(sourceBranch.workspaceRef, workspaceRef, {
          recursive: true,
          errorOnExist: true,
        });
        copiedWorkspace = true;
      }
      const result = await this.openManagedRuntime({
        sessionId,
        sessionFile: forkFile,
        sessionDirs: { ...dirs, sessionCwd: workspaceRef },
        selectors: previous.selectors,
        originalManifest: previous.manifest,
        branchId,
        openedFrom: previous.openedFrom,
        resumeWarnings: previous.resumeWarnings,
        counters: previous.counters,
        transcript: previous.transcript,
        overrideSessionCwd: true,
      });
      const forkActiveLeafEntryId =
        result.session.sessionManager.getLeafId() ?? null;
      const sourceRun = latestRunSnapshots(previous.manifest.recordsDir).find(
        (run) =>
          run.branchId === previous.branchId &&
          run.status === "completed" &&
          (run.userEntryId === leafId ||
            run.assistantEntryIds.includes(leafId))
      );
      addAndActivateBranch(previous.manifest.recordsDir, {
        branchId,
        parentBranchId: previous.branchId,
        forkPointEntryId: leafId,
        forkPointTurnId: sourceRun?.turnId ?? null,
        purpose,
        workspaceMode: purpose === "comparison" ? "copied" : "shared",
        workspaceRef,
        activePiSessionFile: forkFile,
        activeLeafEntryId: forkActiveLeafEntryId,
        createdAt: new Date().toISOString(),
      });
      activated = true;
      result.nextTurnIndex = previous.nextTurnIndex;
      result.nextRevisionIndex = previous.nextRevisionIndex;
      result.nextRunIndex = previous.nextRunIndex;
      result.transcript =
        readSessionDetail(this.config.dataDir, sessionId)?.transcript ??
        result.transcript;
      this.sessions.set(sessionId, result);
      await this.disposeManaged(previous);
      appendSessionEvent(result.manifest.recordsDir, {
        sessionId,
        type: "session_forked",
        details: {
          branchId,
          parentBranchId: previous.branchId,
          purpose,
          workspaceMode: purpose === "comparison" ? "copied" : "shared",
        },
      });
      return this.snapshot(result);
    } catch (error) {
      if (!activated && copiedWorkspace && existsSync(workspaceRef)) {
        rmSync(workspaceRef, { recursive: true, force: true });
      }
      if (!activated && existsSync(forkFile)) {
        rmSync(forkFile, { force: true });
      }
      throw error;
    }
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

    const completion = managed.session
      .prompt(text)
      .then(() => {
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
        updateBranchHead(managed.manifest.recordsDir, managed.branchId, {
          activePiSessionFile: managed.session.sessionFile ?? null,
          activeLeafEntryId:
            managed.session.sessionManager.getLeafId() ?? null,
        });
      })
      .catch((error) => {
        appendRunRecord(managed.manifest.recordsDir, {
          sessionId,
          branchId: managed.branchId,
          turnId,
          revisionId,
          runId,
          status: /abort|interrupt/i.test(String(error))
            ? "aborted"
            : "failed",
          piSessionFile: managed.session.sessionFile ?? null,
          userEntryId: null,
          assistantEntryIds: [],
          supersedesRunId: options.supersedesRunId ?? null,
          acceptedAt,
          completedAt: new Date().toISOString(),
        });
        throw error;
      })
      .finally(() => {
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

  async abort(sessionId: string, reason?: string): Promise<void> {
    const managed = this.requireSession(sessionId);
    await managed.session.abort();
    managed.busy = false;
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
    return [...this.requireSession(sessionId).transcript];
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
    const result = await createAltTheorySession({
      ...sessionDirs,
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
      coreSoulPath: this.config.coreSoulPath,
      coreSoulModulesDir: this.config.coreSoulModulesDir,
      coreSoulModules: this.config.coreSoulModules,
      ...runtimeModelConfig,
      thinkingLevel: this.config.thinkingLevel,
      promptMode: this.config.promptMode,
      resourceDiscovery: this.config.resourceDiscovery,
      skillsDir: this.config.skillsDir,
      runLabel: this.config.runLabel,
      testBatch: this.config.testBatch,
      readOnly: this.config.readOnly,
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
      originalDomain === KB_DISABLED_DOMAIN
        ? KB_DISABLED_DOMAIN
        : originalDomain && isKnownKbDomain(this.config.kbDir, originalDomain)
          ? originalDomain
          : fallbackSelectors.kbDomain;
    const activeInstructionRef = this.activeInstructionRef(
      detail.manifest?.customInstruction?.ref,
      fallbackSelectors.customInstructionRef
    );
    const instruction = this.resolveOptionalInstruction(activeInstructionRef);

    const activeSessionDirs = {
      ...sessionDirs,
      sessionCwd: detail.activeBranch?.workspaceRef ?? sessionDirs.sessionCwd,
    };
    const result = await openAltTheorySession({
      ...activeSessionDirs,
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
      coreSoulPath: this.config.coreSoulPath,
      coreSoulModulesDir: this.config.coreSoulModulesDir,
      coreSoulModules: this.config.coreSoulModules,
      ...this.resolveEffectiveRuntimeModelConfig(),
      thinkingLevel: this.config.thinkingLevel,
      promptMode: this.config.promptMode,
      resourceDiscovery: this.config.resourceDiscovery,
      skillsDir: this.config.skillsDir,
      runLabel: this.config.runLabel,
      testBatch: this.config.testBatch,
      readOnly: this.config.readOnly,
    });
    if (detail.activeBranch) {
      alignSessionManagerLeaf(
        result.session.sessionManager,
        detail.activeBranch.activeLeafEntryId,
        `active branch ${detail.activeBranch.branchId}`
      );
    }

    const managed = this.createManaged({
      ...result,
      selectors: {
        projectId: detail.session.projectId ?? fallbackSelectors.projectId ?? null,
        rolePresetSlug: activeRolePresetSlug,
        kbDomain: activeDomain,
        soulSlug: activeSoulSlug,
        customInstructionRef: activeInstructionRef,
      },
      openedFrom: "existing",
      resumeWarnings: result.resumeWarnings,
      counters: {
        messageCount: detail.metrics?.messageCount ?? 0,
        toolCallCount: detail.metrics?.toolCallCount ?? 0,
        turnCount: detail.metrics?.turnCount ?? 0,
      },
      transcript: detail.transcript,
      branchId: detail.activeBranch?.branchId ?? "main",
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
        rolePresetSlug: detail.manifest?.rolePreset?.slug ?? null,
        kbDomain: originalDomain ?? fallbackSelectors.kbDomain,
        soulSlug: detail.manifest?.soul?.slug ?? null,
        customInstructionRef:
          detail.manifest?.customInstruction?.ref ?? null,
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
      sessionCwd:
        detail?.activeBranch?.workspaceRef ??
        previous.manifest.sessionCwd ??
        sessionDirs.sessionCwd,
    };
    const result = await openAltTheorySession({
      ...activeSessionDirs,
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
      coreSoulPath: this.config.coreSoulPath,
      coreSoulModulesDir: this.config.coreSoulModulesDir,
      coreSoulModules: this.config.coreSoulModules,
      ...this.resolveEffectiveRuntimeModelConfig(),
      thinkingLevel: this.config.thinkingLevel,
      promptMode: this.config.promptMode,
      resourceDiscovery: this.config.resourceDiscovery,
      skillsDir: this.config.skillsDir,
      runLabel: this.config.runLabel,
      testBatch: this.config.testBatch,
      readOnly: this.config.readOnly,
      overrideSessionCwd: true,
    });
    if (detail?.activeBranch) {
      alignSessionManagerLeaf(
        result.session.sessionManager,
        detail.activeBranch.activeLeafEntryId,
        `active branch ${detail.activeBranch.branchId}`
      );
    }

    return this.createManaged({
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
  }): Promise<ManagedSession> {
    const instruction = this.resolveOptionalInstruction(
      args.selectors.customInstructionRef
    );
    const result = await openAltTheorySession({
      ...args.sessionDirs,
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
      coreSoulPath: this.config.coreSoulPath,
      coreSoulModulesDir: this.config.coreSoulModulesDir,
      coreSoulModules: this.config.coreSoulModules,
      ...this.resolveEffectiveRuntimeModelConfig(),
      thinkingLevel: this.config.thinkingLevel,
      promptMode: this.config.promptMode,
      resourceDiscovery: this.config.resourceDiscovery,
      skillsDir: this.config.skillsDir,
      runLabel: this.config.runLabel,
      testBatch: this.config.testBatch,
      readOnly: this.config.readOnly,
    });
    if ("activeLeafEntryId" in args) {
      alignSessionManagerLeaf(
        result.session.sessionManager,
        args.activeLeafEntryId ?? null,
        `active branch ${args.branchId}`
      );
    }
    return this.createManaged({
      ...result,
      selectors: args.selectors,
      openedFrom: args.openedFrom,
      resumeWarnings: args.resumeWarnings,
      counters: args.counters,
      transcript: args.transcript,
      branchId: args.branchId,
    });
  }

  private createManaged(args: {
    session: AgentSession;
    manifest: AssemblyManifest;
    selectors: SessionSelectors;
    openedFrom: "new" | "existing";
    resumeWarnings: string[];
    counters: SessionCounters;
    transcript: TranscriptMessage[];
    branchId?: string;
  }): ManagedSession {
    const persistedRuns = latestRunSnapshots(args.manifest.recordsDir);
    const managed: ManagedSession = {
      ...args,
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
    };
    managed.internalUnsubscribe = managed.session.subscribe((event) =>
      this.handleAgentEvent(managed, event)
    );
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
        `Only the active branch latest user turn can be ${action === "revise" ? "revised" : "deleted"}`
      );
    }
    return latest as RunRecord & { userEntryId: string };
  }

  private async finalizeRunFailure(managed: ManagedSession): Promise<void> {
    await managed.session.waitForRetry();
    const error = managed.session.state.errorMessage;
    if (!error) {
      return;
    }
    if (await this.tryModelFallback(managed, error)) {
      return;
    }
    managed.busy = false;
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId: managed.manifest.sessionId,
      type: "run_failed",
      details: { error },
    });
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

    continueAgentTurnAfterModelSwitch(managed.session);
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
        const error = managed.session.state.errorMessage;
        if (error) {
          setTimeout(() => {
            void this.finalizeRunFailure(managed);
          }, 0);
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
      sessionId: managed.manifest.sessionId,
      projectId: managed.selectors.projectId ?? null,
      visibility:
        readV4SessionHeader(managed.manifest.recordsDir)?.visibility ??
        "research",
      status: managed.session.isStreaming ? "running" : "idle",
      currentDomain: managed.selectors.kbDomain,
      rolePresetSlug: managed.selectors.rolePresetSlug,
      profileSlug: managed.selectors.rolePresetSlug,
      soulSlug: managed.selectors.soulSlug,
      customInstructionRef: managed.selectors.customInstructionRef ?? null,
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
