export type AccountRole =
  | "participant"
  | "researcher"
  | "admin"
  | "debug";

export type ViewMode = "user" | "researcher";

/**
 * What happens to a conversation beyond this machine. Two disjoint
 * vocabularies, one per deployment (backend: `session-records.ts`):
 * hosted uses `research` / `private` — where `private` really is deleted
 * after 7 inactive days, because that is how "don't keep this" is kept —
 * and local uses `exportable` / `no-export`, a marker for a future export
 * filter that never hides, uploads, or deletes anything.
 */
export type SessionVisibility =
  | "research"
  | "private"
  | "exportable"
  | "no-export";

/** True for the values that withhold a conversation from the research team. */
export function isWithheld(visibility: SessionVisibility | undefined): boolean {
  return visibility === "private" || visibility === "no-export";
}

export type TranscriptView = "user" | "developer";

export interface AuthContext {
  accountId: string | null;
  role: "anonymous" | AccountRole;
  displayLabel: string | null;
  defaultRoleCondition: string | null;
  defaultConsent: Record<string, unknown> | null;
}

/** Install/account study designation — the only signal for study surfaces. */
export interface ParticipantInfo {
  designated: boolean;
  label: string | null;
}

export interface AuthMeResponse {
  auth: AuthContext;
  app: {
    mode: "local" | "hosted";
    runtimeMode: RuntimeMode;
    nativePiScanAltSkills: boolean;
  };
  participant: ParticipantInfo | null;
  localConfig: ConfigStatus | null;
}

export interface DiscoveredAsset {
  slug: string;
  displayName: string;
  shortLabel?: string;
  userLabel?: string;
  description?: string;
  /** Present when the asset comes from a user-added location. */
  source?: "added";
}

export interface InstructionAsset {
  ref: string;
  displayName: string;
  size?: number;
}

export interface DiscoveryLists {
  rolePresets: DiscoveredAsset[];
  souls: DiscoveredAsset[];
  kbDomains: DiscoveredAsset[];
  instructions: InstructionAsset[];
  skills: Array<{
    name: string;
    displayName?: string;
    description?: string;
    /** "alt-theory" = bundled skill; anything else is user/external. */
    source?: string;
    enabled?: { understand: boolean; work: boolean };
  }>;
}

export interface SessionDraftSnapshot {
  status: "draft";
  visibility: SessionVisibility;
  currentDomain: string;
  rolePresetSlug: string | null;
  soulSlug: string | null;
  customInstructionRef?: string | null;
  mode: AltMode;
  /** Full Access (v1.4.8): a draft has no runtime, so always absent/false. */
  fullAccess?: boolean;
  modelOverride?: SessionModelOverride | null;
  /** Resolver answer for the draft's model (local mode only). */
  thinking?: ResolvedThinking;
  studyTag?: StudyTag | null;
  workspacePrimaryDir?: string | null;
  resetComposer?: boolean;
}

export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/** Study designation, session level (M7 §3); absent = daily use. */
export interface StudyTag {
  studyId: string;
  batch?: string;
}

/** Per-session model choice; absent = deployment-global model config. */
export interface SessionModelOverride {
  provider: string;
  modelId: string;
  thinkingLevel?: ThinkingLevel;
}

export type AltMode = "understand" | "work";
export type RuntimeMode = "alt-theory" | "native-pi";

export type InterruptionCause =
  | "user_abort"
  | "lead_abort"
  | "process_exit"
  | "unknown";

export interface TurnRecovery {
  outcome: "interrupted" | "failed";
  interruptionCause?: InterruptionCause | null;
  userEntryId: string | null;
  canContinue: boolean;
  canRetryFromStart: boolean;
}

/** Mirror of core/failure.ts (the backend is the source; keep in step). */
export type FailureKind =
  | "network"
  | "auth"
  | "auth-refresh"
  | "rate-limit"
  | "provider"
  | "busy"
  | "aborted"
  | "not_found"
  | "unknown";

export interface Failure {
  /** What was being done: "run", or the WS request type that was refused. */
  operation: string;
  kind: FailureKind;
  /** The producer's original text, kept beside the plain wording. */
  message: string;
  retryable: boolean;
}

/** Switches accepted while a turn ran; they apply when it ends (v1.5). */
export interface PendingChanges {
  model?: SessionModelOverride | null;
  mode?: AltMode;
  fullAccess?: boolean;
}

