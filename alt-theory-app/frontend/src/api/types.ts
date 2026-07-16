export type AccountRole =
  | "participant"
  | "researcher"
  | "admin"
  | "debug";

export type ViewMode = "participant" | "researcher" | "debug" | "local";

export type TranscriptView = "user" | "developer";

export interface AuthContext {
  accountId: string | null;
  role: "anonymous" | AccountRole;
  displayLabel: string | null;
  defaultRoleCondition: string | null;
  defaultConsent: Record<string, unknown> | null;
}

export interface AuthMeResponse {
  auth: AuthContext;
  app: { mode: "local" | "hosted" };
  localConfig: ConfigStatus | null;
}

export interface DiscoveredAsset {
  slug: string;
  displayName: string;
  shortLabel?: string;
  userLabel?: string;
  description?: string;
}

export interface InstructionAsset {
  ref: string;
  displayName: string;
  size?: number;
}

export interface ResearchProject {
  projectId: string;
  displayName: string;
  defaults?: {
    rolePresetSlug?: string | null;
    soulSlug?: string | null;
    kbDomain?: string | null;
    customInstructionRef?: string | null;
  };
}

export interface DiscoveryLists {
  rolePresets: DiscoveredAsset[];
  souls: DiscoveredAsset[];
  kbDomains: DiscoveredAsset[];
  instructions: InstructionAsset[];
  skills: Array<{ name: string; displayName?: string; description?: string }>;
  projects: ResearchProject[];
}

export interface SessionDraftSnapshot {
  status: "draft";
  projectId: string | null;
  visibility: "research" | "private";
  currentDomain: string;
  rolePresetSlug: string | null;
  soulSlug: string | null;
  customInstructionRef?: string | null;
}

export interface SessionSnapshot {
  sessionId: string;
  projectId: string | null;
  branchId?: string;
  status: "idle" | "running" | "error";
  visibility?: "research" | "private";
  currentDomain: string;
  rolePresetSlug: string | null;
  soulSlug: string | null;
  customInstructionRef?: string | null;
  openedFrom?: "new" | "existing";
  resumeWarnings?: string[];
  messageCount: number;
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
  success?: boolean;
  truncated?: boolean;
}

export interface SessionSummary {
  sessionId: string;
  projectId: string | null;
  ownerAccountId: string | null;
  roleCondition: string | null;
  visibility: "research" | "private";
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  status: "available" | "incomplete" | "error";
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
    purpose: "collaboration" | "comparison";
  } | null;
}

export interface EffectiveSessionConfig {
  projectId: string | null;
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

export interface SessionDetailResponse {
  session: SessionSummary;
  transcript: TranscriptMessage[];
  transcriptPreview: TranscriptMessage[];
  warnings: string[];
  effectiveConfig?: EffectiveSessionConfig | null;
  runs?: RunRecord[];
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
  contextWindow?: number;
  compat?: ModelCompat;
}

export interface ProviderView {
  name: string;
  baseUrl?: string;
  api?: ApiType;
  options?: Record<string, unknown>;
  keyState: "stored" | "env-set" | "env-missing" | "missing";
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

export interface FetchModelsDraftInput {
  provider: string;
  baseUrl?: string;
  api?: ApiType;
  apiKey?: string;
  keyStorage?: "literal" | "env";
}

export interface FetchedModel {
  id: string;
  name?: string;
}

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
  [key: string]: unknown;
}

export type ClientMessage =
  | { type: "prompt"; payload: string }
  | { type: "abort" }
  | { type: "switch_kb"; payload: { domain: string } }
  | { type: "switch_role_preset"; payload: { rolePresetSlug: string | null } }
  | { type: "switch_soul"; payload: { soulSlug: string | null } }
  | {
      type: "switch_instruction";
      payload: { customInstructionRef: string | null };
    }
  | { type: "switch_project"; payload: { projectId: string | null } }
  | { type: "switch_visibility"; payload: { visibility: "research" | "private" } }
  | {
      type: "invoke_skill";
      payload: { skillName: string; userText?: string };
    }
  | { type: "revise_latest"; payload: { text: string } }
  | { type: "delete_latest" }
  | {
      type: "fork_session";
      payload: {
        purpose: "collaboration" | "comparison";
        forkPointEntryId?: string;
      };
    }
  | { type: "new_session" }
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
  | { type: "assistant_delta"; payload: { text: string } }
  | { type: "tool_started"; payload: { toolName: string; callId: string; path?: string | null } }
  | { type: "tool_updated"; payload: { callId: string; text?: string; progress?: number } }
  | { type: "tool_finished"; payload: { callId: string; success: boolean; output?: unknown } }
  | { type: "run_completed"; payload: SessionSnapshot }
  | { type: "run_failed"; payload: { error: string } }
  | { type: "approval_requested"; payload: ApprovalRequestPayload }
  | {
      type: "approval_resolved";
      payload: {
        approvalId: string;
        resolution: "responded" | "cancelled" | "timeout";
      };
    }
  | {
      type: "extension_notice";
      payload: { message: string; level: "info" | "warning" | "error" };
    }
  | { type: "error"; payload: { error: string; code?: string } };

export interface ActiveToolState {
  callId: string;
  toolName: string;
  path?: string | null;
  status: "running" | "finished" | "failed";
  progressText?: string;
  success?: boolean;
}

export interface SessionSelectors {
  projectId: string | null;
  currentDomain: string;
  rolePresetSlug: string | null;
  soulSlug: string | null;
  customInstructionRef: string | null;
  visibility: "research" | "private";
  branchId: string;
}





