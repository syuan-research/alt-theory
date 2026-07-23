import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  detectAccountsConfigured,
  fetchAuthMe,
  login as loginRequest,
  logout as logoutRequest,
} from "@/api/auth";
import { fetchDiscovery } from "@/api/discovery";
import {
  deleteSession as deleteSessionRequest,
  fetchSessionDetail,
  fetchSessionList,
  hydrateSessionDisplayName,
  normalizeSessionAlias,
  promoteRelatedSession as promoteRelatedSessionRequest,
  saveSessionAlias,
} from "@/api/sessions";
import type {
  ActiveToolState,
  ApprovalRequestPayload,
  AssemblyManifest,
  AuthContext,
  CapabilityMode,
  ClientMessage,
  DiscoveryLists,
  ServerMessage,
  SessionDetailResponse,
  SessionDraftSnapshot,
  SessionMetrics,
  SessionModelOverride,
  SessionSelectors,
  SessionSnapshot,
  SessionSummary,
  StreamPart,
  StudyTag,
  TranscriptMessage,
  TranscriptView,
  ViewMode,
  ParticipantInfo,
  ConfigStatus,
} from "@/api/types";
import {
  addWorkspace as addWorkspaceRequest,
  listWorkspaces,
  setSessionWorkspace as setSessionWorkspaceRequest,
} from "@/api/workspaces";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { ConnStatus } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DEFAULT_KB_DOMAIN } from "@/lib/constants";
import { isInterruptedError } from "@/lib/format";
import { toolLabel } from "@/lib/tools";
import { buildOutgoingPrompt } from "@/lib/workspace";
import {
  defaultTranscriptView,
  researcherDoorOpen,
  viewModeForRole,
} from "@/lib/viewMode";

const anonymousAuth: AuthContext = {
  accountId: null,
  role: "anonymous",
  displayLabel: null,
  defaultRoleCondition: null,
  defaultConsent: null,
};

const defaultSelectors: SessionSelectors = {
  projectId: null,
  currentDomain: DEFAULT_KB_DOMAIN,
  rolePresetSlug: null,
  soulSlug: null,
  customInstructionRef: null,
  visibility: "research",
  branchId: "main",
};

export interface ComposerNotice {
  prefix?: string;
  text: string;
  warn?: boolean;
}

export interface ConfirmRequest {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

export interface AppContextValue {
  auth: AuthContext;
  appMode: "local" | "hosted";
  accountsConfigured: boolean;
  loginRequired: boolean;
  loading: boolean;
  authError: string | null;
  login: (accountId: string, loginCode: string) => Promise<void>;
  logout: () => Promise<void>;

  viewMode: ViewMode;
  canSwitchMode: boolean;
  toggleViewMode: () => void;
  participant: ParticipantInfo | null;
  transcriptView: TranscriptView;
  setTranscriptView: (view: TranscriptView) => void;

  discovery: DiscoveryLists | null;
  /** Local-mode model config status; carries the active default model. */
  localConfig: ConfigStatus | null;

  sessions: SessionSummary[];
  sessionSearch: string;
  setSessionSearch: (value: string) => void;
  selectedCatalogSessionId: string | null;
  selectedSessionDetail: SessionDetailResponse | null;
  sessionDisplayNames: Record<string, { alias: string; snippet: string }>;
  sessionsLoading: boolean;
  sessionsError: string | null;
  refreshSessions: () => Promise<void>;
  openCatalogSession: (sessionId: string) => void;
  forkCurrentSession: (purpose: "fork" | "side" | "helper" | "ab-arm") => void;
  activeRelatedSessionId: string | null;
  setActiveRelatedSessionId: (sessionId: string | null) => void;
  promoteRelatedSession: (sessionId: string) => Promise<void>;
  renameSelectedSession: () => Promise<void>;
  deleteSelectedSession: () => void;

  sessionId: string | null;
  sessionReady: boolean;
  /** True only when the current session was just created in this pane (not
   * opened from the list, reconnected, or rebuilt by an asset switch). */
  sessionCreatedHere: boolean;
  /** Resume warnings from the backend, e.g. an asset fallback on reopen. */
  sessionWarnings: string[];
  isRunning: boolean;
  connStatus: ConnStatus;
  connLabel: string;
  wsError: string | null;
  wsConnected: boolean;

  selectors: SessionSelectors;
  switchProject: (projectId: string | null) => void;
  switchKb: (domain: string) => void;
  switchSoul: (soulSlug: string | null) => void;
  switchRolePreset: (rolePresetSlug: string | null) => void;
  switchInstruction: (customInstructionRef: string | null) => void;
  switchVisibility: (visibility: "research" | "private") => void;

  /** Working folder for the draft/current conversation; null = none. */
  workspacePrimaryDir: string | null;
  /** Explicitly added working folders (may be empty of sessions). */
  knownWorkspaces: string[];
  /** Choose the working folder for the next (or current) conversation. */
  setDraftWorkspace: (primaryDir: string | null) => void;
  addKnownWorkspace: (path: string) => Promise<void>;
  /** Re-point any existing session's working folder (drag & drop, M4). */
  repointSession: (sessionId: string, primaryDir: string | null) => Promise<void>;

  sessionMode: CapabilityMode;
  switchMode: (mode: CapabilityMode) => void;
  modelOverride: SessionModelOverride | null;
  setSessionModel: (override: SessionModelOverride | null) => void;
  studyTag: StudyTag | null;
  setStudyTag: (tag: StudyTag | null) => void;

  messages: TranscriptMessage[];
  streamParts: StreamPart[];
  toolStatus: string;
  /** Live run-phase label (e.g. "Thinking…") shown while no tool is active. */
  runPhaseLabel: string;
  composerNotice: ComposerNotice | null;
  runHint: string | null;
  reviseMode: boolean;
  reviseDraft: string;