/** The thinking resolver's answer: the level in use and where it came from. */
export interface ResolvedThinking {
  level: ThinkingLevel;
  source: "user" | "model-default" | "clamped";
  /** The user's choice; differs from `level` when clamped by the provider. */
  chosen?: ThinkingLevel;
}

export interface SessionSnapshot {
  sessionId: string;
  branchId?: string;
  /** The server's run phase; anything but idle means a run owns the session. */
  status: "idle" | "running" | "stopping" | "queued";
  pending?: PendingChanges;
  thinking?: ResolvedThinking;
  /** Pi's prompt queue for this session (steer = next API call). */
  queue?: { steering: string[]; followUp: string[] };
  visibility?: SessionVisibility;
  /** Hosted-only expiry for a "private" conversation; null everywhere else. */
  retentionDueAt?: string | null;
  currentDomain: string;
  rolePresetSlug: string | null;
  soulSlug: string | null;
  customInstructionRef?: string | null;
  mode?: AltMode;
  /** Full Access (v1.4.8): in-memory session state; undefined = not reported. */
  fullAccess?: boolean;
  modelOverride?: SessionModelOverride | null;
  currentModel?: { provider: string; modelId: string };
  studyTag?: StudyTag | null;
  workspace?: { primaryDir: string; additionalDirs: string[] } | null;
  openedFrom?: "new" | "existing";
  resumeWarnings?: string[];
  messageCount: number;
  recovery?: TurnRecovery | null;
}

export interface SessionMetrics {
  turnCount: number;
  toolCallCount: number;
  messageCount: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  contextUsage: {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  } | null;
}

/** What a tool call did, for the expandable tool line (alpha.3). */
export type ToolDetailKind = "prose" | "diff" | "command" | "skill";

export interface ToolDetail {
  kind: ToolDetailKind;
  body: string;
  skillName?: string;
  passages?: { before: string; after: string }[];
}

export interface TranscriptMessage {
  role: "user" | "assistant" | "system" | "tool" | "other";
  text: string;
  timestamp: string | null;
  entryId?: string | null;
  thinking?: string;
  toolType?: "call" | "result";
  toolCallId?: string;
  toolName?: string;
  toolPath?: string | null;
  toolDetail?: ToolDetail;
  success?: boolean;
  truncated?: boolean;
  /** Non-message boundary markers rendered specially (e.g. context compaction). */
  marker?: "compaction" | "imported-context" | "agent-team";
  sourceRole?: "system" | "developer";
  /** Pi's stop reason, set only on the last text row of a stopped, failed or truncated attempt. */
  stopReason?: "aborted" | "error" | "length";
  /** Whether the model still sees that text (user stop, or a final attempt) or Pi dropped it (retried). */
  stopKept?: boolean;
}

export interface SessionSummary {
  sessionId: string;
  alias?: string;
  snippet?: string;
  ownerAccountId: string | null;
  roleCondition: string | null;
  visibility: SessionVisibility;
  createdAt: string | null;
  lastPromptAcceptedAt?: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  trashDueAt?: string | null;
  helper?: true;
  /** Root that ceded its list spot to a promoted branch (M4b role swap). */
  delisted?: boolean;
  /** The session that took the spot (set with delisted). */
  delistedFor?: string;
  status: "available" | "incomplete" | "error";
  runStatus?: "idle" | "running" | "awaiting-approval" | "failed";
  rolePresetSlug: string | null;
  kbDomain: string | null;
  provider: string | null;
  model: string | null;
  messageCount: number | null;
  turnCount: number | null;
  hasManifest: boolean;
  hasSessionFile: boolean;
  recordModel: "v0.4" | "legacy-v0.3";
  warnings: string[];
  /** Fork lineage (M5 substrate); null = a root conversation. */
  forkedFrom: {
    sessionId: string;
    purpose: "fork" | "side" | "helper" | "ab-arm" | "subagent";
    /** Added to the conversation list by the user, purpose kept (alpha.6). */
    listed?: boolean;
  } | null;
  /** Study designation (M7 §3); null = daily use. */
  studyTag: StudyTag | null;
  /** Working folder (M4); null = default managed workspace. */
  workspacePrimaryDir: string | null;
  /** Subagent role preset recorded at spawn; absent for everything else. */
  agentType?: string;
  /** Ancestor ids, root first (server-derived, walks through Trash; a purged
   *  top still anchors the family key). Empty for roots. */
  lineagePath?: string[];
  /** Mechanical family name, e.g. "br1-btw2" (br/btw/h/sa/ab); null for roots. */
  lineageMarker?: string | null;
}

