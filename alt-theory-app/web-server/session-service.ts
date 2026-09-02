import { cpSync, existsSync, readFileSync, rmSync, statSync, writeFileSync, } from "fs";
import { randomUUID } from "crypto";
import type {
  AgentSession,
  AgentSessionEvent,
  ModelRuntime,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { resolveCliModel } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { ImageContent, Model } from "@earendil-works/pi-ai";
import {
  createAltTheorySession,
  isNoModelPlaceholder,
  KB_DISABLED_DOMAIN,
  openAltTheorySession,
  type AssemblyManifest,
  type AltMode,
  type ResourceDiscoveryMode,
  type RuntimeMode,
} from "../core/alt-theory-core.js";
import {
  allocateReadableSessionId,
  createSessionDirs,
  getSessionDirs,
  writeJsonAtomic,
  type SessionDirectories,
} from "../core/data-dir.js";
import { extname, join, resolve } from "path";
import type { AgentAssetPaths } from "../core/agent-assets.js";
import {
  isKnownKbDomain,
  resolveKbDirForDomain,
  resolveRolePresetSlug,
  resolveSoulSlug,
} from "./asset-registry.js";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { clampPromptCacheKey } from "../core/prompt-cache-continuity.js";
import { isPathInside } from "../core/path-verdict.js";
import {
  ApprovalBridge,
  type ApprovalRequest,
  type ApprovalResolution,
  type ApprovalResponse,
} from "./approval-bridge.js";
import { appendSessionEvent } from "./session-events.js";
import { appendLiveRunEvent, type LiveRun } from "./live-run.js";
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
  forkFamilyIds,
  latestActiveLeafEntryId,
  listSessionSummaries,
  buildTranscriptFromEntries,
  promoteToMainlineRecords,
  readSessionDetail,
  getSessionRootForRequest,
  stripSkillWrapper,
} from "./session-store.js";
import { readAppSettings } from "./app-settings.js";
import { extractToolDetail, extractToolPath } from "./tool-detail.js";
import {
  readV4SessionHeader,
  withholdsFromResearch,
  writeFoundationRecords,
  writeSessionHeader,
  type ForkPurpose,
  type SessionModelOverride,
  type SessionVisibility,
  type StudyTag,
} from "./session-records.js";
import {
  calculateRetentionDueAt,
  refreshRetention,
  refreshSessionRetention,
} from "./session-retention.js";
import {
  appendConfigEvent,
  buildEffectiveConfig
} from "./config-events.js";
import { loadInstructionAsset } from "./instruction-assets.js";
import {
  appendRunRecord,
  latestRunSnapshots,
  runInterruptionCause,
  runOutcome,
  type InterruptionCause,
  type RunRecord,
} from "./run-records.js";
import type {
  SessionMetrics,
  SessionSnapshot,
  TurnRecovery,
  TranscriptMessage,
} from "./websocket-protocol.js";
import {
  continueAgentTurnAfterModelSwitch,
  loadModelFallbackConfig,
  ModelFallbackCoordinator,
  type ModelRef,
  resolveModelFallbackStatePath,
} from "../core/model-fallback.js";
import {
  appendAgentMail,
  formatEnvelopeForContext,
  markAgentMailDelivered,
  undeliveredAgentMail,
  type AgentMailEnvelope,
} from "./agent-mail.js";
import {
  clampSubagentMode,
  createAgentTeamTools,
  LEAD_DELEGATION_PROMPT_SECTION,
  SUBAGENT_PROMPT_SECTION,
  type AgentTeamBridge,
  type SpawnSubagentOptions,
} from "./agent-team.js";
import {
  formatSubagentConfigForPrompt,
  modelReferenceIdentity,
  readSubagentConfig,
  subagentModelCandidates,
  type SubagentConfig,
  THINKING_LEVELS,
} from "./subagent-config.js";

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
  understandReadOnly: boolean;
  /**
   * Absent = local (the safe default). Retention — the only thing that ever
   * deletes a conversation — exists ONLY on hosted deployments; see
   * `SessionVisibility` in session-records.ts for why the two deployments use
   * disjoint visibility vocabularies.
   */
  localMode?: boolean;
  modelProvider?: string;
  modelId?: string;
  modelsPath?: string;
  authPath?: string;
  runtimeApiKey?: string;
  thinkingLevel?: ThinkingLevel;
  resourceDiscovery: ResourceDiscoveryMode;
  skillsDir?: string;
  trustedReadRoots?: string[];
  instructionsDir?: string;
  runLabel: string | null;
  testBatch: string | null;
  resolveRuntimeModelConfig?: () => RuntimeModelConfig;
  resolveInitialThinkingLevel?: (
    provider: string,
    modelId: string,
  ) => ThinkingLevel;
  /**
   * Per-mode user-enabled external skill paths (spec §6.1). Read at every
   * session open so settings changes apply on reload without touching
   * running sessions.
   */
  resolveExternalSkillPaths?: () => { understand: string[]; work: string[] };
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
  authPath?: string;
  runtimeApiKey?: string;
}

export interface SessionSelectors {
  rolePresetSlug: string | null;
  kbDomain: string;
  soulSlug: string | null;
  customInstructionRef?: string | null;
}

export interface SessionCreationMetadata {
  helper?: boolean;
  ownerAccountId?: string | null;
  roleCondition?: string | null;
  visibility?: SessionVisibility;
  consentSnapshot?: {
    researcherReadable: boolean;
    quoteAfterAnonymization: boolean;
    privateOverride: boolean;
  } | null;
  /**
   * Work/Native workspace (spec §5.1). primaryDir replaces the default session
   * workspace as Pi's cwd; additionalDirs are intentional user additions.
   * Local app form only — the server layer gates this.
   */
  workspace?: {
    primaryDir?: string;
    additionalDirs?: string[];
  } | null;
  studyTag?: StudyTag | null;
  modelOverride?: SessionModelOverride | null;
  subagentExecution?: {
    agentType: string;
    modelChain: SessionModelOverride[];
  } | null;
  /** Internal child relationship used by fresh-context children. */
  forkedFrom?: { sessionId: string; purpose: ForkPurpose } | null;
  /** Internal mode override used when a fresh child inherits its parent mode. */
  mode?: AltMode;
  /**
   * Full Access (v1.4.8): apply to the newly assembled session runtime when
   * true. Only valid with a work-capable `mode`; rejected otherwise.
   */
  fullAccess?: boolean;
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
      payload: {
        phase:
          | "connecting"
          | "processing"
          | "thinking"
          | "tool"
          | "compacting"
          | "retrying"
          | "awaiting-user"
          | "idle"
          | "error";
        retry?: { attempt: number; maxAttempts: number; delayMs: number };
      };
    }
  | {
      type: "tool_started";
      payload: { toolName: string; callId: string; path?: string | null };
    }
  | { type: "tool_updated"; payload: { callId: string } }
  | { type: "tool_finished"; payload: { callId: string; success: boolean } }
  | { type: "run_completed"; payload: SessionSnapshot }
  | { type: "session_updated"; payload: SessionSnapshot }
  | {
      type: "run_failed";
      payload: { error: string; canRetry?: boolean; recovery?: TurnRecovery | null };
    }
  | { type: "user_steered"; payload: { text: string } }
  | { type: "session_transcript"; payload: { messages: TranscriptMessage[] } }
  | { type: "session_metrics"; payload: SessionMetrics }
  | {
      type: "approval_requested";
      payload: ApprovalRequest & { sessionId: string };
    }
  | {
      type: "approval_resolved";
      payload: {
        sessionId: string;
        approvalId: string;
        resolution: ApprovalResolution;
      };
    }
  | {
      type: "extension_notice";
      payload: { message: string; level: "info" | "warning" | "error" };
    };

interface ManagedSession {
  session: AgentSession;
  manifest: AssemblyManifest;
  getAltMode: () => AltMode;
  setAltMode: (mode: AltMode) => Promise<void>;
  getRuntimeMode: () => RuntimeMode;
  setRuntimeMode: (mode: RuntimeMode) => Promise<void>;
  setNativePiScanAltSkills: (enabled: boolean) => Promise<void>;
  getFullAccess: () => boolean;
  setFullAccess: (enabled: boolean) => void;
  getWorkspace: () => { primaryDir: string; additionalDirs: string[] };
  addWorkspaceDir: (dir: string) => Promise<string[]>;
  approvalBridge: ApprovalBridge;
  selectors: SessionSelectors;
  openedFrom: "new" | "existing";
  resumeWarnings: string[];
  counters: SessionCounters;
  transcript: TranscriptMessage[];
  /** mtime fingerprint of the files the transcript projection reads; null = re-read. */
  transcriptStamp: string | null;
  listeners: Set<(event: SessionServiceEvent) => void>;
  internalUnsubscribe: () => void;
  busy: boolean;
  nextTurnIndex: number;
  nextRevisionIndex: number;
  nextRunIndex: number;
  branchId: string;
  fallbackAttempts: number;
  pendingRunWork: Promise<void> | null;
  pendingRuntimeMode: RuntimeMode | null;
  pendingNativePiScanAltSkills: boolean | null;
  /** Set when this session is a subagent child: its lead conversation's id. */
  subagentParentId: string | null;
  subagentModelChain: SessionModelOverride[];
  /**
   * subagents.json as normalized when this session was assembled. The lead
   * prompt and every spawn validation inside this open session read this
   * snapshot; a settings change applies to newly assembled or reopened
   * sessions, never to an already-open one.
   */
  subagentConfig: SubagentConfig;
  /** In-flight turn buffered for late joiners (v1.4.3); null when idle. */
  liveRun: LiveRun | null;
  /** Structured cause for the in-flight turn when Alt asks Pi to stop it. */
  pendingInterruptionCause: InterruptionCause | null;
}

/** Background subagent runs allowed at once; further first-runs queue FIFO. */
const SUBAGENT_CONCURRENCY = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * An already-typed upstream abort signal (Pi aborts surface as
 * AbortError-named rejections). Interruption is classified from this or from
 * Alt's explicit interruption cause — never from error text, which lets a
 * provider/transport message containing "interrupt" masquerade as a stop.
 */
function isTypedAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export class SessionService implements AgentTeamBridge {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly approvalListeners = new Set<
    (event: Extract<SessionServiceEvent, { type: "approval_requested" | "approval_resolved" }>) => void
  >();
  private readonly modelFallback: ModelFallbackCoordinator | null;
  private runningSubagentRuns = 0;
  private readonly subagentQueue: Array<{ childId: string; start: () => void }> =
    [];
  private readonly queuedSubagentIds = new Set<string>();

  /** Retention is hosted-only; absent config means local, the safe default. */
  private get retentionEnabled(): boolean {
    return this.config.localMode === false;
  }

  /** Deployment's withheld-by-default value, in that deployment's vocabulary. */
  private get fallbackVisibility(): SessionVisibility {
    return this.retentionEnabled ? "research" : "no-export";
  }

  /** Retention sweep guard — never delete a conversation that is open. */
  isOpen(sessionId: string): boolean {
    const managed = this.sessions.get(sessionId);
    return Boolean(
      managed &&
        (managed.listeners.size > 0 ||
          managed.busy ||
          managed.session.isStreaming),
    );
  }

  constructor(private readonly config: SessionServiceConfig) {
    const fallbackConfigPath = this.config.modelFallbackConfigPath;
    if (fallbackConfigPath) {
      const fallbackConfig = loadModelFallbackConfig(fallbackConfigPath);
      this.modelFallback =
        fallbackConfig && fallbackConfig.enabled
          ? new ModelFallbackCoordinator(
              fallbackConfig,
              resolveModelFallbackStatePath(this.config.dataDir),
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
        authPath: this.config.authPath,
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
   * §5b) wins over the deployment-global config; thinking uses the model's
   * supported-level midpoint unless the session has an explicit level.
   */
  private modelArgsFor(
    override: SessionModelOverride | null | undefined,
  ): RuntimeModelConfig & { thinkingLevel?: ThinkingLevel } {
    let base: RuntimeModelConfig = {};
    if (!override) {
      base = this.resolveEffectiveRuntimeModelConfig();
    } else {
      try {
        base = this.resolveEffectiveRuntimeModelConfig();
      } catch {
        // A valid conversation choice must not be blocked by a stale global
        // default. The override is resolved by the session's model runtime.
      }
    }
    return {
      ...base,
      ...(override
        ? { modelProvider: override.provider, modelId: override.modelId }
        : {}),
      thinkingLevel:
        override?.thinkingLevel ??
        this.initialThinkingLevel(
          override?.provider ?? base.modelProvider,
          override?.modelId ?? base.modelId,
        ),
    };
  }

  private initialThinkingLevel(
    provider: string | undefined,
    modelId: string | undefined,
  ): ThinkingLevel {
    if (provider && modelId && this.config.resolveInitialThinkingLevel) {
      return this.config.resolveInitialThinkingLevel(provider, modelId);
    }
    return this.config.thinkingLevel ?? "medium";
  }

  private persistManifestModel(managed: ManagedSession): void {
    writeJsonAtomic(
      join(managed.manifest.recordsDir, "assembly-manifest.json"),
      managed.manifest,
    );
    if (managed.openedFrom === "existing") {
      writeJsonAtomic(
        join(managed.manifest.recordsDir, "resume-manifest.json"),
        managed.manifest,
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
        managed.session.sessionManager.getEntries(),
      );
      if (!firstUser) return;

      const sessionModel = managed.session.model;
      const pin = settings.autoTitle?.model ?? null;
      const pinnedModel = pin
        ? managed.session.modelRuntime.getModel(pin.provider, pin.modelId)
        : null;

      let title = await completeTitle(
        managed.session.modelRuntime,
        pinnedModel ?? sessionModel,
        firstUser,
      );
      if (!title && pinnedModel && sessionModel && pinnedModel !== sessionModel) {
        // Pinned model failed → fall back to the conversation model.
        title = await completeTitle(managed.session.modelRuntime, sessionModel, firstUser);
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
    metadata: SessionCreationMetadata = {},
  ): Promise<SessionSnapshot> {
    const runtimeModelConfig = this.modelArgsFor(metadata.modelOverride);
    const sessionId = allocateReadableSessionId(this.config.dataDir, {
      rolePresetSlug: selectors.rolePresetSlug,
      soulSlug: selectors.soulSlug,
      modelId: runtimeModelConfig.modelId,
    });
    const managed = await this.createManagedFromDirs(
      createSessionDirs(this.config.dataDir, sessionId),
      selectors,
      metadata,
      runtimeModelConfig,
    );
    this.sessions.set(managed.manifest.sessionId, managed);
    appendConfigEvent(managed.manifest.recordsDir, {
      sessionId: managed.manifest.sessionId,
      branchId: managed.branchId,
      reason: "creation",
      effective: buildEffectiveConfig(managed.manifest),
      changedFields: [],
      warnings: [],
    });
    return this.snapshot(managed);
  }

  async openSession(
    sessionId: string,
    fallbackSelectors: SessionSelectors,
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
      fallbackSelectors,
    );
    // Hosted only: reopening a private conversation counts as activity, so a
    // conversation the participant still returns to never expires out from
    // under them. Local conversations have no expiry at all.
    if (this.retentionEnabled) {
      const header = readV4SessionHeader(managed.manifest.recordsDir);
      if (header?.visibility === "private") {
        refreshSessionRetention(managed.manifest.recordsDir);
      }
    }
    this.sessions.set(managed.manifest.sessionId, managed);
    // Agent mail that arrived while this session was closed: inject it into
    // context (no turn — the user is present) and surface it in the
    // transcript as agent-team lines. Durable inbox -> nothing was lost.
    const undelivered = undeliveredAgentMail(managed.manifest.recordsDir);
    if (undelivered.length > 0) {
      for (const envelope of undelivered) {
        await managed.session.sendCustomMessage(
          {
            customType: "agent-team",
            content: formatEnvelopeForContext(
              envelope,
              this.agentMailLabel(envelope.from, managed),
            ),
            display: true,
            details: { from: envelope.from, event: envelope.event ?? null },
          },
          { triggerTurn: false },
        );
      }
      markAgentMailDelivered(managed.manifest.recordsDir);
    }
    return this.snapshot(managed);
  }

  async replaceSession(
    sessionId: string,
    selectors: SessionSelectors,
    _abortReason: string,
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
    const dirs = getSessionDirs(this.config.dataDir, previous.manifest.sessionId,);
    if (!dirs) {
      throw new Error(`Invalid session id: ${previous.manifest.sessionId}`);
    }

    const replacement = this.hasSessionHistory(previous)
      ? await this.createManagedFromExistingWithSelectors(
          previous.manifest.sessionId,
          selectors,
          previous,
        )
      : await this.createManagedFromDirs(dirs, selectors);
    this.sessions.set(replacement.manifest.sessionId, replacement);
    await this.disposeManaged(previous);
    appendConfigEvent(replacement.manifest.recordsDir, {
      sessionId: replacement.manifest.sessionId,
      reason: "user_change",
      effective: buildEffectiveConfig(replacement.manifest),
      changedFields: configChangedFields(previous.selectors, selectors),
      warnings: [],
      branchId: replacement.branchId,
    });
    return this.snapshot(replacement);
  }

  /**
   * Switch Alt Theory mode on the live session. Applies from the
   * next turn via Pi's own loader reload + active-tool swap; the session, its
   * conversation, and its Pi JSONL are untouched.
   */
  async switchMode(
    sessionId: string,
    mode: AltMode,
  ): Promise<SessionSnapshot> {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    if (managed.getAltMode() === mode) {
      return this.snapshot(managed);
    }
    await managed.setAltMode(mode);
    managed.manifest.altMode = mode;
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
      effective: buildEffectiveConfig(managed.manifest),
      changedFields: ["altMode"],
      warnings: [],
    });
    return this.snapshot(managed);
  }

  /**
   * Full Access (v1.4.8): in-memory, session-lifetime permission bypass.
   * Enabling is validated here and in the core setter (work-capable mode);
   * the WS layer separately rejects non-local servers. Disabling is immediate
   * and allowed during a run — the guard predicate is live per tool call, and
   * turning permissions down mid-run is always safe.
   */
  async setFullAccess(
    sessionId: string,
    enabled: boolean,
  ): Promise<SessionSnapshot> {
    const managed = this.requireSession(sessionId);
    if (enabled && (managed.busy || managed.session.isStreaming)) {
      throw new SessionBusyError(sessionId);
    }
    managed.setFullAccess(enabled);
    return this.snapshot(managed);
  }

  /** Apply app-wide behavior settings to every open session. */
  async setRuntimeSettings(
    mode: RuntimeMode,
    nativePiScanAltSkills: boolean,
  ): Promise<void> {
    await Promise.all(
      [...this.sessions.values()].map(async (managed) => {
        if (managed.busy || managed.session.isStreaming) {
          managed.pendingRuntimeMode = mode;
          managed.pendingNativePiScanAltSkills = nativePiScanAltSkills;
          return;
        }
        await managed.setRuntimeMode(mode);
        await managed.setNativePiScanAltSkills(nativePiScanAltSkills);
      }),
    );
  }

  private async applyPendingRuntime(managed: ManagedSession): Promise<void> {
    const mode = managed.pendingRuntimeMode;
    const scanAltSkills = managed.pendingNativePiScanAltSkills;
    if (!mode && scanAltSkills === null) return;
    managed.pendingRuntimeMode = null;
    managed.pendingNativePiScanAltSkills = null;
    if (mode) await managed.setRuntimeMode(mode);
    if (scanAltSkills !== null) {
      await managed.setNativePiScanAltSkills(scanAltSkills);
    }
  }

  /**
   * Add a workspace directory to a live session (spec §5.1) — an intentional
   * user act. Applies from the next turn via loader reload; persisted in the
   * session header so reopen restores it.
   */
  async addWorkspaceDir(
    sessionId: string,
    dir: string,
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
    primaryDir: string | null,
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
    // Family = the WHOLE tree from its structural root (owner 2026-08-05):
    // dragging a promoted branch used to miss its ancestors' subtrees and
    // leave part of the family behind in the old folder.
    const family = forkFamilyIds(this.config.dataDir, sessionId);
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

  private async repointOne(
    sessionId: string,
    resolved: string | null,
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
    response: ApprovalResponse,
  ): boolean {
    const managed = this.requireSession(sessionId);
    return managed.approvalBridge.respond(approvalId, response);
  }

  listPendingApprovals(): Array<ApprovalRequest & { sessionId: string }> {
    return [...this.sessions.entries()].flatMap(([sessionId, managed]) =>
      managed.approvalBridge
        .listPending()
        .map((request) => ({ ...request, sessionId })),
    );
  }

  attachApprovals(
    listener: (
      event: Extract<
        SessionServiceEvent,
        { type: "approval_requested" | "approval_resolved" }
      >,
    ) => void,
  ): () => void {
    this.approvalListeners.add(listener);
    return () => this.approvalListeners.delete(listener);
  }

  invokeSkill(
    sessionId: string,
    skillName: string,
    userText?: string,
  ): RunHandle {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    const skill = managed.manifest.skills?.find(
      (candidate) => candidate.name === skillName,
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
      `/skill:${skillName}${userText?.trim() ? ` ${userText.trim()}` : ""}`,
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
      }),
      changedFields: ["kbDomain"],
      warnings: [],
      branchId: managed.branchId,
    });
    return this.snapshot(managed);
  }

  runPrompt(sessionId: string, text: string, attachments?: string[],): RunHandle {
    const managed = this.requireSession(sessionId);
    const header = readV4SessionHeader(managed.manifest.recordsDir);
    if (
      (header?.helper || header?.forkedFrom?.purpose === "helper") &&
      latestRunSnapshots(managed.manifest.recordsDir).length === 0 &&
      managed.manifest.skills?.some((skill) => skill.name === "alt-theory-help")
    ) {
      return this.invokeSkill(sessionId, "alt-theory-help", text);
    }
    // Imported sessions (session-import-source.json in the records dir) get
    // the imported-session-context skill on their first Alt Theory run, so
    // the agent learns what the import preserved and lost before continuing.
    if (
      existsSync(join(managed.manifest.recordsDir, "session-import-source.json"),) &&
      latestRunSnapshots(managed.manifest.recordsDir).length === 0 &&
      managed.manifest.skills?.some(
        (skill) => skill.name === "imported-session-context",
      )
    ) {
      return this.invokeSkill(sessionId, "imported-session-context", text);
    }
    return this.runPromptWithLineage(managed, text, { attachments });
  }

  reviseLatest(sessionId: string, text: string): RunHandle {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    const latest = this.requireLatestActiveCompletedUserRun(managed, "revise");
    return this.reviseFromRun(managed, latest, text);
  }

  /** Run the latest user message again from its start, without a visible child. */
  retryLatestFromStart(sessionId: string): RunHandle {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    const runs = latestRunSnapshots(managed.manifest.recordsDir).filter(
      (run) =>
        run.branchId === managed.branchId &&
        run.userEntryId &&
        run.status !== "deleted" &&
        run.status !== "superseded",
    );
    const latest = runs.at(-1) as (RunRecord & { userEntryId: string }) | undefined;
    if (!latest) throw new Error("No latest user turn is available to retry");
    const latestUserEntry = managed.session.sessionManager
      .getBranch()
      .filter(
        (entry) =>
          entry.type === "message" &&
          (entry.message as { role?: string }).role === "user",
      )
      .at(-1);
    if (latestUserEntry?.id !== latest.userEntryId) {
      throw new Error("Only the current latest user turn can be retried");
    }
    const entry = managed.session.sessionManager.getEntry(latest.userEntryId) as
      | { type?: string; message?: { role?: string; content?: unknown } }
      | undefined;
    if (entry?.type !== "message" || entry.message?.role !== "user") {
      throw new Error("Latest user message is missing from Pi history");
    }
    const text = retryPromptFromStoredUserContent(
      contentToText(entry.message.content),
    );
    if (!text) throw new Error("Latest user message is empty");
    const skillName = text.match(/^\/skill:([^\s]+)/)?.[1];
    if (skillName) {
      const skill = managed.manifest.skills?.find(
        (candidate) => candidate.name === skillName,
      );
      if (!skill) throw new Error(`Unknown Alt Theory skill: ${skillName}`);
      appendSessionEvent(managed.manifest.recordsDir, {
        sessionId,
        type: "skill_invoked",
        details: { skillName, skillPath: skill.path },
      });
    }
    // `invokeSkill` also enters Pi through runPromptWithLineage(`/skill:…`).
    // Passing the reconstructed command here therefore re-runs the same skill
    // extension after reviseFromRun rewinds the old attempt.
    return this.reviseFromRun(managed, latest, text);
  }

  private latestContinuableRun(
    managed: ManagedSession,
  ): (RunRecord & { userEntryId: string }) | null {
    const latest = latestRunSnapshots(managed.manifest.recordsDir)
      .filter(
        (run) =>
          run.branchId === managed.branchId &&
          run.userEntryId &&
          run.status !== "deleted" &&
          run.status !== "superseded",
      )
      .at(-1);
    if (!latest?.userEntryId || !["failed", "interrupted"].includes(runOutcome(latest) ?? "")) {
      return null;
    }
    return latest as RunRecord & { userEntryId: string };
  }

  /** Whether Continue can resume the latest incomplete turn from its breakpoint. */
  canContinueLatest(sessionId: string): boolean {
    const managed = this.sessions.get(sessionId);
    return Boolean(managed && this.latestContinuableRun(managed));
  }

  continueLatestFromBreakpoint(sessionId: string): RunHandle {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    const latest = this.latestContinuableRun(managed);
    if (!latest) {
      throw new Error("No incomplete latest turn is available to continue");
    }
    const userEntry = managed.session.sessionManager.getEntry(
      latest.userEntryId,
    ) as
      | { type?: string; message?: { role?: string; content?: unknown } }
      | undefined;
    if (userEntry?.type !== "message" || userEntry.message?.role !== "user") {
      throw new Error("Interrupted turn user message is missing from Pi history");
    }
    const text = stripSkillWrapper(
      contentToText(userEntry.message.content),
    ).trim();
    if (!text) {
      throw new Error("Interrupted turn has no user text");
    }
    return this.continueRunFromBreakpoint(
      managed,
      latest as RunRecord & { userEntryId: string },
    );
  }

  /**
   * Continue an incomplete attempt without creating a second user message.
   * The existing user entry stays on the active branch, and every completed
   * step of the failed attempt (tool calls, tool results, partial output)
   * is preserved: the replacement run adopts those entries and the agent
   * resumes from the break point instead of rerunning the whole turn.
   * Only the trailing errored/aborted assistant message is regenerated
   * (stripped in continueAgentTurnAfterModelSwitch, kept in Pi history).
   */
  private continueRunFromBreakpoint(
    managed: ManagedSession,
    run: RunRecord & { userEntryId: string },
  ): RunHandle {
    const sessionId = managed.manifest.sessionId;
    appendRunRecord(managed.manifest.recordsDir, {
      ...runRecordBody(run),
      status: "superseded",
      completedAt: new Date().toISOString(),
    });

    managed.busy = true;
    managed.fallbackAttempts = 0;
    managed.pendingInterruptionCause = null;
    const revisionId = formatCounter("rev", managed.nextRevisionIndex++);
    const runId = formatCounter("run", managed.nextRunIndex++);
    const acceptedAt = new Date().toISOString();
    if (this.retentionEnabled) {
      refreshSessionRetention(managed.manifest.recordsDir, new Date(acceptedAt));
    }
    const beforeEntryIds = new Set(
      managed.session.sessionManager.getEntries().map((entry) => entry.id),
    );
    appendRunRecord(managed.manifest.recordsDir, {
      sessionId,
      branchId: managed.branchId,
      turnId: run.turnId,
      revisionId,
      runId,
      status: "accepted",
      piSessionFile: managed.session.sessionFile ?? null,
      userEntryId: run.userEntryId,
      // Adopt the failed attempt's entries so its completed work stays
      // active (visible and in context) while the superseded record hides
      // nothing that still belongs to this turn.
      assistantEntryIds: [...run.assistantEntryIds],
      supersedesRunId: run.runId,
      acceptedAt,
      completedAt: null,
    });
    // Publish only after the replacement run owns the same user entry;
    // otherwise run-record filtering briefly hides the user's retry prompt.
    this.publishCurrentBranchTranscript(managed);
    this.emitRunPhase(managed, "connecting");

    const completion = (async () => {
      let retryError: unknown = null;
      let pendingError: unknown = null;
      try {
        await continueAgentTurnAfterModelSwitch(managed.session);
      } catch (error) {
        retryError = error;
      }
      try {
        await this.waitForPendingRunWork(managed);
      } catch (error) {
        pendingError = error;
      }

      const assistantEntryIds = [
        ...run.assistantEntryIds,
        ...managed.session.sessionManager
          .getEntries()
          .filter(
            (entry) =>
              !beforeEntryIds.has(entry.id) &&
              entry.type === "message" &&
              (entry.message as { role?: string }).role === "assistant",
          )
          .map((entry) => entry.id),
      ];
      const finalError =
        managed.session.state.errorMessage ??
        (pendingError instanceof Error
          ? pendingError.message
          : pendingError
            ? String(pendingError)
            : null);
      // Same classification rule as runPromptWithLineage: only an explicit
      // Alt stop or a typed abort is an interruption; error text never is.
      const interrupted =
        managed.pendingInterruptionCause !== null ||
        isTypedAbortError(retryError) ||
        isTypedAbortError(pendingError);
      const failed =
        interrupted || Boolean(finalError || retryError || pendingError);
      appendRunRecord(managed.manifest.recordsDir, {
        sessionId,
        branchId: managed.branchId,
        turnId: run.turnId,
        revisionId,
        runId,
        status: interrupted ? "interrupted" : failed ? "failed" : "completed",
        interruptionCause: interrupted
          ? (managed.pendingInterruptionCause ?? "unknown")
          : null,
        piSessionFile: managed.session.sessionFile ?? null,
        userEntryId: run.userEntryId,
        assistantEntryIds,
        supersedesRunId: run.runId,
        acceptedAt,
        completedAt: new Date().toISOString(),
      });
      if (failed) {
        const error =
          retryError instanceof Error
            ? retryError.message
            : finalError ?? String(pendingError ?? retryError ?? "Continue failed");
        const recovery = this.latestRecoveryState(managed);
        this.emit(managed, {
          type: "run_failed",
          payload: {
            error,
            canRetry: recovery?.canRetryFromStart ?? false,
            recovery,
          },
        });
        throw (
          retryError ??
          pendingError ??
          new Error(finalError ?? "Retry failed")
        );
      }
    })().finally(async () => {
      await this.applyPendingRuntime(managed);
      managed.busy = false;
      managed.pendingInterruptionCause = null;
    });

    return {
      ids: {
        sessionId,
        branchId: managed.branchId,
        turnId: run.turnId,
        revisionId,
        runId,
      },
      completion,
      abort: () => this.abort(sessionId, "run_handle_abort"),
    };
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
      (run) => run.branchId === managed.branchId,
    );
    const target = allRuns.find(
      (run) =>
        run.userEntryId === userEntryId &&
        run.status !== "deleted" &&
        run.status !== "superseded",
    );
    if (target?.userEntryId) {
      // Rewinding rewrites everything after the target: later completed runs
      // on this branch are superseded alongside it.
      for (const run of allRuns.slice(allRuns.indexOf(target) + 1)) {
        if (
          !run.userEntryId ||
          run.status === "deleted" ||
          run.status === "superseded"
        ) {
          continue;
        }
        appendRunRecord(managed.manifest.recordsDir, {
          ...runRecordBody(run),
          status: "superseded",
          completedAt: new Date().toISOString(),
        });
      }
      return this.reviseFromRun(
        managed,
        target as RunRecord & { userEntryId: string },
        text,
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
      if (
        !run.userEntryId ||
        run.status === "deleted" ||
        run.status === "superseded"
      ) {
        continue;
      }
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
    resyncAgentContext(managed.session);
    this.publishCurrentBranchTranscript(managed, displayUserTextFromPrompt(text));
    return this.runPromptWithLineage(managed, text);
  }

  private reviseFromRun(
    managed: ManagedSession,
    run: RunRecord & { userEntryId: string },
    text: string,
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
    resyncAgentContext(managed.session);
    appendRunRecord(managed.manifest.recordsDir, {
      ...runRecordBody(run),
      status: "superseded",
      completedAt: new Date().toISOString(),
    });
    this.publishCurrentBranchTranscript(managed, displayUserTextFromPrompt(text));
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
    const userEntry = managed.session.sessionManager.getEntry(latest.userEntryId,);
    if (!userEntry) {
      throw new Error("Latest user entry is missing from Pi history");
    }
    if (userEntry.parentId) {
      managed.session.sessionManager.branch(userEntry.parentId);
    } else {
      managed.session.sessionManager.resetLeaf();
    }
    resyncAgentContext(managed.session);
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
    forkPointEntryId?: string | null,
    selectorOverrides?: Partial<SessionSelectors>,
    options?: { exactForkPoint?: boolean; allowEmpty?: boolean },
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
    let leafId = options?.exactForkPoint
      ? (forkPointEntryId ?? null)
      : (forkPointEntryId ?? previous.session.sessionManager.getLeafId());
    if (!leafId && !options?.allowEmpty) {
      throw new Error("Fork requires an existing conversation entry");
    }
    // "Branch from here" on a user message forks the COMPLETE turn: advance
    // the fork point to that run's last assistant entry so the child doesn't
    // end on a dangling user message.
    const leafEntry = leafId
      ? (previous.session.sessionManager.getEntry(leafId) as
          | { type?: string; message?: { role?: string } }
          | undefined)
      : undefined;
    if (
      !options?.exactForkPoint &&
      leafEntry?.type === "message" &&
      leafEntry.message?.role === "user"
    ) {
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
      leafId &&
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
    const inheritedPromptCacheFamilyId =
      typeof (parentHeader as { promptCacheFamilyId?: unknown })
        .promptCacheFamilyId === "string"
        ? (parentHeader as { promptCacheFamilyId: string })
            .promptCacheFamilyId
        : parentHeader.id;
    const forkHeader = {
      ...parentHeader,
      id: forkPiId,
      timestamp: forkTimestamp,
      parentSession: parentManager.getSessionFile(),
      promptCacheFamilyId: clampPromptCacheKey(
        inheritedPromptCacheFamilyId,
      ),
    };
    // Same label handling as Pi's createBranchedSession: drop label entries
    // and re-chain parentIds so the retained path stays a valid chain.
    const forkPath: Array<Record<string, unknown>> = [];
    let forkParentId: string | null = null;
    for (const entry of leafId ? parentManager.getBranch(leafId) : []) {
      if (entry.type === "label") continue;
      forkPath.push({ ...entry, parentId: forkParentId });
      forkParentId = entry.id;
    }
    const copiedForkFile = join(
      forkDirs.piSessionDir,
      `${forkTimestamp.replace(/[:.]/g, "-")}_${forkPiId}.jsonl`,
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
        "utf-8",
      );
      const result = await this.openManagedRuntime({
        sessionId: forkSessionId,
        sessionFile: copiedForkFile,
        sessionDirs: forkDirs,
        forkPurpose: purpose,
        selectors: childSelectors,
        originalManifest: previous.manifest,
        branchId: "main",
        openedFrom: previous.openedFrom,
        resumeWarnings: previous.resumeWarnings,
        counters: previous.counters,
        transcript: previous.transcript,
        overrideSessionCwd: !externalPrimary,
        activeLeafEntryId: leafId,
        mode: previous.getAltMode(),
        ...(readV4SessionHeader(previous.manifest.recordsDir)?.workspace
          ? { workspace: previous.getWorkspace() }
          : {}),
        modelOverride:
          readV4SessionHeader(previous.manifest.recordsDir)?.modelOverride ??
          null,
      });
      writeJsonAtomic(
        join(result.manifest.recordsDir, "assembly-manifest.json"),
        result.manifest,
      );
      const sourceHeader = readV4SessionHeader(previous.manifest.recordsDir);
      const visibility = sourceHeader?.visibility ?? this.fallbackVisibility;
      writeFoundationRecords({
        sessionRoot: forkDirs.sessionRoot,
        recordsDir: forkDirs.recordsDir,
        manifest: result.manifest,
        ownerAccountId: sourceHeader?.ownerAccountId ?? null,
        roleCondition: sourceHeader?.roleCondition ?? null,
        visibility,
        consentSnapshot: sourceHeader?.consentSnapshot ?? null,
        lastActivityAt: result.manifest.createdAt,
        retentionDueAt:
          this.retentionEnabled && visibility === "private"
            ? calculateRetentionDueAt(result.manifest.createdAt)
            : null,
        mode: previous.getAltMode(),
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
        effective: buildEffectiveConfig(result.manifest),
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
      // List labels: display-layer prefix only (e.g. "Branch 1 · …") — do not
      // rewrite ui-alias to a bare number token; that is a rename, not a prefix.
      return this.snapshot(result);
    } catch (error) {
      if (!activated && existsSync(forkDirs.sessionRoot)) {
        rmSync(forkDirs.sessionRoot, { recursive: true, force: true });
      }
      throw error;
    }
  }

  /** Create an idle comparison branch whose context ends before a user message. */
  async prepareRevisionBranch(
    sessionId: string,
    userEntryId: string,
  ): Promise<SessionSnapshot> {
    const managed = this.requireSession(sessionId);
    const entry = managed.session.sessionManager.getEntry(userEntryId) as
      | { id?: string; parentId?: string | null; type?: string; message?: { role?: string } }
      | undefined;
    if (
      entry?.type !== "message" ||
      entry.message?.role !== "user" ||
      !managed.session.sessionManager.getBranch().some((item) => item.id === userEntryId)
    ) {
      throw new Error("Edit comparison requires a user message in this conversation");
    }
    return this.forkSession(
      sessionId,
      "fork",
      entry.parentId ?? null,
      undefined,
      { exactForkPoint: true, allowEmpty: true },
    );
  }

  /**
   * M6 Understand response comparison (spec §14.6), thin over the M5 substrate:
   * fork one Understand-pinned arm per config off the same live parent, run the
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
    }>,
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
          !["rolePresetSlug", "kbDomain", "soulSlug", "customInstructionRef",].includes(key)
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
        arm.selectorOverrides,
      );
      await this.switchMode(forked.sessionId, "understand");
      armSnapshots.push(forked);
    }
    await Promise.all(
      armSnapshots.map(
        (snap) => this.runPrompt(snap.sessionId, prompt).completion,
      ),
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
      attachments?: string[];
      /** Subagent runs started by the agent team: mail the outcome to the lead. */
      notifyParent?: boolean;
    } = {},
  ): RunHandle {
    const sessionId = managed.manifest.sessionId;
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    if (!managed.session.model || isNoModelPlaceholder(managed.session.model)) {
      throw new Error(
        "No model is selected. Choose a conversation model or configure one in Settings → Models.",
      );
    }

    managed.busy = true;
    managed.fallbackAttempts = 0;
    managed.pendingInterruptionCause = null;
    managed.liveRun = { userText: displayUserTextFromPrompt(text), events: [] };
    managed.counters.messageCount++;
    const turnId =
      options.turnId ?? formatCounter("turn", managed.nextTurnIndex++);
    const revisionId = formatCounter("rev", managed.nextRevisionIndex++);
    const runId = formatCounter("run", managed.nextRunIndex++);
    const acceptedAt = new Date().toISOString();
    if (this.retentionEnabled) {
      refreshSessionRetention(managed.manifest.recordsDir, new Date(acceptedAt));
    }
    const beforeEntryIds = new Set(
      managed.session.sessionManager.getEntries().map((entry) => entry.id),
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
      // Image attachments (v1.2.1 D): staged image paths are sent as real
      // ImageContent to a model that declares image input; the paths also stay
      // in the prompt text (Attachments: …), so a text-only model still gets the
      // filename and simply says it cannot read the image — never a hard error.
      const images = imageAttachmentsFor(options.attachments, managed.session.model,);
      try {
        await managed.session.prompt(text, images.length ? { images } : undefined,);
      } catch (error) {
        promptError = error;
      }

      try {
        await this.waitForPendingRunWork(managed);
      } catch (error) {
        pendingError = error;
      }

      const entries = managed.session.sessionManager
        .getEntries()
        .filter((entry) => !beforeEntryIds.has(entry.id));
      const userEntryId =
        entries.find(
          (entry) =>
            entry.type === "message" &&
            (entry.message as { role?: string }).role === "user",
        )?.id ?? null;
      const assistantEntryIds = entries
        .filter(
          (entry) =>
            entry.type === "message" &&
            (entry.message as { role?: string }).role === "assistant",
        )
        .map((entry) => entry.id);
      const finalError =
        managed.session.state.errorMessage ??
        (pendingError instanceof Error
          ? pendingError.message
          : pendingError
            ? String(pendingError)
            : null);
      // Interrupted only when Alt explicitly stopped this turn (cause set
      // before abort) or the rejection is a typed abort. An unmarked
      // provider/transport error is failed even if its text says "interrupt".
      const interrupted =
        managed.pendingInterruptionCause !== null ||
        isTypedAbortError(promptError) ||
        isTypedAbortError(pendingError);
      if (finalError || promptError || pendingError || interrupted) {
        appendRunRecord(managed.manifest.recordsDir, {
          sessionId,
          branchId: managed.branchId,
          turnId,
          revisionId,
          runId,
          status: interrupted ? "interrupted" : "failed",
          interruptionCause: interrupted
            ? (managed.pendingInterruptionCause ?? "unknown")
            : null,
          piSessionFile: managed.session.sessionFile ?? null,
          userEntryId,
          assistantEntryIds,
          supersedesRunId: options.supersedesRunId ?? null,
          acceptedAt,
          completedAt: new Date().toISOString(),
        });
        const error = finalError ?? String(promptError ?? pendingError ?? "Run failed");
        const recovery = this.latestRecoveryState(managed);
        this.emit(managed, {
          type: "run_failed",
          payload: {
            error,
            canRetry: recovery?.canRetryFromStart ?? false,
            recovery,
          },
        });
        if (options.notifyParent && managed.subagentParentId) {
          this.deliverSubagentOutcome(
            managed,
            interrupted ? "interrupted" : "failed",
            interrupted
              ? "The subagent's turn was stopped. Its completed work is kept; it can continue from the break point."
              : `The subagent's turn failed: ${finalError ?? String(promptError ?? "unknown error")}`,
          );
        }
        throw ( promptError ?? pendingError ?? new Error(finalError ?? "Run failed")
        );
      }

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

      if (options.notifyParent && managed.subagentParentId) {
        const lastAssistant = entries
          .filter(
            (entry) =>
              entry.type === "message" &&
              (entry.message as { role?: string }).role === "assistant",
          )
          .at(-1) as { message?: { content?: unknown } } | undefined;
        const answer = contentToText(lastAssistant?.message?.content).trim();
        this.deliverSubagentOutcome(
          managed,
          "completed",
          answer || "(the subagent finished without a text answer)",
        );
      }

      // Auto-name the conversation once, after its first real turn (v1.2.1).
      // Fire-and-forget: title generation must never affect the run.
      void this.maybeAutoTitle(managed);
    })().finally(async () => {
      await this.applyPendingRuntime(managed);
      managed.busy = false;
      managed.pendingInterruptionCause = null;
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

  /**
   * Deliver user text into a RUNNING session as a Pi steering message (the
   * Pi TUI's type-while-running behavior). Returns false when the session is
   * idle — the caller should run a normal prompt instead.
   */
  steerRunningSession(sessionId: string, text: string): boolean {
    const managed = this.requireSession(sessionId);
    if (!managed.busy && !managed.session.isStreaming) return false;
    void managed.session.steer(text).catch(() => {});
    // The steered bubble is server-broadcast (and live-run buffered), so
    // every attached pane — sender and late joiners alike — sees it once.
    this.emit(managed, { type: "user_steered", payload: { text } });
    return true;
  }

  async abort(
    sessionId: string,
    reason?: string,
    interruptionCause: InterruptionCause = "unknown",
  ): Promise<void> {
    const managed = this.requireSession(sessionId);
    managed.pendingInterruptionCause = interruptionCause;
    managed.session.abortCompaction();
    await managed.session.abort();
    await this.applyPendingRuntime(managed);
    managed.busy = false;
    this.emitRunPhase(managed, "idle");
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId: managed.manifest.sessionId,
      type: "run_aborted",
      details: reason ? { reason } : undefined,
    });
  }

  /**
   * One shared post-compaction projection for every trigger (manual,
   * threshold, overflow): the boundary just landed on the live branch, so
   * rebuild the transcript from in-memory state (a disk re-read can briefly
   * lag and omit the marker) and republish metrics — Pi reports context
   * usage as unknown after compaction until the next real model usage, so
   * the stale pre-compaction percentage clears here instead of persisting.
   */
  private publishCompactionBoundary(managed: ManagedSession): void {
    managed.transcript = buildTranscriptFromEntries(
      managed.session.sessionManager.getBranch(),
    );
    this.emit(managed, {
      type: "session_transcript",
      payload: { messages: [...managed.transcript] },
    });
    this.emit(managed, {
      type: "session_metrics",
      payload: this.persistMetrics(managed),
    });
  }

  async compact(sessionId: string): Promise<SessionSnapshot> {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    managed.busy = true;
    const leafBeforeCompact = managed.session.sessionManager.getLeafId();
    this.emitRunPhase(managed, "compacting");
    try {
      await managed.session.compact();
      managed.busy = false;
      // The compaction_end agent event already published the boundary through
      // the shared path; publish again so a stubbed compact() (tests) and any
      // projection ordering race cannot leave the UI without the marker.
      this.publishCompactionBoundary(managed);
      return this.snapshot(managed);
    } catch (error) {
      if (
        leafBeforeCompact &&
        managed.session.sessionManager.getEntry(leafBeforeCompact)
      ) {
        managed.session.sessionManager.branch(leafBeforeCompact);
        resyncAgentContext(managed.session);
      }
      throw error;
    } finally {
      await this.applyPendingRuntime(managed);
      managed.busy = false;
      this.emitRunPhase(managed, "idle");
      this.emit(managed, {
        type: "session_updated",
        payload: this.snapshot(managed),
      });
    }
  }

  attach(
    sessionId: string,
    listener: (event: SessionServiceEvent) => void,
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

  runningSessionIds(): string[] {
    return [...this.sessions.entries()]
      .filter(([, managed]) => managed.busy || managed.session.isStreaming)
      .map(([sessionId]) => sessionId);
  }

  /**
   * Per-session run state for the sessions list (alpha.3). Running sessions
   * you are not looking at used to signal nothing but a badge; a session that
   * stops for an approval, or fails, needs to be visible from anywhere.
   */
  sessionActivity(): Map<string, "running" | "awaiting-approval" | "failed"> {
    const activity = new Map<string, "running" | "awaiting-approval" | "failed">();
    for (const [sessionId, managed] of this.sessions) {
      const running = managed.busy || managed.session.isStreaming;
      if (running && managed.approvalBridge.listPending().length > 0) {
        activity.set(sessionId, "awaiting-approval");
      } else if (running) {
        activity.set(sessionId, "running");
      } else if (managed.session.state.errorMessage) {
        activity.set(sessionId, "failed");
      }
    }
    return activity;
  }

  getManifest(sessionId: string): AssemblyManifest {
    return this.requireSession(sessionId).manifest;
  }

  getMetrics(sessionId: string): SessionMetrics {
    return this.buildMetrics(this.requireSession(sessionId));
  }

  getTranscript(sessionId: string): TranscriptMessage[] {
    const managed = this.requireSession(sessionId);
    const stamp = this.transcriptStamp(managed);
    if (stamp === null || stamp !== managed.transcriptStamp) {
      managed.transcript =
        readSessionDetail(this.config.dataDir, sessionId)?.transcript ??
        managed.transcript;
      managed.transcriptStamp = stamp;
    }
    return this.visibleTranscript(managed);
  }

  /**
   * Fingerprint of the two files the transcript projection is derived from
   * (perf backlog item 2): the full re-read now happens only when one of
   * them actually changed underneath the open session.
   */
  private transcriptStamp(managed: ManagedSession): string | null {
    try {
      const sessionFile = managed.session.sessionFile;
      if (!sessionFile) return null;
      const runs = join(managed.manifest.recordsDir, "runs.jsonl");
      const runsMtime = existsSync(runs) ? statSync(runs).mtimeMs : 0;
      return `${statSync(sessionFile).mtimeMs}/${runsMtime}`;
    } catch {
      return null;
    }
  }

  /**
   * The transcript clients may display right now. Durable run projection can
   * briefly omit a replacement prompt while its prior run is superseded and
   * the new Pi user entry has not landed yet; the live/pending display text
   * closes that window for every pane without changing durable history.
   */
  private visibleTranscript(
    managed: ManagedSession,
    pendingUserText: string | null = managed.liveRun?.userText ?? null,
  ): TranscriptMessage[] {
    const messages = [...managed.transcript];
    const last = messages.at(-1);
    if (
      pendingUserText &&
      !(last?.role === "user" && last.text === pendingUserText)
    ) {
      messages.push({ role: "user", text: pendingUserText, timestamp: null });
    }
    return messages;
  }

  private publishCurrentBranchTranscript(
    managed: ManagedSession,
    pendingUserText: string | null = null,
  ): void {
    managed.transcript =
      readSessionDetail(this.config.dataDir, managed.manifest.sessionId)
        ?.transcript ??
      buildTranscriptFromEntries(managed.session.sessionManager.getBranch());
    this.emit(managed, {
      type: "session_transcript",
      payload: { messages: this.visibleTranscript(managed, pendingUserText) },
    });
  }

  getSelectors(sessionId: string): SessionSelectors {
    return { ...this.requireSession(sessionId).selectors };
  }

  setVisibility(
    sessionId: string,
    visibility: SessionVisibility,
    consentSnapshot?: SessionCreationMetadata["consentSnapshot"],
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
        withholdsFromResearch(visibility)
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
      this.retentionEnabled && visibility === "private"
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
      studyTag ? { ...rest, studyTag } : rest,
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
    override: SessionModelOverride | null,
  ): Promise<SessionSnapshot> {
    const managed = this.requireSession(sessionId);
    if (managed.busy || managed.session.isStreaming) {
      throw new SessionBusyError(sessionId);
    }
    const header = readV4SessionHeader(managed.manifest.recordsDir);
    if (!header) throw new Error("v0.4 session header is required");
    const fallback = override ? null : this.resolveEffectiveRuntimeModelConfig();
    const { modelOverride: _dropped, ...rest } = header;
    writeSessionHeader(
      managed.manifest.recordsDir,
      override ? { ...rest, modelOverride: override } : rest,
    );
    let applied = false;
    if (override) {
      const resolved = managed.session.modelRuntime.getModel(
        override.provider,
        override.modelId,
      );
      if (resolved) {
        await managed.session.setModel(resolved);
        managed.manifest.provider = override.provider;
        managed.manifest.model = override.modelId;
        this.persistManifestModel(managed);
        applied = true;
      }
      managed.session.setThinkingLevel(
        override.thinkingLevel ??
          this.initialThinkingLevel(override.provider, override.modelId),
      );
    } else {
      const base = fallback ?? {};
      const resolved =
        base.modelProvider && base.modelId
          ? managed.session.modelRuntime.getModel(base.modelProvider, base.modelId,)
          : undefined;
      if (resolved) {
        await managed.session.setModel(resolved);
        managed.manifest.provider = base.modelProvider!;
        managed.manifest.model = base.modelId!;
        this.persistManifestModel(managed);
        applied = true;
      }
      managed.session.setThinkingLevel(
        this.initialThinkingLevel(base.modelProvider, base.modelId),
      );
    }
    appendSessionEvent(managed.manifest.recordsDir, {
      sessionId,
      type: "model_override_changed",
      details: { override, appliedLive: applied },
    });
    const notice = override
      ? applied
        ? `Conversation model: ${override.provider}/${override.modelId}${
            override.thinkingLevel ? ` (${override.thinkingLevel} thinking)` : ""
          }.`
        : `Conversation model saved: ${override.provider}/${override.modelId}. It will be resolved when this conversation reopens.`
      : applied
        ? `Using default model: ${managed.manifest.provider}/${managed.manifest.model}.`
        : "Conversation model override cleared; the app default will be resolved when this conversation reopens.";
    this.emit(managed, {
      type: "extension_notice",
      payload: { message: notice, level: "info" },
    });
    return this.snapshot(managed);
  }

  async disposeAll(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(sessions.map((managed) => this.disposeManaged(managed)));
  }

  /**
   * Ordinary and spawned conversations can delegate; spawned conversations
   * also get message_parent. A/B arms remain comparison instruments. The
   * subagent prompt section is formatted from the caller's config snapshot
   * (read once per assembly) so it cannot diverge from spawn validation.
   */
  private agentTeamArgsFor(
    sessionId: string,
    purpose: ForkPurpose | null | undefined,
    subagentConfig: SubagentConfig,
  ): { extraTools: ToolDefinition[]; extraPromptSections: string[] } {
    if (purpose === "subagent") {
      return {
        extraTools: createAgentTeamTools(this, sessionId, "subagent"),
        extraPromptSections: [
          SUBAGENT_PROMPT_SECTION,
          LEAD_DELEGATION_PROMPT_SECTION,
          formatSubagentConfigForPrompt(subagentConfig),
        ],
      };
    }
    if (purpose === "ab-arm") {
      return { extraTools: [], extraPromptSections: [] };
    }
    return {
      extraTools: createAgentTeamTools(this, sessionId, "lead"),
      extraPromptSections: [
        LEAD_DELEGATION_PROMPT_SECTION,
        formatSubagentConfigForPrompt(subagentConfig),
      ],
    };
  }

  private async createManagedFromDirs(
    sessionDirs: SessionDirectories,
    selectors: SessionSelectors,
    metadata: SessionCreationMetadata = {},
    runtimeModelConfig = this.resolveEffectiveRuntimeModelConfig(),
  ): Promise<ManagedSession> {
    const rolePresetPath = this.resolveOptionalRolePresetPath(
      selectors.rolePresetSlug,
    );
    const soulPath = this.resolveOptionalSoulPath(selectors.soulSlug);
    const instruction = this.resolveOptionalInstruction(
      selectors.customInstructionRef,
    );
    // Workspace (spec §5.1): the primary directory replaces the default
    // session workspace as Pi's cwd. The session's own workspace dir stays
    // as the Alt writable root (writeDir), untouched.
    const primaryDir = metadata.workspace?.primaryDir
      ? resolve(metadata.workspace.primaryDir)
      : null;
    if (primaryDir && !statSync(primaryDir, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Workspace primary directory does not exist: ${primaryDir}`,);
    }
    const appSettings = readAppSettings(this.config.dataDir);
    const subagentConfig = readSubagentConfig(this.config.dataDir).config;
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
      kbDir: resolveKbDirForDomain(this.config.kbDir, selectors.kbDomain),
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
        metadata.modelOverride?.thinkingLevel ??
        this.initialThinkingLevel(
          metadata.modelOverride?.provider ?? runtimeModelConfig.modelProvider,
          metadata.modelOverride?.modelId ?? runtimeModelConfig.modelId,
        ),
      altMode: metadata.mode ?? appSettings.defaultAltMode ?? "understand",
      runtimeMode: appSettings.runtimeMode ?? "alt-theory",
      trimmedPiBasePrompt: appSettings.experimentTrimmedPiPrompt === true,
      modelHooks: appSettings.modelHooks !== false,
      nativePiScanAltSkills: appSettings.nativePiScanAltSkills !== false,
      resourceDiscovery: this.config.resourceDiscovery,
      skillsDir: this.config.skillsDir,
      trustedReadRoots: this.config.trustedReadRoots,
      runLabel: this.config.runLabel,
      testBatch: this.config.testBatch,
      understandReadOnly: this.config.understandReadOnly,
      externalSkillPaths: this.config.resolveExternalSkillPaths?.(),
      skillPrecedence: appSettings.skillPrecedence,
      extensionFactories: this.config.extensionFactories,
      ...this.agentTeamArgsFor(
        sessionDirs.sessionId,
        metadata.forkedFrom?.purpose ?? null,
        subagentConfig,
      ),
    });
    const visibility = metadata.visibility ?? this.fallbackVisibility;
    const consentSnapshot =
      withholdsFromResearch(visibility)
        ? {
            researcherReadable: metadata.consentSnapshot?.researcherReadable ?? false,
            quoteAfterAnonymization:
              metadata.consentSnapshot?.quoteAfterAnonymization ?? false,
            privateOverride: true,
          }
        : ( metadata.consentSnapshot ?? null);
    writeFoundationRecords({
      sessionRoot: sessionDirs.sessionRoot,
      recordsDir: sessionDirs.recordsDir,
      manifest: result.manifest,
      ownerAccountId: metadata.ownerAccountId ?? null,
      roleCondition: metadata.roleCondition ?? null,
      visibility,
      consentSnapshot,
      lastActivityAt: result.manifest.createdAt,
      retentionDueAt:
        this.retentionEnabled && visibility === "private"
          ? calculateRetentionDueAt(result.manifest.createdAt)
          : null,
      mode: result.getAltMode(),
      workspace: metadata.workspace ? result.manifest.workspace : null,
      forkedFrom: metadata.forkedFrom ?? null,
      helper: metadata.helper,
      studyTag: metadata.studyTag ?? null,
      modelOverride: metadata.modelOverride ?? null,
      subagentExecution: metadata.subagentExecution ?? null,
    });

    const managed = await this.createManaged({
      ...result,
      selectors,
      subagentConfig,
      openedFrom: "new",
      resumeWarnings: [],
      counters: { messageCount: 0, toolCallCount: 0, turnCount: 0 },
      transcript: [],
    });
    // Draft Full Access (v1.4.8): the core setter rejects non-work-capable
    // assemblies, which is the contract the WS draft layer relies on.
    if (metadata.fullAccess) {
      managed.setFullAccess(true);
    }
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
    forkPointEntryId?: string,
  ): Promise<SessionSnapshot> {
    if (purpose === "side") {
      return this.forkSession(sessionId, purpose, forkPointEntryId);
    }

    const parent = this.requireSession(sessionId);
    // Helper is fresh: it reads only stable parent configuration and does not
    // clone or mutate the live Pi path, so it remains available during a run.
    const header = readV4SessionHeader(parent.manifest.recordsDir);
    const child = await this.createSession(parent.selectors, {
      ownerAccountId: header?.ownerAccountId ?? null,
      roleCondition: header?.roleCondition ?? null,
      visibility: header?.visibility ?? this.fallbackVisibility,
      consentSnapshot: header?.consentSnapshot ?? null,
      workspace: header?.workspace ?? null,
      studyTag: header?.studyTag ?? null,
      modelOverride: header?.modelOverride ?? null,
      forkedFrom: { sessionId, purpose },
      mode: parent.getAltMode(),
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
    },);
    return child;
  }

  /**
   * "Add to conversation list" (alpha.6): the child earns a place in the
   * session list while KEEPING its purpose, so the list can say where it came
   * from ("From subagent", "From BTW"). Renaming a subagent into a branch was the
   * old behavior and it read as a lie.
   */
  promoteRelatedSession(sessionId: string): SessionSnapshot | null {
    const dirs = getSessionDirs(this.config.dataDir, sessionId);
    if (!dirs) throw new Error(`Unknown session id: ${sessionId}`);
    const header = readV4SessionHeader(dirs.recordsDir);
    if (!header?.forkedFrom) {
      throw new Error("Only a related child can be added to the list");
    }
    if (
      !(["side", "helper", "subagent"] as ForkPurpose[]).includes(
        header.forkedFrom.purpose,
      )
    ) {
      throw new Error("This related conversation is already in the list");
    }
    const previousPurpose = header.forkedFrom.purpose;
    writeSessionHeader(dirs.recordsDir, {
      ...header,
      forkedFrom: { ...header.forkedFrom, listed: true },
    });
    appendSessionEvent(dirs.recordsDir, {
      sessionId,
      type: "related_session_promoted",
      details: { previousPurpose, purpose: previousPurpose, listed: true },
    });
    const live = this.sessions.get(sessionId);
    return live ? this.snapshot(live) : null;
  }

  /**
   * Role swap (v1.4 M4b): make this conversation the fork tree's listed
   * representative; the current representative steps down. Lineage never
   * changes. Works in both directions (promote a branch / re-list a
   * delisted ancestor).
   */
  promoteToMainline(sessionId: string): { delistedSessionId: string | null } {
    const result = promoteToMainlineRecords(this.config.dataDir, sessionId);
    const dirs = getSessionDirs(this.config.dataDir, sessionId);
    if (dirs) {
      appendSessionEvent(dirs.recordsDir, {
        sessionId,
        type: "mainline_promoted",
        details: { delistedSessionId: result.delistedSessionId },
      });
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Agent team (alpha.5 M2) — AgentTeamBridge implementation.
  //
  // Children are real sessions (forkedFrom purpose "subagent") on the same
  // substrate as helper/side children: durable records, run lineage, M0
  // break-point continuity, the right-rail shell, promotion, and direct user
  // messaging all come for free. This block adds only: spawn, addressed
  // envelopes (agent-mail.jsonl), and wake delivery.
  // -------------------------------------------------------------------------

  private resolveSubagentModelReference(
    parent: ManagedSession,
    reference: string,
  ): SessionModelOverride | null {
    if (modelReferenceIdentity(reference) === "inherit") {
      const model = parent.session.model;
      if (!model) throw new Error("The lead conversation has no model to inherit");
      if (isNoModelPlaceholder(model)) return null;
      const suffix = reference.startsWith("inherit:")
        ? reference.slice("inherit:".length)
        : null;
      return {
        provider: model.provider,
        modelId: model.id,
        thinkingLevel:
          suffix && THINKING_LEVELS.includes(suffix as (typeof THINKING_LEVELS)[number])
            ? (suffix as ThinkingLevel)
            : parent.session.thinkingLevel,
      };
    }
    const resolved = resolveCliModel({
      cliModel: reference,
      modelRuntime: parent.session.modelRuntime,
    });
    if (!resolved.model) {
      throw new Error(resolved.error ?? `Could not resolve ${reference}`);
    }
    return {
      provider: resolved.model.provider,
      modelId: resolved.model.id,
      ...(resolved.thinkingLevel
        ? { thinkingLevel: resolved.thinkingLevel }
        : {}),
    };
  }

  async spawnSubagent(
    parentSessionId: string,
    options: SpawnSubagentOptions,
  ): Promise<{ report: string; sessionId: string }> {
    const parent = this.requireSession(parentSessionId);
    const header = readV4SessionHeader(parent.manifest.recordsDir);
    const mode = clampSubagentMode(parent.getAltMode(), options.mode);

    // Validate against the parent's assembled snapshot, not the current file:
    // within one open conversation, prompt candidates and spawn validation
    // cannot diverge (v1.4.7 managed-session configuration boundary).
    const config = parent.subagentConfig;
    const agentType = options.agentType ?? config.defaultAgent;
    const preset = config.agents.find((agent) => agent.id === agentType);
    if (!preset) {
      throw new Error(
        `Unknown agent type "${agentType}". Available: ${config.agents.map((agent) => agent.id).join(", ")}`,
      );
    }
    if (
      options.model &&
      !subagentModelCandidates(config).includes(modelReferenceIdentity(options.model))
    ) {
      throw new Error(
        `Model override "${options.model}" is not in the configured subagent candidates.`,
      );
    }
    const modelChain: SessionModelOverride[] = [];
    const warnings: string[] = [];
    for (const reference of [
      options.model ?? preset.model,
      ...preset.fallbackModels,
    ]) {
      try {
        const resolved = this.resolveSubagentModelReference(parent, reference);
        if (resolved &&
          !modelChain.some(
            (entry) =>
              entry.provider === resolved.provider &&
              entry.modelId === resolved.modelId &&
              entry.thinkingLevel === resolved.thinkingLevel,
          )
        ) {
          modelChain.push(resolved);
        }
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error));
      }
    }
    const modelOverride = modelChain[0];
    if (!modelOverride && !isNoModelPlaceholder(parent.session.model)) {
      throw new Error(`No model in subagent preset "${agentType}" could be resolved.`);
    }

    const child = await this.createSession(parent.selectors, {
      ownerAccountId: header?.ownerAccountId ?? null,
      roleCondition: header?.roleCondition ?? null,
      visibility: header?.visibility ?? this.fallbackVisibility,
      consentSnapshot: header?.consentSnapshot ?? null,
      workspace: header?.workspace ?? null,
      studyTag: header?.studyTag ?? null,
      modelOverride: modelOverride ?? null,
      subagentExecution: { agentType, modelChain },
      forkedFrom: { sessionId: parentSessionId, purpose: "subagent" },
      mode,
    });
    const childManaged = this.requireSession(child.sessionId);
    // Prefer a human name when given. Default is English "Subagent N" (space),
    // not "subagent-N". List UI still prefixes siblings as "Subagent N · …".
    const priorSubagents = this.subagentChildren(parentSessionId).filter(
      (w) => w.sessionId !== child.sessionId,
    );
    const label =
      options.name?.trim() || `Subagent ${priorSubagents.length + 1}`;
    writeJsonAtomic(join(childManaged.manifest.recordsDir, "ui-alias.json"), {
      schemaVersion: 1,
      alias: label,
      updatedAt: new Date().toISOString(),
    });
    appendSessionEvent(parent.manifest.recordsDir, {
      sessionId: parentSessionId,
      type: "subagent_spawned",
      details: { childSessionId: child.sessionId, label, mode },
    });
    appendAgentMail(parent.manifest.recordsDir, {
      at: new Date().toISOString(),
      from: child.sessionId,
      to: parentSessionId,
      kind: "lifecycle",
      event: "spawned",
      body: `Subagent "${label}" spawned.`,
      delivered: true,
    });

    const started = this.startSubagentRun(child.sessionId, options.message.trim(), true);
    const report = [
      `Spawned subagent "${label}" (session ${child.sessionId}, ${agentType}, ${mode === "understand" ? "understand" : "work"} mode, ${modelOverride ? `model ${modelOverride.provider}/${modelOverride.modelId}${modelOverride.thinkingLevel ? `:${modelOverride.thinkingLevel}` : ""}` : "no model selected"}).`,
      started === "queued"
        ? `It is queued behind ${SUBAGENT_CONCURRENCY} running subagents and starts automatically.`
        : "It is working in the background.",
      "Its completion will arrive in this conversation automatically; keep working meanwhile.",
      warnings.length ? `Skipped unavailable configured models: ${warnings.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return { report, sessionId: child.sessionId };
  }

  async sendToSubagent(
    parentSessionId: string,
    agent: string,
    message: string,
  ): Promise<string> {
    const childId = this.resolveSubagentId(parentSessionId, agent);
    if (!this.sessions.get(childId)) {
      const parent = this.requireSession(parentSessionId);
      await this.openSession(childId, parent.selectors);
    }
    const child = this.requireSession(childId);
    const envelope: AgentMailEnvelope = {
      at: new Date().toISOString(),
      from: parentSessionId,
      to: childId,
      kind: "message",
      body: message,
      delivered: true,
    };
    appendAgentMail(child.manifest.recordsDir, envelope);
    const fragment = formatEnvelopeForContext(envelope, "lead");
    if (child.busy || child.session.isStreaming) {
      await child.session.steer(fragment);
      return "Delivered: the subagent sees your message at its next step.";
    }
    // A message to an idle subagent always acts (owner 2026-08-07: the old
    // opt-in start_turn left messages lying unread — removed).
    if (!this.queuedSubagentIds.has(childId)) {
      const queued = this.startSubagentRun(childId, fragment, true);
      return queued === "queued"
        ? "The subagent is queued; it acts on your message when a slot frees up."
        : "The subagent is acting on your message now.";
    }
    // A queued subagent already has a pending run; starting another would
    // double-queue it, so the message joins its context instead.
    await child.session.sendCustomMessage(
      {
        customType: "agent-team",
        content: fragment,
        display: true,
        details: { from: parentSessionId },
      },
      { triggerTurn: false },
    );
    return "Queued: the subagent sees your message with its next turn.";
  }

  async checkSubagent(
    parentSessionId: string,
    agent: string,
    verbose: boolean,
  ): Promise<string> {
    const childId = this.resolveSubagentId(parentSessionId, agent);
    const lines = [this.subagentStatusLine(parentSessionId, childId)];
    if (verbose) {
      const transcript =
        readSessionDetail(this.config.dataDir, childId)?.transcript ?? [];
      for (const message of transcript.slice(-6)) {
        lines.push(`${message.role}: ${clip(message.text, 300)}`);
      }
    } else {
      const result = this.subagentResultText(childId, 800);
      if (result) lines.push(`last output: ${result}`);
    }
    return lines.join("\n");
  }

  async waitForSubagents(
    parentSessionId: string,
    agents: string[] | null,
    timeoutS: number,
    signal?: AbortSignal,
  ): Promise<string> {
    const watched = agents?.length
      ? agents.map((agent) => this.resolveSubagentId(parentSessionId, agent))
      : this.subagentChildren(parentSessionId)
          .map((child) => child.sessionId)
          .filter((id) => this.subagentIsActive(id));
    if (watched.length === 0) {
      return "No running subagents to wait for.";
    }
    const initiallyActive = watched.filter((id) => this.subagentIsActive(id));
    const deadline = Date.now() + timeoutS * 1000;
    // The agent loop awaits this tool's promise, so honoring the run's abort
    // signal is what lets a user stop release the wait before its timeout
    // instead of leaving the turn (and the composer's stop state) blocked.
    while (
      Date.now() < deadline &&
      initiallyActive.length > 0 &&
      !initiallyActive.some((id) => !this.subagentIsActive(id)) &&
      !signal?.aborted
    ) {
      await sleep(300);
    }
    if (signal?.aborted) {
      return [
        "Wait cut short by the user's stop. Any still-running watched subagents keep running; their completions still arrive as notifications.",
        ...watched.map((id) => this.subagentStatusLine(parentSessionId, id)),
      ].join("\n");
    }
    return watched
      .map((id) => this.subagentStatusLine(parentSessionId, id))
      .join("\n");
  }

  async interruptSubagent(
    parentSessionId: string,
    agent: string,
  ): Promise<string> {
    const childId = this.resolveSubagentId(parentSessionId, agent);
    if (this.queuedSubagentIds.has(childId)) {
      this.queuedSubagentIds.delete(childId);
      const queued = this.subagentQueue.findIndex(
        (entry) => entry.childId === childId,
      );
      if (queued >= 0) this.subagentQueue.splice(queued, 1);
      return "Removed from the queue before it started. Use send_to_agent to give it a task later.";
    }
    const child = this.sessions.get(childId);
    if (!child || (!child.busy && !child.session.isStreaming)) {
      return "The subagent is not running; nothing to interrupt.";
    }
    await this.abort(childId, "interrupt_agent");
    return "Interrupted. The subagent's completed work is kept; message it with send_to_agent to continue.";
  }

  async listSubagents(parentSessionId: string): Promise<string> {
    const children = this.subagentChildren(parentSessionId);
    if (children.length === 0) {
      return "No subagents in this conversation. Use spawn_agent to delegate a task.";
    }
    return children
      .map((child) => this.subagentStatusLine(parentSessionId, child.sessionId))
      .join("\n");
  }

  async messageParent(
    childSessionId: string,
    message: string,
    kind: "update" | "blocker",
  ): Promise<string> {
    const child = this.requireSession(childSessionId);
    const parentId = child.subagentParentId;
    if (!parentId) {
      throw new Error("This conversation has no lead conversation to message");
    }
    this.deliverEnvelope(parentId, {
      at: new Date().toISOString(),
      from: childSessionId,
      to: parentId,
      kind: "message",
      ...(kind === "blocker" ? { event: "input-requested" as const } : {}),
      body: message,
    });
    return kind === "blocker"
      ? "Blocker sent to the lead conversation. Continue any work that does not depend on the answer."
      : "Update sent to the lead conversation.";
  }

  /**
   * Direct subagent children of a session, with their display aliases. Live
   * sessions first: a just-spawned subagent has no persisted turn yet, so the
   * durable catalog (which filters empty sessions) cannot be the only source.
   */
  private subagentChildren(
    parentSessionId: string,
  ): Array<{ sessionId: string; alias: string | null }> {
    const ids = new Set<string>();
    for (const [sessionId, managed] of this.sessions) {
      if (managed.subagentParentId === parentSessionId) ids.add(sessionId);
    }
    for (const summary of listSessionSummaries(this.config.dataDir).sessions) {
      if (
        summary.forkedFrom?.sessionId === parentSessionId &&
        summary.forkedFrom.purpose === "subagent" &&
        !summary.deletedAt
      ) {
        ids.add(summary.sessionId);
      }
    }
    return [...ids].map((sessionId) => ({
      sessionId,
      alias: this.sessionAlias(sessionId),
    }));
  }

  private resolveSubagentId(parentSessionId: string, agent: string): string {
    const needle = agent.trim();
    const children = this.subagentChildren(parentSessionId);
    const match =
      children.find((child) => child.sessionId === needle) ??
      children.find(
        (child) => child.alias?.toLowerCase() === needle.toLowerCase(),
      );
    if (!match) {
      throw new Error(
        `Unknown subagent "${agent}". Use list_agents to see this conversation's subagents.`,
      );
    }
    return match.sessionId;
  }

  private sessionAlias(sessionId: string): string | null {
    const dirs = getSessionDirs(this.config.dataDir, sessionId);
    if (!dirs) return null;
    try {
      const raw = JSON.parse(
        readFileSync(join(dirs.recordsDir, "ui-alias.json"), "utf-8"),
      ) as { alias?: unknown };
      return typeof raw.alias === "string" ? raw.alias : null;
    } catch {
      return null;
    }
  }

  private subagentIsActive(sessionId: string): boolean {
    if (this.queuedSubagentIds.has(sessionId)) return true;
    const managed = this.sessions.get(sessionId);
    return Boolean(managed && (managed.busy || managed.session.isStreaming));
  }

  private subagentStatusLine(parentSessionId: string, sessionId: string): string {
    const alias = this.sessionAlias(sessionId) ?? sessionId;
    let status = "idle";
    if (this.queuedSubagentIds.has(sessionId)) {
      status = "queued";
    } else if (this.subagentIsActive(sessionId)) {
      status = "running";
    } else {
      const dirs = getSessionDirs(this.config.dataDir, sessionId);
      const latest = dirs
        ? latestRunSnapshots(dirs.recordsDir).at(-1)
        : undefined;
      if (latest?.status === "failed") status = "failed";
      else if (latest?.status === "aborted") status = "interrupted";
      else if (latest?.status === "completed") status = "finished";
    }
    return `${alias} (${sessionId}): ${status}`;
  }

  /** Final answer text of a subagent's latest completed turn. */
  private subagentResultText(sessionId: string, maxChars = 4000): string {
    const transcript =
      readSessionDetail(this.config.dataDir, sessionId)?.transcript ?? [];
    const lastAssistant = [...transcript]
      .reverse()
      .find((message) => message.role === "assistant" && message.text.trim());
    return clip(
      lastAssistant?.text.trim() ??
        "(the subagent has produced no text answer yet)",
      maxChars,
    );
  }

  /**
   * Start (or queue) a subagent turn. Background subagent turns are capped at
   * SUBAGENT_CONCURRENCY; excess first-runs start FIFO as slots free up.
   */
  private startSubagentRun(
    childId: string,
    prompt: string,
    notifyParent: boolean,
  ): "started" | "queued" {
    const start = () => {
      this.queuedSubagentIds.delete(childId);
      let handle: RunHandle;
      try {
        handle = this.runPromptWithLineage(this.requireSession(childId), prompt, {
          notifyParent,
        });
      } catch (error) {
        const child = this.sessions.get(childId);
        if (notifyParent && child) {
          this.deliverSubagentOutcome(
            child,
            "failed",
            `The subagent's turn could not start: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        return;
      }
      this.runningSubagentRuns += 1;
      void handle.completion
        .catch(() => {})
        .finally(() => {
          this.runningSubagentRuns -= 1;
          this.drainSubagentQueue();
        });
    };
    if (this.runningSubagentRuns >= SUBAGENT_CONCURRENCY) {
      this.queuedSubagentIds.add(childId);
      this.subagentQueue.push({ childId, start });
      return "queued";
    }
    start();
    return "started";
  }

  private drainSubagentQueue(): void {
    while (
      this.runningSubagentRuns < SUBAGENT_CONCURRENCY &&
      this.subagentQueue.length > 0
    ) {
      this.subagentQueue.shift()?.start();
    }
  }

  private deliverSubagentOutcome(
    child: ManagedSession,
    event: "completed" | "failed" | "interrupted",
    body: string,
  ): void {
    if (!child.subagentParentId) return;
    this.deliverEnvelope(child.subagentParentId, {
      at: new Date().toISOString(),
      from: child.manifest.sessionId,
      to: child.subagentParentId,
      kind: "lifecycle",
      event,
      body,
    });
  }

  /**
   * Wake-and-deliver (design record, "Wake and delivery"):
   * - receiver running -> steer (seen at its next step boundary);
   * - receiver open and idle -> a notification turn through the normal
   *   run-record path, so lineage stays truthful and a failed wake still
   *   leaves a visible failed-run line;
   * - receiver closed -> the envelope stays undelivered in its durable inbox
   *   and is injected into context on next open (openSession).
   */
  private deliverEnvelope(
    targetSessionId: string,
    envelope: Omit<AgentMailEnvelope, "delivered">,
  ): void {
    const dirs = getSessionDirs(this.config.dataDir, targetSessionId);
    if (!dirs) return;
    const target = this.sessions.get(targetSessionId);
    if (!target) {
      appendAgentMail(dirs.recordsDir, { ...envelope, delivered: false });
      return;
    }
    // ponytail: delivered is recorded before the async steer/turn settles;
    // the envelope itself is durable either way.
    appendAgentMail(dirs.recordsDir, { ...envelope, delivered: true });
    const fragment = formatEnvelopeForContext(
      { ...envelope, delivered: true },
      this.agentMailLabel(envelope.from, target),
    );
    if (target.busy || target.session.isStreaming) {
      void target.session.steer(fragment).catch(() => {});
      return;
    }
    try {
      const handle = this.runPromptWithLineage(target, fragment);
      void handle.completion.catch(() => {});
    } catch (error) {
      if (error instanceof SessionBusyError) {
        void target.session.steer(fragment).catch(() => {});
      }
    }
  }

  private agentMailLabel(from: string, target: ManagedSession): string {
    if (from === "user") return "user";
    if (target.subagentParentId === from) return "lead";
    return this.sessionAlias(from) ?? from;
  }

  private async createManagedFromExisting(
    sessionId: string,
    fallbackSelectors: SessionSelectors,
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
        `Session cannot be opened because Pi JSONL is missing: ${sessionId}`,
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
      (slug) => this.resolveOptionalRolePresetPath(slug),
    );
    const importedWithoutSoul =
      existsSync(join(sessionDirs.recordsDir, "session-import-source.json")) &&
      (effectiveConfig?.soulSlug ?? detail.manifest?.soul?.slug) == null;
    const requestedSoulSlug = importedWithoutSoul
      ? fallbackSelectors.soulSlug
      : effectiveConfig?.soulSlug ?? detail.manifest?.soul?.slug;
    const activeSoulSlug = this.activeOptionalSlug(
      requestedSoulSlug,
      fallbackSelectors.soulSlug,
      (slug) => this.resolveOptionalSoulPath(slug),
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
        }.`,
      );
    }
    if (
      typeof requestedSoulSlug === "string" &&
      activeSoulSlug !== requestedSoulSlug
    ) {
      assetWarnings.push(
        `This conversation's original soul "${requestedSoulSlug}" is not in this build — continuing with ${
          activeSoulSlug ? `"${activeSoulSlug}"` : "no soul"
        }.`,
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
        `This conversation's original knowledge domain "${originalDomain}" is not in this build — continuing with "${activeDomain}".`,
      );
    }
    const activeInstructionRef = this.activeInstructionRef(
      effectiveCustomInstructionRef ?? detail.manifest?.customInstruction?.ref,
      fallbackSelectors.customInstructionRef,
    );
    const instruction = this.resolveOptionalInstruction(activeInstructionRef);
    const persistedHeader = readV4SessionHeader(sessionDirs.recordsDir);
    const persistedMode = persistedHeader?.mode ?? "understand";
    const appSettings = readAppSettings(this.config.dataDir);
    const subagentConfig = readSubagentConfig(this.config.dataDir).config;

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
        `This conversation's working folder "${persistedPrimaryDir}" no longer exists — continuing without a working folder. Drag the conversation onto a folder, or use the folder selector, to keep working there.`,
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
      kbDir: resolveKbDirForDomain(this.config.kbDir, activeDomain),
      kbDomain: activeDomain,
      piPromptTemplatesDir: this.config.assetPaths.piPromptTemplatesDir,
      ...this.modelArgsFor(persistedHeader?.modelOverride),
      altMode: persistedMode,
      runtimeMode: appSettings.runtimeMode ?? "alt-theory",
      trimmedPiBasePrompt: appSettings.experimentTrimmedPiPrompt === true,
      modelHooks: appSettings.modelHooks !== false,
      nativePiScanAltSkills: appSettings.nativePiScanAltSkills !== false,
      resourceDiscovery: this.config.resourceDiscovery,
      skillsDir: this.config.skillsDir,
      trustedReadRoots: this.config.trustedReadRoots,
      runLabel: this.config.runLabel,
      testBatch: this.config.testBatch,
      understandReadOnly: this.config.understandReadOnly,
      externalSkillPaths: this.config.resolveExternalSkillPaths?.(),
      skillPrecedence: appSettings.skillPrecedence,
      extensionFactories: this.config.extensionFactories,
      ...this.agentTeamArgsFor(
        sessionId,
        persistedHeader?.forkedFrom?.purpose ?? null,
        subagentConfig,
      ),
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
        }. Your next message will use it; you can pick another model any time.`,
      );
      const {
        modelProvider: _staleProvider,
        modelId: _staleModel,
        ...openArgsWithoutStaleModel
      } = openArgs;
      result = await openAltTheorySession({
        ...openArgsWithoutStaleModel,
        ...fallback,
      });
    }
    const reconciledRuns = reconcileInterruptedRunOnOpen(
      result.session.sessionManager,
      result.manifest.recordsDir,
      "main",
    );
    alignSessionManagerToLatestRun(
      result.session.sessionManager,
      reconciledRuns,
      "latest active run",
    );
    resyncAgentContext(result.session);

    const managed = await this.createManaged({
      ...result,
      selectors: {
        rolePresetSlug: activeRolePresetSlug,
        kbDomain: activeDomain,
        soulSlug: activeSoulSlug,
        customInstructionRef: activeInstructionRef,
      },
      subagentConfig,
      openedFrom: "existing",
      resumeWarnings: [...assetWarnings, ...result.resumeWarnings],
      counters: {
        messageCount: detail.metrics?.messageCount ?? 0,
        toolCallCount: detail.metrics?.toolCallCount ?? 0,
        turnCount: detail.metrics?.turnCount ?? 0,
      },
      transcript: buildTranscriptFromEntries(
        result.session.sessionManager.getBranch(),
      ),
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
      managed.selectors,
    );
    if (fallbackChangedFields.length > 0) {
      appendConfigEvent(managed.manifest.recordsDir, {
        sessionId: managed.manifest.sessionId,
        reason: "resume_fallback",
        effective: buildEffectiveConfig(managed.manifest),
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
    previous: ManagedSession,
  ): Promise<ManagedSession> {
    const detail = readSessionDetail(this.config.dataDir, sessionId);
    const sessionFile = detail?.pi.sessionFile ?? previous.session.sessionFile;
    if (!sessionFile) {
      throw new Error(
        `Session cannot be reconfigured because Pi JSONL is missing: ${sessionId}`,
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
    const persistedMode = previous.getAltMode();
    const appSettings = readAppSettings(this.config.dataDir);
    const subagentConfig = readSubagentConfig(this.config.dataDir).config;
    const result = await openAltTheorySession({
      ...activeSessionDirs,
      workspaceDirs: previous.getWorkspace().additionalDirs,
      sessionFile,
      originalManifest: detail?.manifest ?? previous.manifest,
      appContextPath: this.config.assetPaths.appContextPath,
      soulPath: this.resolveOptionalSoulPath(selectors.soulSlug),
      soulSlug: selectors.soulSlug,
      rolePresetPath: this.resolveOptionalRolePresetPath(selectors.rolePresetSlug,),
      rolePresetSlug: selectors.rolePresetSlug,
      customInstructionPath: this.resolveOptionalInstruction(
        selectors.customInstructionRef,
      )?.path,
      customInstructionRef: selectors.customInstructionRef ?? null,
      kbDir: resolveKbDirForDomain(this.config.kbDir, selectors.kbDomain),
      kbDomain: selectors.kbDomain,
      piPromptTemplatesDir: this.config.assetPaths.piPromptTemplatesDir,
      ...this.modelArgsFor(
        readV4SessionHeader(sessionDirs.recordsDir)?.modelOverride,
      ),
      altMode: persistedMode,
      runtimeMode: appSettings.runtimeMode ?? "alt-theory",
      trimmedPiBasePrompt: appSettings.experimentTrimmedPiPrompt === true,
      modelHooks: appSettings.modelHooks !== false,
      nativePiScanAltSkills: appSettings.nativePiScanAltSkills !== false,
      resourceDiscovery: this.config.resourceDiscovery,
      skillsDir: this.config.skillsDir,
      trustedReadRoots: this.config.trustedReadRoots,
      runLabel: this.config.runLabel,
      testBatch: this.config.testBatch,
      understandReadOnly: this.config.understandReadOnly,
      externalSkillPaths: this.config.resolveExternalSkillPaths?.(),
      skillPrecedence: appSettings.skillPrecedence,
      extensionFactories: this.config.extensionFactories,
      ...this.agentTeamArgsFor(
        previous.manifest.sessionId,
        readV4SessionHeader(sessionDirs.recordsDir)?.forkedFrom?.purpose ?? null,
        subagentConfig,
      ),
      overrideSessionCwd: true,
    });
    if (detail) {
      alignSessionManagerToLatestRun(
        result.session.sessionManager,
        latestRunSnapshots(result.manifest.recordsDir),
        "latest active run",
      );
      resyncAgentContext(result.session);
    }

    return await this.createManaged({
      ...result,
      selectors,
      subagentConfig,
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
    mode?: AltMode;
    workspace?: { primaryDir: string; additionalDirs: string[] };
    modelOverride?: SessionModelOverride | null;
    /** Fork flows call this before the child's header exists on disk. */
    forkPurpose?: ForkPurpose;
  }): Promise<ManagedSession> {
    const instruction = this.resolveOptionalInstruction(
      args.selectors.customInstructionRef,
    );
    const persistedHeader = readV4SessionHeader(args.sessionDirs.recordsDir);
    const persistedMode = args.mode ?? persistedHeader?.mode ?? "understand";
    const appSettings = readAppSettings(this.config.dataDir);
    const subagentConfig = readSubagentConfig(this.config.dataDir).config;
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
        args.selectors.rolePresetSlug,
      ),
      rolePresetSlug: args.selectors.rolePresetSlug,
      customInstructionPath: instruction?.path ?? null,
      customInstructionRef: instruction?.ref ?? null,
      kbDir: resolveKbDirForDomain(this.config.kbDir, args.selectors.kbDomain),
      kbDomain: args.selectors.kbDomain,
      piPromptTemplatesDir: this.config.assetPaths.piPromptTemplatesDir,
      ...this.modelArgsFor(args.modelOverride ?? persistedHeader?.modelOverride,),
      altMode: persistedMode,
      runtimeMode: appSettings.runtimeMode ?? "alt-theory",
      trimmedPiBasePrompt: appSettings.experimentTrimmedPiPrompt === true,
      modelHooks: appSettings.modelHooks !== false,
      nativePiScanAltSkills: appSettings.nativePiScanAltSkills !== false,
      resourceDiscovery: this.config.resourceDiscovery,
      skillsDir: this.config.skillsDir,
      trustedReadRoots: this.config.trustedReadRoots,
      runLabel: this.config.runLabel,
      testBatch: this.config.testBatch,
      understandReadOnly: this.config.understandReadOnly,
      externalSkillPaths: this.config.resolveExternalSkillPaths?.(),
      skillPrecedence: appSettings.skillPrecedence,
      extensionFactories: this.config.extensionFactories,
      ...this.agentTeamArgsFor(
        args.sessionId,
        args.forkPurpose ?? persistedHeader?.forkedFrom?.purpose ?? null,
        subagentConfig,
      ),
    });
    if ("activeLeafEntryId" in args) {
      alignSessionManagerLeaf(
        result.session.sessionManager,
        args.activeLeafEntryId ?? null,
        `current Pi leaf for ${args.branchId}`,
      );
      resyncAgentContext(result.session);
    }
    return await this.createManaged({
      ...result,
      selectors: args.selectors,
      subagentConfig,
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
    getAltMode: () => AltMode;
    setAltMode: (mode: AltMode) => Promise<void>;
    getRuntimeMode: () => RuntimeMode;
    setRuntimeMode: (mode: RuntimeMode) => Promise<void>;
    setNativePiScanAltSkills: (enabled: boolean) => Promise<void>;
    getFullAccess: () => boolean;
    setFullAccess: (enabled: boolean) => void;
    getWorkspace: () => { primaryDir: string; additionalDirs: string[] };
    addWorkspaceDir: (dir: string) => Promise<string[]>;
    selectors: SessionSelectors;
    subagentConfig: SubagentConfig;
    openedFrom: "new" | "existing";
    resumeWarnings: string[];
    counters: SessionCounters;
    transcript: TranscriptMessage[];
    branchId?: string;
  }): Promise<ManagedSession> {
    const persistedRuns = latestRunSnapshots(args.manifest.recordsDir);
    const approvalBridge = new ApprovalBridge({
      onRequest: (request) => {
        this.emitRunPhase(managed, "awaiting-user");
        const event = {
          type: "approval_requested" as const,
          payload: { ...request, sessionId: managed.manifest.sessionId },
        };
        this.emit(managed, event);
        for (const listener of this.approvalListeners) listener(event);
      },
      onResolve: (approvalId, resolution) => {
        const event = {
          type: "approval_resolved",
          payload: {
            sessionId: managed.manifest.sessionId,
            approvalId,
            resolution,
          },
        } as const;
        this.emit(managed, event);
        for (const listener of this.approvalListeners) listener(event);
        this.emitRunPhase(managed, managed.busy ? "processing" : "idle");
      },
      onNotify: (message, level) =>
        this.emit(managed, {
          type: "extension_notice",
          payload: { message, level },
        }),
    });
    const header = readV4SessionHeader(args.manifest.recordsDir);
    const headerForkedFrom = header?.forkedFrom;
    const managed: ManagedSession = {
      ...args,
      approvalBridge,
      transcriptStamp: null,
      liveRun: null,
      pendingInterruptionCause: null,
      listeners: new Set(),
      internalUnsubscribe: () => {},
      busy: false,
      subagentParentId:
        headerForkedFrom?.purpose === "subagent"
          ? headerForkedFrom.sessionId
          : null,
      subagentModelChain: header?.subagentExecution?.modelChain ?? [],
      nextTurnIndex: Math.max(
        1,
        args.counters.turnCount + 1,
        maxCounter(persistedRuns.map((run) => run.turnId), "turn",) + 1,
      ),
      nextRevisionIndex:
        maxCounter(persistedRuns.map((run) => run.revisionId), "rev",) + 1,
      nextRunIndex:
        maxCounter(persistedRuns.map((run) => run.runId), "run",) + 1,
      branchId: args.branchId ?? "main",
      fallbackAttempts: 0,
      pendingRunWork: null,
      pendingRuntimeMode: null,
      pendingNativePiScanAltSkills: null,
    };
    managed.internalUnsubscribe = managed.session.subscribe((event) =>
      this.handleAgentEvent(managed, event),
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
    action: "revise" | "delete",
  ): RunRecord & { userEntryId: string } {
    const allRuns = latestRunSnapshots(managed.manifest.recordsDir).filter(
      (run) => run.branchId === managed.branchId,
    );
    // Entry IDs whose runs are deleted or superseded remain in Pi's persisted tree
    // for evidence, but no longer count as active transcript turns — unless an
    // active run also claims the entry (a break-point retry adopts the failed
    // run's user entry; that turn must stay revisable).
    const activeUserEntryIds = new Set(
      allRuns
        .filter(
          (run) => run.status !== "deleted" && run.status !== "superseded",
        )
        .map((run) => run.userEntryId)
        .filter(Boolean) as string[],
    );
    const inactiveUserEntryIds = new Set(
      (
        allRuns
          .filter((run) => run.status === "deleted" || run.status === "superseded",)
          .map((run) => run.userEntryId)
          .filter(Boolean) as string[]
      ).filter((entryId) => !activeUserEntryIds.has(entryId)),
    );
    const latest = allRuns
      .filter((run) => run.status === "completed" && run.userEntryId)
      .at(-1);
    if (!latest?.userEntryId) {
      throw new Error(`No completed latest user turn is available to ${action}`,);
    }
    const activeUserEntries = managed.session.sessionManager
      .getBranch()
      .filter(
        (entry) =>
          entry.type === "message" &&
          (entry.message as { role?: string }).role === "user" &&
          !inactiveUserEntryIds.has(entry.id),
      );
    if (activeUserEntries.at(-1)?.id !== latest.userEntryId) {
      throw new Error(
        `Only the current latest user turn can be ${action === "revise" ? "revised" : "deleted"}`,
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
    this.emitRunPhase(managed, "error");
    // The run owner emits run_failed after its terminal run mapping is durable,
    // so transcript refresh and recovery actions cannot race an accepted record.
  }

  private async tryModelFallback(
    managed: ManagedSession,
    error: string,
  ): Promise<boolean> {
    if (managed.subagentParentId && managed.subagentModelChain.length > 0) {
      return this.trySubagentModelFallback(managed, error);
    }
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
      error,
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
      resolved = managed.session.modelRuntime.getModel(
        next.provider,
        next.modelId,
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
    this.emit(managed, {
      type: "extension_notice",
      payload: {
        message: `Switched from ${currentModel.provider}/${currentModel.id} to ${next.provider}/${next.modelId} after a model error.`,
        level: "info",
      },
    });

    await continueAgentTurnAfterModelSwitch(managed.session);
    return true;
  }

  /**
   * Whether a subagent child has already become alive — produced valid
   * assistant text or executed a tool. Thinking-only output does not count.
   * Derived from the live branch, so a reopened child derives it from its
   * persisted history without extra schema (v1.4.7 initial-spawn gate).
   */
  private subagentHasProducedWork(managed: ManagedSession): boolean {
    for (const entry of managed.session.sessionManager.getBranch()) {
      if (entry.type !== "message") continue;
      const message = entry.message as {
        role?: string;
        content?: unknown;
      };
      if (message.role === "toolResult") return true;
      if (
        message.role === "assistant" &&
        Array.isArray(message.content) &&
        (message.content as Array<{ type?: string; text?: string }>).some(
          (part) =>
            part.type === "text" &&
            typeof part.text === "string" &&
            part.text.trim().length > 0,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  private async trySubagentModelFallback(
    managed: ManagedSession,
    error: string,
  ): Promise<boolean> {
    const current = managed.session.model;
    if (!current) return false;
    // The preset chain exists only to recover an initial spawn whose selected
    // model cannot start the child. Once the child is alive, later turns are
    // ordinary session turns and must not re-enter the chain; a model that is
    // not in the chain is not "before index zero" either.
    if (this.subagentHasProducedWork(managed)) return false;
    const currentIndex = managed.subagentModelChain.findIndex(
      (entry) =>
        entry.provider === current.provider &&
        entry.modelId === current.id &&
        (entry.thinkingLevel === undefined ||
          entry.thinkingLevel === managed.session.thinkingLevel),
    );
    if (currentIndex < 0) return false;
    for (
      let index = currentIndex + 1;
      index < managed.subagentModelChain.length;
      index++
    ) {
      const next = managed.subagentModelChain[index];
      const resolved = managed.session.modelRuntime.getModel(
        next.provider,
        next.modelId,
      );
      if (!resolved) continue;
      await managed.session.setModel(resolved);
      managed.session.setThinkingLevel(
        next.thinkingLevel ?? this.initialThinkingLevel(next.provider, next.modelId),
      );
      managed.manifest.provider = next.provider;
      managed.manifest.model = next.modelId;
      this.persistManifestModel(managed);
      const header = readV4SessionHeader(managed.manifest.recordsDir);
      if (header) {
        writeSessionHeader(managed.manifest.recordsDir, {
          ...header,
          modelOverride: { ...next },
        });
      }
      appendSessionEvent(managed.manifest.recordsDir, {
        sessionId: managed.manifest.sessionId,
        type: "model_fallback",
        details: {
          fromModel: `${current.provider}/${current.id}`,
          toModel: `${next.provider}/${next.modelId}`,
          thinkingLevel: next.thinkingLevel ?? null,
          ruleId: "subagent-preset",
          error,
        },
      });
      this.emit(managed, {
        type: "extension_notice",
        payload: {
          message: `Subagent fallback: ${current.provider}/${current.id} → ${next.provider}/${next.modelId}${next.thinkingLevel ? `:${next.thinkingLevel}` : ""}.`,
          level: "info",
        },
      });
      await continueAgentTurnAfterModelSwitch(managed.session);
      return true;
    }
    return false;
  }

  private handleAgentEvent(
    managed: ManagedSession,
    event: AgentSessionEvent,
  ): void {
    switch (event.type) {
      case "agent_start":
        this.emitRunPhase(managed, "processing");
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
          this.emit(managed, {
            type: "assistant_delta",
            payload: { text: assistantEvent.delta ?? "" },
          });
        }
        break;
      }
      case "tool_execution_start":
        this.emitRunPhase(managed, "tool");
        this.emit(managed, {
          type: "tool_started",
          payload: {
            toolName: event.toolName,
            callId: event.toolCallId,
            path: extractToolPathFromEvent(event),
            detail:
              extractToolDetail(
                event.toolName,
                (event as { args?: unknown }).args
              ) ?? undefined,
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
          this.emitRunPhase(managed, "processing");
        }
        break;
      case "auto_retry_start":
        // Pi is waiting out a transient provider error before resuming the
        // turn from the last completed step. Completed tool calls stay in
        // context; only the dropped stream's partial message is regenerated.
        this.emitRunPhase(managed, "retrying", {
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          delayMs: event.delayMs,
        });
        break;
      case "compaction_start":
        this.emitRunPhase(managed, "compacting");
        break;
      case "compaction_end": {
        // Compaction events are the state authority (manual, threshold,
        // overflow). Only a completed, non-aborted boundary (result present)
        // is published; an aborted or failed compaction left no boundary.
        if (!event.aborted && !event.errorMessage && event.result) {
          this.publishCompactionBoundary(managed);
        }
        this.emitRunPhase(managed, event.willRetry ? "processing" : "idle");
        break;
      }
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
          managed.busy =
            managed.pendingRuntimeMode !== null ||
            managed.pendingNativePiScanAltSkills !== null;
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
    phase:
      | "connecting"
      | "processing"
      | "thinking"
      | "tool"
      | "compacting"
      | "retrying"
      | "awaiting-user"
      | "idle"
      | "error",
    retry?: { attempt: number; maxAttempts: number; delayMs: number },
  ): void {
    this.emit(managed, {
      type: "run_phase",
      payload: retry ? { phase, retry } : { phase },
    });
  }

  private emit(managed: ManagedSession, event: SessionServiceEvent): void {
    // Late-joiner replay: every event of the in-flight turn passes through
    // here, so this one intercept keeps the buffer complete by construction.
    if (event.type === "run_completed" || event.type === "run_failed") {
      managed.liveRun = null;
    } else if (managed.liveRun) {
      appendLiveRunEvent(managed.liveRun, event);
    }
    for (const listener of managed.listeners) {
      listener(event);
    }
  }

  /** The in-flight turn's prompt + buffered stream, for attach replay. */
  getLiveRun(sessionId: string): LiveRun | null {
    const managed = this.sessions.get(sessionId);
    if (!managed || !managed.liveRun) return null;
    if (!managed.busy && !managed.session.isStreaming) return null;
    return managed.liveRun;
  }

  private snapshot(
    managed: ManagedSession,
    overrides?: Partial<SessionSnapshot>,
  ): SessionSnapshot {
    const header = readV4SessionHeader(managed.manifest.recordsDir);
    return {
      sessionId: managed.manifest.sessionId,
      visibility: header?.visibility ?? this.fallbackVisibility,
      retentionDueAt: header?.retentionDueAt ?? null,
      status: managed.busy || managed.session.isStreaming ? "running" : "idle",
      currentDomain: managed.selectors.kbDomain,
      rolePresetSlug: managed.selectors.rolePresetSlug,
      soulSlug: managed.selectors.soulSlug,
      customInstructionRef: managed.selectors.customInstructionRef ?? null,
      mode: managed.getAltMode(),
      fullAccess: managed.getFullAccess(),
      modelOverride: header?.modelOverride ?? null,
      currentModel: managed.session.model && !isNoModelPlaceholder(managed.session.model)
        ? {
            provider: managed.session.model.provider,
            modelId: managed.session.model.id,
          }
        : undefined,
      studyTag: header?.studyTag ?? null,
      workspace: managed.getWorkspace(),
      openedFrom: managed.openedFrom,
      resumeWarnings: managed.resumeWarnings,
      messageCount: managed.counters.messageCount,
      recovery: this.latestRecoveryState(managed),
      ...overrides,
    };
  }

  private latestRecoveryState(managed: ManagedSession): TurnRecovery | null {
    const latest = latestRunSnapshots(managed.manifest.recordsDir)
      .filter(
        (run) =>
          run.branchId === managed.branchId &&
          run.userEntryId &&
          run.status !== "deleted" &&
          run.status !== "superseded",
      )
      .at(-1);
    if (!latest?.userEntryId) return null;
    const outcome = runOutcome(latest);
    if (outcome !== "interrupted" && outcome !== "failed") return null;
    return {
      outcome,
      interruptionCause: runInterruptionCause(latest),
      userEntryId: latest.userEntryId,
      canContinue: true,
      canRetryFromStart: true,
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
        managed.session.sessionFile && existsSync(managed.session.sessionFile),
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
      this.config.legacySoulPath,
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
          ref,
        )
      : null;
  }

  private activeInstructionRef(
    original: string | null | undefined,
    fallback: string | null | undefined,
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
    resolvePath: (slug: string | null) => string | null,
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

/** Turn Pi's persisted expanded skill body back into the invocation it came from. */
export function retryPromptFromStoredUserContent(content: string): string {
  const trimmed = content.trim();
  const skill = trimmed.match(
    /^<skill\b[^>]*\bname="([^"]+)"[^>]*>[\s\S]*?<\/skill>\s*([\s\S]*)$/,
  );
  if (!skill) return trimmed;
  const args = skill[2].trim();
  return `/skill:${skill[1]}${args ? ` ${args}` : ""}`;
}

/** User-facing text for an in-flight prompt; internal skill commands stay hidden. */
export function displayUserTextFromPrompt(prompt: string): string | null {
  const skill = prompt.trim().match(/^\/skill:[^\s]+(?:\s+([\s\S]*))?$/);
  const text = skill ? (skill[1] ?? "") : stripSkillWrapper(prompt);
  return text.trim() || null;
}

function clip(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
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
  record: RunRecord,
): Omit<RunRecord, "schemaVersion" | "recordType" | "status"> {
  const {
    schemaVersion: _schemaVersion,
    recordType: _recordType,
    status: _status,
    ...body
  } = record;
  return body;
}

type ReopenSessionEntry = {
  id: string;
  type?: string;
  timestamp?: string | number;
  message?: { role?: string; timestamp?: string | number };
};

/**
 * A process crash can leave a run at `accepted` after Pi has already flushed
 * part of that turn to its append-only JSONL. Reconcile that durable tail
 * before run-based leaf alignment; otherwise reopen deliberately rewinds to
 * the previous terminal run and hides completed work from the transcript and
 * the next model call.
 */
function reconcileInterruptedRunOnOpen(
  sessionManager: { getBranch(): ReadonlyArray<ReopenSessionEntry> },
  recordsDir: string,
  branchId: string,
  completedAt = new Date().toISOString(),
): RunRecord[] {
  const latestRuns = latestRunSnapshots(recordsDir);
  const stale = latestRuns
    .filter((run) => run.branchId === branchId)
    .at(-1);
  if (stale?.status !== "accepted") return latestRuns;

  const branch = sessionManager.getBranch();
  const previousRuns = latestRuns.filter((run) => run.runId !== stale.runId);
  const anchorIds = [
    ...[...stale.assistantEntryIds].reverse(),
    stale.userEntryId,
    latestActiveLeafEntryId(previousRuns),
  ].filter((value): value is string => Boolean(value));
  const anchorIndex = Math.max(
    -1,
    ...anchorIds.map((id) => branch.findIndex((entry) => entry.id === id)),
  );
  const acceptedAtMs = Date.parse(stale.acceptedAt);
  const appended =
    anchorIndex >= 0
      ? branch.slice(anchorIndex + 1)
      : branch.filter((entry) => {
          const timestamp = entry.timestamp ?? entry.message?.timestamp;
          const value =
            typeof timestamp === "number"
              ? timestamp
              : typeof timestamp === "string"
                ? Date.parse(timestamp)
                : Number.NaN;
          return Number.isFinite(value) && value >= acceptedAtMs - 1_000;
        });
  const userEntryId =
    stale.userEntryId ??
    appended.find(
      (entry) => entry.type === "message" && entry.message?.role === "user",
    )?.id ??
    null;
  const assistantEntryIds = [
    ...new Set([
      ...stale.assistantEntryIds,
      ...appended
        .filter(
          (entry) =>
            entry.type === "message" && entry.message?.role === "assistant",
        )
        .map((entry) => entry.id),
    ]),
  ];

  appendRunRecord(recordsDir, {
    ...runRecordBody(stale),
    status: "interrupted",
    interruptionCause: "process_exit",
    userEntryId,
    assistantEntryIds,
    completedAt,
  });
  return latestRunSnapshots(recordsDir);
}

/**
 * Pi's own tree navigation always follows `branch()` with a rebuild of
 * `agent.state.messages` from the new leaf path. Alt must do the same after
 * every branch/resetLeaf/leaf-align on a LIVE session, or the model keeps
 * receiving the pre-branch context (stale edited/deleted turns).
 */
function resyncAgentContext(session: {
  state: { messages: unknown[] };
  sessionManager: { buildSessionContext(): { messages: unknown[] } };
}): void {
  session.state.messages = session.sessionManager.buildSessionContext().messages;
}

function alignSessionManagerLeaf(
  sessionManager: {
    branch(entryId: string): void;
    getEntry(entryId: string): unknown;
    getEntries(): ReadonlyArray<unknown>;
    getLeafId(): string | null;
    resetLeaf(): void;
  },
  activeLeafEntryId: string | null,
  context: string,
): void {
  if (!activeLeafEntryId) {
    sessionManager.resetLeaf();
    return;
  }
  if (!sessionManager.getEntry(activeLeafEntryId)) {
    throw new Error(
      `Cannot restore ${context}: active leaf is missing from Pi history`,
    );
  }
  sessionManager.branch(activeLeafEntryId);
  // Keep agent-team mail injected beyond the last run's leaf in the active
  // path (run records never claim custom entries; see session-store's
  // transcript-side counterpart).
  let advanced = true;
  while (advanced) {
    advanced = false;
    const leafId = sessionManager.getLeafId();
    for (const entry of sessionManager.getEntries()) {
      const value = entry as { id?: string; parentId?: string; type?: string };
      if (
        value.parentId === leafId &&
        value.type === "custom_message" &&
        value.id
      ) {
        sessionManager.branch(value.id);
        advanced = true;
        break;
      }
    }
  }
}

function alignSessionManagerToLatestRun(
  sessionManager: {
    branch(entryId: string): void;
    getEntry(entryId: string): unknown;
    getEntries(): ReadonlyArray<unknown>;
    getLeafId(): string | null;
    resetLeaf(): void;
  },
  latestRuns: RunRecord[],
  context: string,
): void {
  // Imported sessions have valid Pi history before Alt Theory has produced a
  // run record. SessionManager.open() already points at that history's final
  // entry. A failed/aborted first run has no active entry mapping either, so
  // it must not be mistaken for an intentional deletion that resets history.
  if (latestRuns.length === 0) return;
  const activeLeafEntryId = latestActiveLeafEntryId(latestRuns);
  if (
    !activeLeafEntryId &&
    !latestRuns.some((run) => run.status === "deleted")
  ) {
    return;
  }
  alignSessionManagerLeaf(
    sessionManager,
    activeLeafEntryId,
    context,
  );
}

function configChangedFields(
  before: SessionSelectors,
  after: SessionSelectors,
): string[] {
  const fields: string[] = [];
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
  return extractToolPath((event as { args?: unknown }).args);
}

/** Whether a session cwd lives inside the app data dir (a managed session
 * workspace) as opposed to a user project directory (spec §5.1 primary). */
function isInsideDataDir(dataDir: string, target: string): boolean {
  return isPathInside(dataDir, target);
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** Build ImageContent blocks from staged attachment paths (v1.2.1 D). Returns
 *  [] unless the model declares image input — a text-only model keeps only the
 *  filename mention in the prompt, so nothing hard-fails. Non-image files and
 *  unreadable paths are skipped (they remain text mentions). */
export function imageAttachmentsFor(
  paths: string[] | undefined,
  model: Model<any> | undefined,
): ImageContent[] {
  if (!paths?.length || !model?.input?.includes("image")) return [];
  const out: ImageContent[] = [];
  for (const path of paths) {
    const mimeType = IMAGE_MIME_BY_EXT[extname(path).toLowerCase()];
    if (!mimeType) continue;
    try {
      out.push({ type: "image", data: readFileSync(path).toString("base64"), mimeType, });
    } catch {
      // Unreadable (e.g. deleted) — leave it as the text mention.
    }
  }
  return out;
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
  runtime: ModelRuntime,
  model: Model<any> | undefined,
  firstUser: string,
): Promise<string | null> {
  if (!model) return null;
  try {
    // Through the runtime, not the compat completeSimple: the runtime
    // resolves auth per model (credential store, runtime key, models.json);
    // the compat layer only knows standard provider env vars, so every title
    // call went out unauthenticated and naming silently never happened.
    const result = await runtime.completeSimple(model, {
      messages: [
        {
          role: "user",
          content:
            "Give a short 5-8 word title for a conversation that begins with " +
            "the message below. Reply in the same language as the message. " +
            "Reply with only the title — no quotes, no trailing punctuation.\n\n" +
            firstUser.slice(0, 2000),
          timestamp: Date.now(),
        },
      ],
    });
    const text = (result.content ?? [])
      .filter(
        (part): part is { type: "text"; text: string } =>
          !!part && (part as { type?: string }).type === "text",
      )
      .map((part) => part.text)
      .join(" ");
    return cleanTitle(text);
  } catch (error) {
    console.warn("[alt-theory] auto-title failed:", error);
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
            : "",
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