  stagedWorkspacePaths: string[];
  attachmentHint: string;
  toggleWorkspaceStage: (path: string, staged: boolean) => void;
  stageWorkspacePath: (path: string) => void;
  unstageWorkspacePaths: (paths: string[]) => void;
  clearStagedWorkspace: () => void;

  runCompletedCount: number;
  requestConfirm: (request: ConfirmRequest) => void;

  approvals: ApprovalRequestPayload[];
  respondApproval: (
    approvalId: string,
    response: { accept?: boolean; choice?: string | null; text?: string | null }
  ) => void;
  approvalMarkers: string[];
  addApprovalMarker: (text: string) => void;

  manifest: AssemblyManifest | null;
  metrics: SessionMetrics | null;

  startNewSession: () => void;
  sendPrompt: (text: string) => boolean;
  abortRun: () => void;
  invokeSkill: (skillName: string, userText?: string) => boolean;
  reviseLatest: (text: string) => boolean;
  deleteLatest: () => void;
  branchFromEntry: (entryId: string) => void;
  startReviseMode: (text: string, entryId?: string) => string;
  cancelReviseMode: () => void;
  requestMetadata: () => void;
  requestMetrics: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function applySnapshotSelectors(
  payload: SessionSnapshot | SessionDraftSnapshot
): SessionSelectors {
  return {
    projectId: payload.projectId ?? null,
    currentDomain: payload.currentDomain || DEFAULT_KB_DOMAIN,
    rolePresetSlug: payload.rolePresetSlug ?? null,
    soulSlug: payload.soulSlug ?? null,
    customInstructionRef: payload.customInstructionRef ?? null,
    visibility: payload.visibility ?? "research",
    branchId:
      "branchId" in payload
        ? (payload as SessionSnapshot).branchId || "main"
        : "main",
  };
}

function appendStreamText(
  parts: StreamPart[],
  kind: "thinking" | "text",
  delta: string
): StreamPart[] {
  const last = parts[parts.length - 1];
  if (last && last.kind === kind) {
    return [...parts.slice(0, -1), { kind, text: last.text + delta }];
  }
  return [...parts, { kind, text: delta }];
}

function upsertToolPart(
  parts: StreamPart[],
  tool: ActiveToolState
): StreamPart[] {
  const index = parts.findIndex(
    (part) => part.kind === "tool" && part.tool.callId === tool.callId
  );
  if (index === -1) return [...parts, { kind: "tool", tool }];
  return parts.map((part, i) =>
    i === index ? { kind: "tool" as const, tool } : part
  );
}

function failRunningToolParts(parts: StreamPart[]): StreamPart[] {
  return parts
    .filter((part) => part.kind === "tool")
    .map((part) =>
      part.kind === "tool" && part.tool.status === "running"
        ? {
            kind: "tool" as const,
            tool: { ...part.tool, status: "failed" as const, success: false },
          }
        : part
    );
}

export function AppProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [auth, setAuth] = useState<AuthContext>(anonymousAuth);
  const [appMode, setAppMode] = useState<"local" | "hosted">("hosted");
  const [accountsConfigured, setAccountsConfigured] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryLists | null>(null);
  const [localConfig, setLocalConfig] = useState<ConfigStatus | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("user");
  const [canSwitchMode, setCanSwitchMode] = useState(false);
  const [participant, setParticipant] = useState<ParticipantInfo | null>(null);
  const [transcriptView, setTranscriptView] = useState<TranscriptView>("user");

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeRelatedSessionId, setActiveRelatedSessionId] = useState<string | null>(null);
  const [sessionSearch, setSessionSearch] = useState("");
  const [selectedCatalogSessionId, setSelectedCatalogSessionId] = useState<
    string | null
  >(null);
  const [selectedSessionDetail, setSelectedSessionDetail] =
    useState<SessionDetailResponse | null>(null);
  const [sessionDisplayNames, setSessionDisplayNames] = useState<
    Record<string, { alias: string; snippet: string }>
  >({});
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionCreatedHere, setSessionCreatedHere] = useState(false);
  const [sessionWarnings, setSessionWarnings] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>("connecting");
  const [connLabel, setConnLabel] = useState("Connecting");
  const [wsError, setWsError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [selectors, setSelectors] = useState<SessionSelectors>(defaultSelectors);
  const [sessionMode, setSessionMode] = useState<CapabilityMode>("pure");
  const [workspacePrimaryDir, setWorkspacePrimaryDir] = useState<string | null>(
    null
  );
  const [knownWorkspaces, setKnownWorkspaces] = useState<string[]>([]);
  const [modelOverride, setModelOverride] =
    useState<SessionModelOverride | null>(null);
  const [studyTag, setStudyTagState] = useState<StudyTag | null>(null);

  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [streamParts, setStreamParts] = useState<StreamPart[]>([]);
  const [toolStatus, setToolStatus] = useState("");
  const [runPhaseLabel, setRunPhaseLabel] = useState("");
  const [composerNotice, setComposerNotice] = useState<ComposerNotice | null>(
    null
  );
  const [runHint, setRunHint] = useState<string | null>(null);
  const [reviseMode, setReviseMode] = useState(false);
  const [reviseDraft, setReviseDraft] = useState("");
  const [reviseEntryId, setReviseEntryId] = useState<string | null>(null);
  const [stagedWorkspacePaths, setStagedWorkspacePaths] = useState<string[]>([]);
  const [runCompletedCount, setRunCompletedCount] = useState(0);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(
    null
  );
  const [approvals, setApprovals] = useState<ApprovalRequestPayload[]>([]);
  // Conversation-scoped approval markers, recorded
  // client-side the moment the user grants a conversation allowance (M7 §3).
  const [approvalMarkers, setApprovalMarkers] = useState<string[]>([]);

  const [manifest, setManifest] = useState<AssemblyManifest | null>(null);
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);

  const reconnectSessionIdRef = useRef<string | null>(null);
  const pendingOpenSessionIdRef = useRef("");
  const pendingAssetSwitchRef = useRef(false);
  const activeToolsMapRef = useRef<Record<string, ActiveToolState>>({});
  const composerNoticeTimerRef = useRef<number | null>(null);
  const hydratedNamesRef = useRef<Set<string>>(new Set());
  const sessionListRequestRef = useRef(0);
  const sessionDetailRequestRef = useRef(0);

  const clearStagedWorkspace = useCallback(() => {
    setStagedWorkspacePaths([]);
  }, []);

  const toggleWorkspaceStage = useCallback((path: string, staged: boolean) => {
    setStagedWorkspacePaths((prev) => {
      if (staged) return prev.includes(path) ? prev : [...prev, path];
      return prev.filter((item) => item !== path);
    });
  }, []);

  const stageWorkspacePath = useCallback((path: string) => {
    setStagedWorkspacePaths((prev) =>
      prev.includes(path) ? prev : [...prev, path]
    );
  }, []);

  const unstageWorkspacePaths = useCallback((paths: string[]) => {
    if (!paths.length) return;
    const remove = new Set(paths);
    setStagedWorkspacePaths((prev) => prev.filter((item) => !remove.has(item)));
  }, []);

  const requestConfirm = useCallback((request: ConfirmRequest) => {
    setConfirmRequest(request);
  }, []);

  const attachmentHint = useMemo(() => {
    const count = stagedWorkspacePaths.length;
    if (!count) return "";
    return `${count} file${count === 1 ? "" : "s"} will be attached when you send`;
  }, [stagedWorkspacePaths.length]);

  const setComposerNoticeTimed = useCallback(
    (notice: ComposerNotice | null, ttlMs = 4500) => {
      if (composerNoticeTimerRef.current) {
        window.clearTimeout(composerNoticeTimerRef.current);
        composerNoticeTimerRef.current = null;
      }
      setComposerNotice(notice);
      if (notice?.text) {
        composerNoticeTimerRef.current = window.setTimeout(() => {
          setComposerNotice(null);
          composerNoticeTimerRef.current = null;
        }, ttlMs);
      }
    },
    []
  );

  const refreshAuth = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const me = await fetchAuthMe();
      const mode = me.app?.mode === "local" ? "local" : "hosted";
      const accounts = await detectAccountsConfigured(mode);
      const role = me.auth?.role ?? "anonymous";
      const required = role === "anonymous" && accounts;
      const nextViewMode = viewModeForRole(role, mode);
      const nextCanSwitchMode = researcherDoorOpen(role, mode);

      if (
        mode === "local" &&
        me.localConfig &&
        !me.localConfig.activeUsable &&
        window.location.pathname !== "/config"
      ) {
        navigate("/config?firstRun=1", { replace: true });
        return;
      }

      setAuth(me.auth ?? anonymousAuth);
      setAppMode(mode);
      setAccountsConfigured(accounts);
      setLoginRequired(required);
      setViewMode(nextViewMode);
      setCanSwitchMode(nextCanSwitchMode);
      setParticipant(me.participant ?? null);
      setLocalConfig(me.localConfig ?? null);
      setTranscriptView(defaultTranscriptView(nextViewMode));

      if (!required) {
        const lists = await fetchDiscovery();
        setDiscovery(lists);
      } else {
        setDiscovery(null);
      }
    } catch (err) {
      setAuth(anonymousAuth);
      setAppMode("hosted");
      setAccountsConfigured(false);
      setLoginRequired(false);
      setDiscovery(null);
      setAuthError(err instanceof Error ? err.message : "Auth check failed");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const login = useCallback(async (accountId: string, loginCode: string) => {
    await loginRequest(accountId, loginCode);
    window.location.reload();
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      /* reload anyway */
    }
    window.location.reload();
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => {
      const next: ViewMode = prev === "researcher" ? "user" : "researcher";
      setTranscriptView(defaultTranscriptView(next));
      return next;
    });
  }, []);

  const refreshSessionDetail = useCallback(async (targetSessionId: string | null) => {
    const requestId = ++sessionDetailRequestRef.current;
    if (!targetSessionId) {
      setSelectedSessionDetail(null);
      return;
    }
    try {
      const detail = await fetchSessionDetail(targetSessionId);
      if (requestId === sessionDetailRequestRef.current) {
        setSelectedSessionDetail(detail);
      }
    } catch {
      if (requestId === sessionDetailRequestRef.current) {
        setSelectedSessionDetail(null);
      }
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    if (loginRequired) return;
    const requestId = ++sessionListRequestRef.current;
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const list = await fetchSessionList();
      if (requestId !== sessionListRequestRef.current) return;
      setSessions(list);
      setSelectedCatalogSessionId((current) =>
        current && list.some((item) => item.sessionId === current)
          ? current
          : list[0]?.sessionId ?? null
      );
    } catch (err) {
      if (requestId === sessionListRequestRef.current) {
        setSessionsError(
          err instanceof Error ? err.message : "Could not load conversations"
        );
      }
    } finally {
      if (requestId === sessionListRequestRef.current) {
        setSessionsLoading(false);
      }
    }
  }, [loginRequired]);

  useEffect(() => {
    if (!loading && !loginRequired) {
      void refreshSessions();
    }
  }, [loading, loginRequired, refreshSessions]);

  useEffect(() => {
    void refreshSessionDetail(selectedCatalogSessionId);
  }, [refreshSessionDetail, selectedCatalogSessionId]);

  useEffect(() => {
    if (loginRequired) return;
    const toHydrate = sessions
      .slice(0, 20)
      .map((session) => session.sessionId)
      .filter((id) => id && !hydratedNamesRef.current.has(id));

    for (const id of toHydrate) {
      hydratedNamesRef.current.add(id);
      void hydrateSessionDisplayName(id).then((display) => {
        setSessionDisplayNames((prev) => ({ ...prev, [id]: display }));
      });
    }
  }, [sessions, loginRequired]);

  const sendMessage = useCallback(
    (message: ClientMessage): boolean => {
      const sent = wsApiRef.current?.send(message) ?? false;
      if (!sent) {
        setComposerNoticeTimed({ prefix: "⚠", text: "Not connected", warn: true });
        wsApiRef.current?.reconnect();
      }
      return sent;
    },
    [setComposerNoticeTimed]
  );

  const requestAssetSwitch = useCallback(
    (message: ClientMessage, label: string): boolean => {
      pendingAssetSwitchRef.current = true;
      const sent = sendMessage(message);
      if (!sent) {
        pendingAssetSwitchRef.current = false;
        return false;
      }
      setIsRunning(true);
      setConnStatus("running");
      setConnLabel("Switching...");
      setToolStatus(label);
      return true;
    },
    [sendMessage]
  );

  const refreshCurrentTranscript = useCallback(async (activeSessionId: string) => {
    try {
      const detail = await fetchSessionDetail(activeSessionId);
      if (Array.isArray(detail.transcript) && detail.transcript.length > 0) {
        setMessages(detail.transcript);
      }
    } catch {
      // Non-fatal; transcript may arrive via websocket.
    }
  }, []);

  const handleServerMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case "session_draft":
          if (reconnectSessionIdRef.current) break;
          setSessionId(null);
          setSessionReady(true);
          setSessionCreatedHere(false);
          setSessionWarnings([]);
          setIsRunning(false);
          setSelectors(applySnapshotSelectors(message.payload));
          setSessionMode("pure");
          setModelOverride(message.payload.modelOverride ?? null);
          setWorkspacePrimaryDir(message.payload.workspacePrimaryDir ?? null);
          setStudyTagState(null);
          setApprovalMarkers([]);
          setManifest(null);
          setMetrics(null);
          setMessages([]);
          setStreamParts([]);
          activeToolsMapRef.current = {};
          setConnStatus("idle");
          setConnLabel("Ready");
          setWsError(null);
          pendingAssetSwitchRef.current = false;
          pendingOpenSessionIdRef.current = "";
          clearStagedWorkspace();
          void refreshSessions();
          break;

        case "session_opened": {
          // Decide "created here" before the pending refs are consumed below:
          // an explicit open, an asset-switch rebuild, or a reconnect to the
          // same id is NOT a new conversation (persisted Work mode must not
          // silently expand an existing Pure session's tools).
          setSessionCreatedHere(
            !pendingOpenSessionIdRef.current &&
              !pendingAssetSwitchRef.current &&
              message.payload.sessionId !== reconnectSessionIdRef.current
          );
          setSessionWarnings(message.payload.resumeWarnings ?? []);
          if (
            pendingOpenSessionIdRef.current &&
            message.payload.sessionId === pendingOpenSessionIdRef.current
          ) {
            setMessages([]);
            setStreamParts([]);
            pendingOpenSessionIdRef.current = "";
          }
          if (pendingAssetSwitchRef.current) {
            setMessages([]);
            setStreamParts([]);
            pendingAssetSwitchRef.current = false;
          }
          if (message.payload.sessionId !== reconnectSessionIdRef.current) {
            setApprovalMarkers([]);
          }
          setSessionId(message.payload.sessionId);
          reconnectSessionIdRef.current = message.payload.sessionId;
          setSelectors(applySnapshotSelectors(message.payload));
          setSessionMode(message.payload.mode ?? "pure");
          setModelOverride(message.payload.modelOverride ?? null);
          setStudyTagState(message.payload.studyTag ?? null);
          setSessionReady(true);
          setIsRunning(message.payload.status === "running");
          setConnStatus(message.payload.status === "running" ? "running" : "idle");
          setConnLabel(message.payload.status === "running" ? "Running" : "Ready");
          setWsError(null);
          setToolStatus("");
          clearStagedWorkspace();
          void refreshSessions();
          if (selectedCatalogSessionId === message.payload.sessionId) {
            void refreshSessionDetail(message.payload.sessionId);
          }
          break;
        }

        case "session_updated": {
          setSelectors((prev) => ({
            ...prev,
            currentDomain: message.payload.currentDomain || prev.currentDomain,
            rolePresetSlug:
              message.payload.rolePresetSlug ?? prev.rolePresetSlug,
            soulSlug: message.payload.soulSlug ?? prev.soulSlug,
            customInstructionRef:
              message.payload.customInstructionRef ?? prev.customInstructionRef,
            projectId:
              message.payload.projectId === undefined
                ? prev.projectId
                : message.payload.projectId,
            visibility: message.payload.visibility ?? prev.visibility,
            branchId: message.payload.branchId || prev.branchId,
          }));
          if (message.payload.mode) setSessionMode(message.payload.mode);
          if (message.payload.modelOverride !== undefined) {
            setModelOverride(message.payload.modelOverride);
          }
          if (message.payload.studyTag !== undefined) {
            setStudyTagState(message.payload.studyTag);
          }
          if (message.payload.status === "running") {
            setConnStatus("running");
            setConnLabel("Running");
            setIsRunning(true);
          } else {
            setConnStatus("idle");
            setConnLabel(message.payload.status || "Ready");
            setIsRunning(false);
          }
          if (selectedCatalogSessionId === message.payload.sessionId) {
            void refreshSessionDetail(message.payload.sessionId);
          }
          break;
        }

        case "session_metadata":
          setManifest(message.payload);
          break;

        case "session_metrics":
          setMetrics(message.payload);
          break;

        case "session_transcript":
          setMessages(message.payload.messages);
          setStreamParts([]);
          activeToolsMapRef.current = {};
          setConnStatus("idle");
          setConnLabel("Ready");
          setToolStatus("");
          setIsRunning(false);
          break;

        case "related_session_created":
          setActiveRelatedSessionId(message.payload.sessionId);
          setIsRunning(false);
          setConnStatus("idle");
          setConnLabel("Ready");
          setToolStatus("");
          void refreshSessions();
          break;

        case "assistant_delta":
          // Real answer text is streaming now — the bubble's "typing…" indicator
          // takes over, so drop the "Thinking…" phase label.
          setRunPhaseLabel("");
          setStreamParts((parts) =>
            appendStreamText(parts, "text", message.payload.text)
          );
          break;

        case "thinking_delta":
          setStreamParts((parts) =>
            appendStreamText(parts, "thinking", message.payload.text)
          );
          break;

        case "tool_started": {
          const { toolName, callId, path } = message.payload;
          const label = toolLabel(toolName, path);
          const entry: ActiveToolState = {
            callId,
            toolName,
            path,
            status: "running",
          };
          activeToolsMapRef.current[callId] = entry;
          setStreamParts((parts) => upsertToolPart(parts, entry));
          setToolStatus(`⏳ ${label}`);
          break;
        }

        case "tool_updated": {
          const entry = activeToolsMapRef.current[message.payload.callId];
          if (entry) {
            const updated = {
              ...entry,
              progressText: message.payload.text,
            };
            activeToolsMapRef.current[message.payload.callId] = updated;
            setStreamParts((parts) => upsertToolPart(parts, updated));
            if (message.payload.text) {
              setToolStatus(
                `⏳ ${toolLabel(entry.toolName, entry.path)} — ${message.payload.text}`
              );
            }
          }
          break;
        }

        case "tool_finished": {
          const entry = activeToolsMapRef.current[message.payload.callId];
          if (entry) {
            const updated: ActiveToolState = {
              ...entry,
              status: message.payload.success ? "finished" : "failed",
              success: message.payload.success,
            };
            const remaining = { ...activeToolsMapRef.current };
            delete remaining[message.payload.callId];
            activeToolsMapRef.current = remaining;
            setStreamParts((parts) => upsertToolPart(parts, updated));
          }
          if (Object.keys(activeToolsMapRef.current).length === 0) {
            setToolStatus("");
          }
          break;
        }

        case "run_phase":
          // Live liveness label for the main view (backend already streams it;
          // previously only the researcher inspector consumed it). Shown in the
          // composer while no tool is active — fills the pre-stream "thinking" gap.
          setRunPhaseLabel(
            message.payload.phase === "connecting"
              ? "Connecting…"
              : message.payload.phase === "thinking"
                ? "Thinking…"
                : ""
          );
          break;

        case "run_completed":
          setStreamParts([]);
          activeToolsMapRef.current = {};
          setIsRunning(false);
          setConnStatus("idle");
          setConnLabel("Ready");
          setToolStatus("");
          setRunPhaseLabel("");
          setRunHint("");
          setRunCompletedCount((count) => count + 1);
          if (message.payload.sessionId) {
            reconnectSessionIdRef.current = message.payload.sessionId;
            void refreshCurrentTranscript(message.payload.sessionId);
            void refreshSessions();
          }
          break;

        case "run_failed": {
          const interrupted = isInterruptedError(message.payload.error);
          setStreamParts((parts) => failRunningToolParts(parts));
          activeToolsMapRef.current = {};
          setIsRunning(false);
          setRunPhaseLabel("");
          setConnStatus(interrupted ? "idle" : "error");
          setConnLabel(interrupted ? "Ready" : "Error");
          setComposerNoticeTimed({
            prefix: interrupted ? undefined : "⚠",
            text: `${interrupted ? "Run interrupted: " : "Run failed: "}${message.payload.error}`,
            warn: !interrupted,
          });
          if (!interrupted) setRunHint("");
          if (sessionId) void refreshCurrentTranscript(sessionId);
          break;
        }

        case "approval_requested":
          setApprovals((prev) => [...prev, message.payload]);
          break;

        case "approval_resolved":
          setApprovals((prev) =>
            prev.filter(
              (entry) => entry.approvalId !== message.payload.approvalId
            )
          );
          break;

        case "extension_notice":
          setComposerNoticeTimed({
            prefix: message.payload.level === "info" ? undefined : "⚠",
            text: message.payload.message,
            warn: message.payload.level !== "info",
          });
          break;

        case "error": {
          if (message.payload.code === "auth_required") {
            setToolStatus("Please sign in to continue.");
            setLoginRequired(true);
            setIsRunning(false);
            break;
          }
          setComposerNoticeTimed({
            prefix: "⚠",
            text: message.payload.error,
            warn: true,
          });
          pendingOpenSessionIdRef.current = "";
          pendingAssetSwitchRef.current = false;
          setIsRunning(false);
          setConnStatus("error");
          setConnLabel("Error");
          if (reconnectSessionIdRef.current) {
            reconnectSessionIdRef.current = "";
            setToolStatus("");
          }
          break;
        }

        default:
          break;
      }
    },
    [
      clearStagedWorkspace,
      refreshCurrentTranscript,
      refreshSessionDetail,
      refreshSessions,
      selectedCatalogSessionId,
      sessionId,
      setComposerNoticeTimed,
    ]
  );

  const wsApiRef = useRef<ReturnType<typeof useWebSocket> | null>(null);

  const wsApi = useWebSocket({
    enabled: !loading && !loginRequired,
    reconnectSessionId: sessionId,
    onMessage: handleServerMessage,
    onStatus: (status, detail) => {
      if (status === "open") {
        setWsConnected(true);
        const resuming = reconnectSessionIdRef.current;
        setConnStatus(resuming ? "idle" : "idle");
        setConnLabel(detail?.label ?? "Connected");
        if (resuming) {
          setIsRunning(true);
          setToolStatus("Restoring conversation…");
        }
      } else if (status === "closed") {
        reconnectSessionIdRef.current = sessionId || reconnectSessionIdRef.current;
        setWsConnected(false);
        setSessionReady(false);
        setIsRunning(false);
        setApprovals([]);
        setConnStatus("disconnected");
        setConnLabel(detail?.label ?? "Disconnected");
        setStreamParts([]);
        activeToolsMapRef.current = {};
        setToolStatus("Reconnecting...");
      } else if (status === "error") {
        setWsConnected(false);
        setConnStatus("error");
        setConnLabel(detail?.label ?? "Connection error");
      } else {
        setWsConnected(false);
        setConnStatus("connecting");
        setConnLabel(detail?.label ?? "Connecting");
      }
    },
  });

  wsApiRef.current = wsApi;

  const beginNewSession = useCallback(() => {
    reconnectSessionIdRef.current = null;
    setMessages([]);
    setStreamParts([]);
    setWsError(null);
    setReviseMode(false);
    setRunHint(null);
    clearStagedWorkspace();
    if (sendMessage({ type: "new_session" })) {
      setIsRunning(true);
      setConnStatus("running");
      setConnLabel("Starting...");
    }
  }, [clearStagedWorkspace, sendMessage]);

  const startNewSession = useCallback(() => {
    if (isRunning) return;
    beginNewSession();
  }, [beginNewSession, isRunning]);

  const openCatalogSession = useCallback(
    (targetSessionId: string) => {
      if (!targetSessionId || isRunning) return;
      const summary = sessions.find((item) => item.sessionId === targetSessionId);
      if (summary && !summary.hasSessionFile) {
        setToolStatus("Conversation cannot be opened.");
        return;
      }
      setSelectedCatalogSessionId(targetSessionId);
      pendingOpenSessionIdRef.current = targetSessionId;
      if (
        sendMessage({
          type: "open_session",
          payload: { sessionId: targetSessionId },
        })
      ) {
        setIsRunning(true);
        setConnStatus("running");
        setConnLabel("Opening...");
        setToolStatus("Opening selected conversation…");
      } else {
        pendingOpenSessionIdRef.current = "";
      }
    },
    [isRunning, sendMessage, sessions]
  );

  const forkCurrentSession = useCallback(
    (purpose: "fork" | "side" | "helper" | "ab-arm") => {
      if (!sessionId || isRunning) return;
      const related = purpose === "side" || purpose === "helper";
      const message: ClientMessage = related
        ? { type: "create_related_session", payload: { purpose } }
        : { type: "fork_session", payload: { purpose } };
      if (sendMessage(message)) {
        setIsRunning(true);
        setConnStatus("running");
        setConnLabel(related ? "Creating..." : "Forking...");
        setToolStatus(
          purpose === "helper"
            ? "Starting a fresh helper…"
            : related
              ? "Starting a related conversation…"
              : "Branching conversation…"
        );
      }
    },
    [isRunning, sendMessage, sessionId]
  );

  const promoteRelatedSession = useCallback(
    async (targetSessionId: string) => {
      await promoteRelatedSessionRequest(targetSessionId);
      await refreshSessions();
      setActiveRelatedSessionId(null);
      openCatalogSession(targetSessionId);
    },
    [openCatalogSession, refreshSessions]
  );

  const renameSelectedSession = useCallback(async () => {
    const targetId = selectedSessionDetail?.session?.sessionId;
    if (!targetId) return;
    const current = sessionDisplayNames[targetId]?.alias || "";
    const next = window.prompt("Conversation name", current);
    if (next === null) return;
    const alias = normalizeSessionAlias(next);
    try {
      await saveSessionAlias(targetId, alias);
      setSessionDisplayNames((prev) => ({
        ...prev,
        [targetId]: { ...(prev[targetId] ?? { snippet: "" }), alias },
      }));
      setToolStatus("");
    } catch (err) {
      setToolStatus(
        `Rename failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, [selectedSessionDetail, sessionDisplayNames]);

  const performDeleteSelectedSession = useCallback(async () => {
    const targetId = selectedSessionDetail?.session?.sessionId;
    if (!targetId) return;
    try {
      await deleteSessionRequest(targetId);
      if (sessionId === targetId) {
        reconnectSessionIdRef.current = null;
        setMessages([]);
        clearStagedWorkspace();
        sendMessage({ type: "new_session" });
      }
      setSelectedCatalogSessionId(null);
      setSelectedSessionDetail(null);
      await refreshSessions();
    } catch (err) {
      setToolStatus(
        `Delete failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, [
    clearStagedWorkspace,
    refreshSessions,
    selectedSessionDetail,
    sendMessage,
    sessionId,
  ]);

  const deleteSelectedSession = useCallback(() => {
    const targetId = selectedSessionDetail?.session?.sessionId;
    if (!targetId) return;
    requestConfirm({
      message: "Delete this conversation from the conversation list?",
      confirmLabel: "Delete",
      onConfirm: () => {
        void performDeleteSelectedSession();
      },
    });
  }, [performDeleteSelectedSession, requestConfirm, selectedSessionDetail]);

  const sendPrompt = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      const outgoing = buildOutgoingPrompt(trimmed, stagedWorkspacePaths);
      if (!outgoing || isRunning) return false;
      if (!sendMessage({ type: "prompt", payload: outgoing })) return false;
      setMessages((prev) => [
        ...prev,
        { role: "user", text: outgoing, timestamp: null },
      ]);
      setStreamParts([]);
      setWsError(null);
      setRunHint("");
      setReviseMode(false);
      clearStagedWorkspace();
      setIsRunning(true);
      setConnStatus("running");
      setConnLabel("Thinking…");
      return true;
    },
    [clearStagedWorkspace, isRunning, sendMessage, stagedWorkspacePaths]
  );

  const abortRun = useCallback(() => {
    if (sendMessage({ type: "abort" })) {
      setToolStatus("Stopping…");
      setRunHint("You can edit or delete your latest message.");
    }
  }, [sendMessage]);

  const invokeSkill = useCallback(
    (skillName: string, userText?: string) => {
      if (!skillName || isRunning) return false;
      const payload = {
        skillName,
        ...(userText?.trim() ? { userText: userText.trim() } : {}),
      };
      if (!sendMessage({ type: "invoke_skill", payload })) return false;
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          text: userText?.trim() || `Invoke ${skillName}`,
          timestamp: null,
        },
      ]);
      setIsRunning(true);
      setConnStatus("running");
      setConnLabel("Thinking…");
      return true;
    },
    [isRunning, sendMessage]
  );

  const reviseLatest = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isRunning || !sessionId) return false;
      if (
        !sendMessage({
          type: "revise_latest",
          payload: reviseEntryId
            ? { text: trimmed, entryId: reviseEntryId }
            : { text: trimmed },
        })
      )
        return false;
      setReviseMode(false);
      setReviseDraft("");
      setReviseEntryId(null);
      setIsRunning(true);
      setConnStatus("running");
      setConnLabel("Revising...");
      setToolStatus("Revising the conversation...");
      return true;
    },
    [isRunning, sendMessage, sessionId, reviseEntryId]
  );

  const deleteLatest = useCallback(() => {
    if (!sendMessage({ type: "delete_latest" })) return;
    setToolStatus("Deleting latest turn...");
    setRunHint("");
  }, [sendMessage]);

  const startReviseMode = useCallback((text: string, entryId?: string) => {
    setReviseDraft(text);
    setReviseEntryId(entryId ?? null);
    setReviseMode(true);
    setRunHint(null);
    return text;
  }, []);

  const cancelReviseMode = useCallback(() => {
    setReviseMode(false);
    setReviseDraft("");
    setReviseEntryId(null);
  }, []);

  const setDraftWorkspace = useCallback(
    (primaryDir: string | null) => {
      if (sendMessage({ type: "set_draft_workspace", payload: { primaryDir } })) {
        // Sticky choice for the NEXT conversation; server echoes only in
        // draft state, so track it optimistically here.
        setWorkspacePrimaryDir(primaryDir);
      }
    },
    [sendMessage]
  );

  const addKnownWorkspace = useCallback(async (path: string) => {
    const result = await addWorkspaceRequest(path);
    setKnownWorkspaces(result.workspaces);
  }, []);

  const repointSession = useCallback(
    async (targetSessionId: string, primaryDir: string | null) => {
      await setSessionWorkspaceRequest(targetSessionId, primaryDir);
      void refreshSessions();
    },
    [refreshSessions]
  );

  useEffect(() => {
    if (appMode !== "local") return;
    listWorkspaces()
      .then((result) => setKnownWorkspaces(result.workspaces))
      .catch(() => {
        /* hosted or endpoint unavailable */
      });
  }, [appMode]);

  const branchFromEntry = useCallback(
    (entryId: string) => {
      if (!sessionId || isRunning) return;
      if (
        sendMessage({
          type: "fork_session",
          payload: { purpose: "fork", forkPointEntryId: entryId },
        })
      ) {
        setIsRunning(true);
        setConnStatus("running");
        setConnLabel("Branching...");
        setToolStatus("Branching from this point…");
      }
    },
    [sendMessage, sessionId, isRunning]
  );

  const switchProject = useCallback(
    (projectId: string | null) => {
      if (sendMessage({ type: "switch_project", payload: { projectId } })) {
        setSelectors((prev) => ({ ...prev, projectId }));
        if (sessionId) void refreshSessions();
      }
    },
    [refreshSessions, sendMessage, sessionId]
  );

  const switchKb = useCallback(
    (domain: string) => {
      if (!domain) return;
      if (sendMessage({ type: "switch_kb", payload: { domain } })) {
        setSelectors((prev) => ({ ...prev, currentDomain: domain }));
      }
    },
    [sendMessage]
  );

  const switchSoul = useCallback(
    (soulSlug: string | null) => {
      if (
        requestAssetSwitch(
          { type: "switch_soul", payload: { soulSlug } },
          "Switching soul..."
        )
      ) {
        setSelectors((prev) => ({ ...prev, soulSlug }));
      }
    },
    [requestAssetSwitch]
  );

  const switchRolePreset = useCallback(
    (rolePresetSlug: string | null) => {
      if (
        requestAssetSwitch(
          { type: "switch_role_preset", payload: { rolePresetSlug } },
          "Switching role preset..."
        )
      ) {
        setSelectors((prev) => ({ ...prev, rolePresetSlug }));
      }
    },
    [requestAssetSwitch]
  );

  const switchInstruction = useCallback(
    (customInstructionRef: string | null) => {
      if (
        requestAssetSwitch(
          { type: "switch_instruction", payload: { customInstructionRef } },
          "Switching instruction..."
        )
      ) {
        setSelectors((prev) => ({ ...prev, customInstructionRef }));
      }
    },
    [requestAssetSwitch]
  );

  const switchVisibility = useCallback(
    (visibility: "research" | "private") => {
      if (
        sendMessage({ type: "switch_visibility", payload: { visibility } })
      ) {
        setSelectors((prev) => ({ ...prev, visibility }));
        if (visibility === "private") {
          setComposerNoticeTimed({
            prefix: "⏏",
            text: "Private conversations and their files are deleted after 7 inactive days. Download anything you want to keep.",
          });
        }
      }
    },
    [sendMessage, setComposerNoticeTimed]
  );

  const switchMode = useCallback(
    (mode: CapabilityMode) => {
      if (sendMessage({ type: "switch_mode", payload: { mode } })) {
        setSessionMode(mode);
      }
    },
    [sendMessage]
  );

  const setSessionModel = useCallback(
    (override: SessionModelOverride | null) => {
      if (sendMessage({ type: "set_session_model", payload: { override } })) {
        setModelOverride(override);
      }
    },
    [sendMessage]
  );

  const setStudyTag = useCallback(
    (tag: StudyTag | null) => {
      if (sendMessage({ type: "set_study_tag", payload: { studyTag: tag } })) {
        setStudyTagState(tag);
        if (sessionId) void refreshSessions();
      }
    },
    [refreshSessions, sendMessage, sessionId]
  );

  const respondApproval = useCallback(
    (
      approvalId: string,
      response: { accept?: boolean; choice?: string | null; text?: string | null }
    ) => {
      sendMessage({ type: "respond_approval", payload: { approvalId, ...response } });
      setApprovals((prev) => prev.filter((entry) => entry.approvalId !== approvalId));
    },
    [sendMessage]
  );

  const addApprovalMarker = useCallback((text: string) => {
    setApprovalMarkers((prev) => (prev.includes(text) ? prev : [...prev, text]));
  }, []);

  const requestMetadata = useCallback(() => {
    sendMessage({ type: "get_session_metadata" });
  }, [sendMessage]);

  const requestMetrics = useCallback(() => {
    sendMessage({ type: "get_session_metrics" });
  }, [sendMessage]);

  const value = useMemo<AppContextValue>(
    () => ({
      auth,
      appMode,
      accountsConfigured,
      loginRequired,
      loading,
      authError,
      login,
      logout,
      viewMode,
      canSwitchMode,
      toggleViewMode,
      participant,
      transcriptView,
      setTranscriptView,
      discovery,
      localConfig,
      sessions,
      sessionSearch,
      setSessionSearch,
      selectedCatalogSessionId,
      selectedSessionDetail,
      sessionDisplayNames,
      sessionsLoading,
      sessionsError,
      refreshSessions,
      openCatalogSession,
      forkCurrentSession,
      activeRelatedSessionId,
      setActiveRelatedSessionId,
      promoteRelatedSession,
      renameSelectedSession,
      deleteSelectedSession,
      sessionId,
      sessionReady,
      sessionCreatedHere,
      sessionWarnings,
      isRunning,
      connStatus,
      connLabel,
      wsError,
      wsConnected,
      selectors,
      switchProject,
      switchKb,
      switchSoul,
      switchRolePreset,
      switchInstruction,
      switchVisibility,
      sessionMode,
      workspacePrimaryDir,
      knownWorkspaces,
      setDraftWorkspace,
      addKnownWorkspace,
      repointSession,
      switchMode,
      modelOverride,
      setSessionModel,
      studyTag,
      setStudyTag,
      messages,
      streamParts,
      toolStatus,
      runPhaseLabel,
      composerNotice,
      runHint,
      reviseMode,
      reviseDraft,
      stagedWorkspacePaths,
      attachmentHint,
      toggleWorkspaceStage,
      stageWorkspacePath,
      unstageWorkspacePaths,
      clearStagedWorkspace,
      runCompletedCount,
      requestConfirm,
      approvals,
      respondApproval,
      approvalMarkers,
      addApprovalMarker,
      manifest,
      metrics,
      startNewSession,
      sendPrompt,
      abortRun,
      invokeSkill,
      reviseLatest,
      deleteLatest,
      branchFromEntry,
      startReviseMode,
      cancelReviseMode,
      requestMetadata,
      requestMetrics,
    }),
    [
      auth,
      appMode,
      accountsConfigured,
      loginRequired,
      loading,
      authError,
      login,
      logout,
      viewMode,
      canSwitchMode,
      toggleViewMode,
      participant,
      transcriptView,
      discovery,
      localConfig,
      sessions,
      sessionSearch,
      selectedCatalogSessionId,
      selectedSessionDetail,
      sessionDisplayNames,
      sessionsLoading,
      sessionsError,
      refreshSessions,
      openCatalogSession,
      forkCurrentSession,
      activeRelatedSessionId,
      promoteRelatedSession,
      renameSelectedSession,
      deleteSelectedSession,
      sessionId,
      sessionReady,
      sessionCreatedHere,
      sessionWarnings,
      isRunning,
      connStatus,
      connLabel,
      wsError,
      wsConnected,
      selectors,
      switchProject,
      switchKb,
      switchSoul,
      switchRolePreset,
      switchInstruction,
      switchVisibility,
      sessionMode,
      workspacePrimaryDir,
      knownWorkspaces,
      setDraftWorkspace,
      addKnownWorkspace,
      repointSession,
      switchMode,
      modelOverride,
      setSessionModel,
      studyTag,
      setStudyTag,
      messages,
      streamParts,
      toolStatus,
      runPhaseLabel,
      composerNotice,
      runHint,
      reviseMode,
      reviseDraft,
      stagedWorkspacePaths,
      attachmentHint,
      toggleWorkspaceStage,
      stageWorkspacePath,
      unstageWorkspacePaths,
      clearStagedWorkspace,
      runCompletedCount,
      requestConfirm,
      approvals,
      respondApproval,
      approvalMarkers,
      addApprovalMarker,
      manifest,
      metrics,
      startNewSession,
      sendPrompt,
      abortRun,
      invokeSkill,
      reviseLatest,
      deleteLatest,
      branchFromEntry,
      startReviseMode,
      cancelReviseMode,
      requestMetadata,
      requestMetrics,
    ]
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={Boolean(confirmRequest)}
        message={confirmRequest?.message ?? ""}
        confirmLabel={confirmRequest?.confirmLabel}
        onConfirm={() => {
          confirmRequest?.onConfirm();
          setConfirmRequest(null);
        }}
        onCancel={() => setConfirmRequest(null)}
      />
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within AppProvider");
  }
  return ctx;
}