export interface EffectiveSessionConfig {
  rolePresetSlug: string | null;
  soulSlug: string | null;
  kbDomain: string;
  provider: string | null;
  model: string | null;
  customInstruction: {
    ref: string | null;
    path: string | null;
    sha256: string | null;
  };
}

export interface RunRecord {
  runId: string;
  status: string;
  branchId: string;
  turnId: string;
  revisionId: string;
}

export interface AbComparisonCandidate {
  candidateId: string;
  label?: string | null;
  provider?: string | null;
  model?: string | null;
  role?: string | null;
  instructionRef?: string | null;
  kbDomain?: string | null;
  outputText?: string | null;
}

export interface AbComparisonRecord {
  comparisonId: string;
  createdAt: string;
  sessionId: string;
  trigger: string;
  prompt?: string | null;
  selectedCandidateId?: string | null;
  decidedAt?: string | null;
  candidates: AbComparisonCandidate[];
  notes?: string | null;
}

export interface SessionDetailResponse {
  session: SessionSummary;
  sessionRoot?: string;
  transcript: TranscriptMessage[];
  transcriptPreview: TranscriptMessage[];
  warnings: string[];
  effectiveConfig?: EffectiveSessionConfig | null;
  runs?: RunRecord[];
  abComparisons?: AbComparisonRecord[];
}

/** Mirror of session-store.ts FileChange / ChangeGroup (card 7). */
export interface FileChange {
  path: string;
  resolvedPath: string;
  displayPath: string;
  added: number;
  removed: number;
  diff: string;
  contentRef?: { root: "workspace" | "working"; path: string };
  sessionIds: string[];
}

export interface ChangeGroup {
  title: string;
  path: string;
  role: "primary" | "additional" | "outside";
  capped: boolean;
  files: FileChange[];
}

export interface SessionChanges {
  groups: ChangeGroup[];
}

export type ApiType =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai";

export interface ModelCompat {
  thinkingFormat?: string;
  requiresReasoningContentOnAssistantMessages?: boolean;
  maxTokensField?: string;
}

export interface ConfigModel {
  id: string;
  name?: string;
  reasoning?: boolean;
  thinkingLevels?: ThinkingLevel[];
  availableThinkingLevels?: ThinkingLevel[];
  thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
  input?: ("text" | "image")[];
  contextWindow?: number;
  maxTokens?: number;
  compat?: ModelCompat;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

export interface ProviderView {
  name: string;
  baseUrl?: string;
  api?: ApiType;
  options?: Record<string, unknown>;
  keyState: "stored" | "oauth" | "env-set" | "env-missing" | "missing";
  hasKey: boolean;
  models: ConfigModel[];
  active: boolean;
  warning?: string;
}

export interface ConfigStatus {
  agentDir: string;
  anyUsable: boolean;
  activeUsable: boolean;
  activeIssue: string | null;
  activeProvider: string | null;
  activeModel: string | null;
}

// Mirrors the server's PROVIDER_AUTH_IDS — the single source of which
// subscription/OAuth providers Alt offers. The settings auth cards render
// whatever the status endpoint returns, so this union only types ids that
// appear in flow payloads.
export type ProviderAuthId =
  | "openrouter"
  | "xai"
  | "openai-codex"
  | "github-copilot"
  | "kimi-coding";

export type ProviderAuthEvent =
  | { type: "info"; message: string; links?: { url: string; label?: string }[] }
  | { type: "auth_url"; url: string; instructions?: string }
  | {
      type: "device_code";
      userCode: string;
      verificationUri: string;
      intervalSeconds?: number;
      expiresInSeconds?: number;
    }
  | { type: "progress"; message: string };

export interface ProviderAuthPrompt {
  id: string;
  type: "text" | "secret" | "select" | "manual_code";
  message: string;
  placeholder?: string;
  options?: readonly {
    id: string;
    label: string;
    description?: string;
  }[];
}

export interface ProviderAuthFlow {
  flowId: string;
  provider: ProviderAuthId;
  status: "running" | "connected" | "error" | "cancelled";
  events: ProviderAuthEvent[];
  prompt?: ProviderAuthPrompt;
  error?: string;
}

export interface FetchModelsDraftInput {
  provider: string;
  baseUrl?: string;
  api?: ApiType;
  apiKey?: string;
  keyStorage?: "literal" | "env";
}

export interface FetchedModel extends ConfigModel {}

export interface UpsertProviderInput {
  baseUrl?: string;
  api?: ApiType;
  apiKey?: string;
  keyStorage?: "literal" | "env";
  options?: Record<string, unknown>;
  models: ConfigModel[];
}

export interface SessionTextFile {
  root: "records" | "workspace";
  path: string;
  size: number;
  updatedAt: string | null;
}

export interface SessionTextFileContent extends SessionTextFile {
  content: string;
}

export interface WorkspaceFileEntry {
  path: string;
  size: number;
  updatedAt: string | null;
  kind: "text" | "binary-original" | "converted";
  stageable: boolean;
  downloadable: boolean;
  extractStatus?: "failed";
  extractError?: string | null;
  convertedPath?: string | null;
}

export interface WorkspaceUsage {
  sessionBytes: number;
  sessionQuotaBytes: number;
  accountBytes?: number;
  accountQuotaBytes?: number;
}

export interface SessionFilesResponse {
  files: SessionTextFile[];
  entries?: WorkspaceFileEntry[];
  usage?: WorkspaceUsage;
}

export interface WorkspaceFilesResponse {
  files: WorkspaceFileEntry[];
  entries?: WorkspaceFileEntry[];
  usage: WorkspaceUsage;
  workingFolders?: WorkingFolderDescriptor[];
}

export interface WorkingFolderDescriptor {
  id: string;
  path: string;
  role: "primary" | "additional";
  managed: boolean;
  available: boolean;
}

export interface WorkingTreeEntry {
  folderId: string;
  path: string;
  isDirectory: boolean;
  size: number | null;
  updatedAt: string | null;
  previewable: boolean;
}

export interface WorkingFoldersResponse {
  folders: WorkingFolderDescriptor[];
}

export interface WorkingDirectoryResponse {
  folderId: string;
  path: string;
  entries: WorkingTreeEntry[];
  truncated?: boolean;
}

export interface WriteSessionFileInput {
  root: string;
  path: string;
  content: string;
}

export interface UploadWorkspaceFileResult {
  originalPath: string;
  convertedPath: string | null;
  extractStatus: "ok" | "failed" | "not-needed";
  extractError?: string;
  entry: WorkspaceFileEntry;
}

export interface DeleteWorkspaceFileResult {
  deleted: string[];
}

export interface AssemblyManifest {
  sessionId?: string;
  kbDomain?: string;
  model?: string | null;
  provider?: string | null;
  sessionCwd?: string;
  piSessionDir?: string;
  piSessionFile?: string | null;
  recordsDir?: string;
  writeDir?: string | null;
  writableRoots?: string[];
  kb?: {
    rootDir?: string;
    domain?: string;
    domainPath?: string | null;
  };
  soul?: { slug?: string | null; path?: string | null };
  rolePreset?: { slug?: string | null; path?: string | null };
  appContext?: { path?: string | null };
  piAdapter?: { promptTemplatesDir?: string | null };
}

export type ClientMessage =
  | {
      type: "prompt";
      payload: string;
      attachments?: string[];
      /** While a turn runs: steer = next API call (default), followUp = after the turn. */
      deliverAs?: "steer" | "followUp";
    }
  | { type: "abort" }
  | { type: "continue_latest" }
  | { type: "compact" }
  | { type: "switch_kb"; payload: { domain: string } }
  | { type: "switch_role_preset"; payload: { rolePresetSlug: string | null } }
  | { type: "switch_soul"; payload: { soulSlug: string | null } }
  | {
      type: "switch_instruction";
      payload: { customInstructionRef: string | null };
    }
  | { type: "switch_visibility"; payload: { visibility: SessionVisibility } }
  | {
      type: "invoke_skill";
      payload: { skillName: string; userText?: string };
    }
  | { type: "revise_latest"; payload: { text: string; entryId?: string } }
  | { type: "branch_revision"; payload: { text: string; entryId?: string } }
  | { type: "prepare_branch_revision"; payload: { entryId: string } }
  | { type: "retry_latest" }
  | { type: "delete_latest" }
  | {
      type: "fork_session";
      payload: {
        purpose: "fork" | "side" | "helper" | "ab-arm" | "subagent";
        forkPointEntryId?: string;
        sourceSessionId?: string;
      };
    }
  | {
      type: "create_related_session";
      payload: {
        purpose: "side" | "helper";
        forkPointEntryId?: string;
      };
    }
  | { type: "switch_mode"; payload: { mode: AltMode } }
  | { type: "set_full_access"; payload: { enabled: boolean } }
  | { type: "add_workspace_dir"; payload: { dir: string } }
  | { type: "set_study_tag"; payload: { studyTag: StudyTag | null } }
  | {
      type: "set_session_model";
      payload: { override: SessionModelOverride | null };
    }
  | {
      type: "set_draft_workspace";
      payload: { primaryDir: string | null };
    }
  | { type: "new_session" }
  | {
      type: "create_helper_session";
      payload: { parentSessionId?: string; question?: string };
    }
  | { type: "open_session"; payload: { sessionId: string } }
  | { type: "get_session_metadata" }
  | { type: "get_session_metrics" }
  | {
      type: "respond_approval";
      payload: {
        approvalId: string;
        accept?: boolean;
        choice?: string | null;
        text?: string | null;
      };
    };

export interface ApprovalRequestPayload {
  sessionId: string;
  approvalId: string;
  kind: "confirm" | "select" | "input";
  title: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  timeoutMs?: number;
}

export type ServerMessage =
  | { type: "session_draft"; payload: SessionDraftSnapshot }
  | { type: "session_opened"; payload: SessionSnapshot }
  | { type: "session_updated"; payload: SessionSnapshot }
  | { type: "session_metadata"; payload: AssemblyManifest }
  | { type: "session_metrics"; payload: SessionMetrics }
  | { type: "session_transcript"; payload: { messages: TranscriptMessage[] } }
  | {
      type: "related_session_created";
      payload: { sessionId: string; purpose: "side" | "helper" };
    }
  | {
      type: "branch_created";
      payload: { sessionId: string; sourceSessionId: string };
    }
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
  | { type: "tool_started"; payload: { toolName: string; callId: string; path?: string | null; detail?: ToolDetail } }
  | { type: "tool_updated"; payload: { callId: string; text?: string; progress?: number } }
  | { type: "tool_finished"; payload: { callId: string; success: boolean; output?: unknown } }
  | { type: "run_completed"; payload: SessionSnapshot }
  | {
      type: "run_failed";
      payload: { failure: Failure; canRetry?: boolean; recovery?: TurnRecovery | null };
    }
  /** A message steered into the running turn — broadcast so every pane
   *  (sender and late joiners) renders the bubble exactly once. */
  | { type: "user_steered"; payload: { text: string } }
  /** Pi's prompt queue changed; `restored` = unsent texts Stop handed back. */
  | {
      type: "queue_updated";
      payload: { steering: string[]; followUp: string[]; restored?: string[] };
    }
  | { type: "approval_snapshot"; payload: ApprovalRequestPayload[] }
  | { type: "approval_requested"; payload: ApprovalRequestPayload }
  | {
      type: "approval_resolved";
      payload: {
        sessionId: string;
        approvalId: string;
        resolution: "responded" | "cancelled" | "timeout";
      };
    }
  | {
      type: "extension_notice";
      payload: { message: string; level: "info" | "warning" | "error"; failure?: Failure };
    }
  | { type: "error"; payload: { failure: Failure; code?: string } };

export interface ActiveToolState {
  callId: string;
  toolName: string;
  path?: string | null;
  detail?: ToolDetail | null;
  status: "running" | "finished" | "failed";
  progressText?: string;
  success?: boolean;
}

/** One chunk of the in-progress assistant turn, in arrival order. */
export type StreamPart =
  | { kind: "thinking"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; tool: ActiveToolState }
  /** In-stream status divider, e.g. a connection retry boundary. */
  | { kind: "notice"; text: string };

export interface SessionSelectors {
  currentDomain: string;
  rolePresetSlug: string | null;
  soulSlug: string | null;
  customInstructionRef: string | null;
  visibility: SessionVisibility;
  branchId: string;
}





