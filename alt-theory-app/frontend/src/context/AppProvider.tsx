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
  saveSessionAlias,
} from "@/api/sessions";
import type {
  ActiveToolState,
  AssemblyManifest,
  AuthContext,
  ClientMessage,
  DiscoveryLists,
  ServerMessage,
  SessionDetailResponse,
  SessionDraftSnapshot,
  SessionMetrics,
  SessionSelectors,
  SessionSnapshot,
  SessionSummary,
  TranscriptMessage,
  TranscriptView,
  ViewMode,
} from "@/api/types";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { ConnStatus } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DEFAULT_KB_DOMAIN } from "@/lib/constants";
import { isInterruptedError } from "@/lib/format";
import { toolLabel } from "@/lib/tools";
import { buildOutgoingPrompt } from "@/lib/workspace";
import {
  defaultTranscriptView,
  readDebugExpanded,
  viewModeForRole,
  writeDebugExpanded,
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
  debugExpanded: boolean;
  toggleDebugExpanded: () => void;
  transcriptView: TranscriptView;
  setTranscriptView: (view: TranscriptView) => void;

  discovery: DiscoveryLists | null;

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
  renameSelectedSession: () => Promise<void>;
  deleteSelectedSession: () => void;

  sessionId: string | null;
  sessionReady: boolean;
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

  messages: TranscriptMessage[];
  streamingText: string | null;
  activeTools: ActiveToolState[];
  toolStatus: string;
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

  manifest: AssemblyManifest | null;
  metrics: SessionMetrics | null;

  startNewSession: () => void;
  sendPrompt: (text: string) => boolean;
  abortRun: () => void;
  invokeSkill: (skillName: string, userText?: string) => boolean;
  reviseLatest: (text: string) => boolean;
  deleteLatest: () => void;
  startReviseMode: (text: string) => string;
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

function finalizeStaleTools(
  tools: Record<string, ActiveToolState>,
  success = true
): ActiveToolState[] {
  return Object.values(tools).map((tool) => ({
    ...tool,
    status: success ? "finished" : "failed",
    success,
  }));
}

function upsertToolInOrder(
  current: ActiveToolState[],
  next: ActiveToolState
): ActiveToolState[] {
  const index = current.findIndex((tool) => tool.callId === next.callId);
  if (index === -1) return [...current, next];
  return current.map((tool, i) => (i === index ? next : tool));
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
  const [viewMode, setViewMode] = useState<ViewMode>("researcher");
  const [debugExpanded, setDebugExpanded] = useState(() => readDebugExpanded());
  const [transcriptView, setTranscriptView] = useState<TranscriptView>("developer");

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
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
  const [isRunning, setIsRunning] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>("connecting");
  const [connLabel, setConnLabel] = useState("Connecting");
  const [wsError, setWsError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [selectors, setSelectors] = useState<SessionSelectors>(defaultSelectors);

  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [activeTools, setActiveTools] = useState<ActiveToolState[]>([]);
  const [toolStatus, setToolStatus] = useState("");
  const [composerNotice, setComposerNotice] = useState<ComposerNotice | null>(
    null
  );
  const [runHint, setRunHint] = useState<string | null>(null);
  const [reviseMode, setReviseMode] = useState(false);
  const [reviseDraft, setReviseDraft] = useState("");
  const [stagedWorkspacePaths, setStagedWorkspacePaths] = useState<string[]>([]);
  const [runCompletedCount, setRunCompletedCount] = useState(0);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(
    null
  );

  const [manifest, setManifest] = useState<AssemblyManifest | null>(null);
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);

  const reconnectSessionIdRef = useRef<string | null>(null);
  const pendingOpenSessionIdRef = useRef("");
  const pendingAssetSwitchRef = useRef(false);
  const activeToolsMapRef = useRef<Record<string, ActiveToolState>>({});
  const composerNoticeTimerRef = useRef<number | null>(null);
  const hydratedNamesRef = useRef<Set<string>>(new Set());

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
      const nextDebugExpanded =
        nextViewMode === "participant" ? readDebugExpanded() : false;

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
      setDebugExpanded(nextDebugExpanded);
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
    writeDebugExpanded(false);
    window.location.reload();
  }, []);

  const toggleDebugExpanded = useCallback(() => {
    setDebugExpanded((prev) => {
      const next = !prev;
      writeDebugExpanded(next);
      return next;
    });
  }, []);

  const refreshSessions = useCallback(async () => {
    if (loginRequired) return;
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const list = await fetchSessionList();
      setSessions(list);

      const visibleId = selectedCatalogSessionId;
      if (visibleId && list.some((item) => item.sessionId === visibleId)) {
        const detail = await fetchSessionDetail(visibleId);
        setSelectedSessionDetail(detail);
      } else if (list.length > 0) {
        const firstId = list[0].sessionId;
        setSelectedCatalogSessionId(firstId);
        const detail = await fetchSessionDetail(firstId);
        setSelectedSessionDetail(detail);
      } else {
        setSelectedCatalogSessionId(null);
        setSelectedSessionDetail(null);
      }
    } catch (err) {
      setSessions([]);
      setSelectedCatalogSessionId(null);
      setSelectedSessionDetail(null);
      setSessionsError(
        err instanceof Error ? err.message : "Could not load sessions"
      );
    } finally {
      setSessionsLoading(false);
    }
  }, [loginRequired, selectedCatalogSessionId]);

  useEffect(() => {
    if (!loading && !loginRequired) {
      void refreshSessions();
    }
  }, [loading, loginRequired, refreshSessions]);

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
          setIsRunning(false);
          setSelectors(applySnapshotSelectors(message.payload));
          setManifest(null);
          setMetrics(null);
          setMessages([]);
          setStreamingText(null);
          setActiveTools([]);
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
          if (
            pendingOpenSessionIdRef.current &&
            message.payload.sessionId === pendingOpenSessionIdRef.current
          ) {
            setMessages([]);
            setStreamingText(null);
            pendingOpenSessionIdRef.current = "";
          }
          if (pendingAssetSwitchRef.current) {
            setMessages([]);
            setStreamingText(null);
            pendingAssetSwitchRef.current = false;
          }
          setSessionId(message.payload.sessionId);
          reconnectSessionIdRef.current = message.payload.sessionId;
          setSelectors(applySnapshotSelectors(message.payload));
          setSessionReady(true);
          setIsRunning(message.payload.status === "running");
          setConnStatus(message.payload.status === "running" ? "running" : "idle");
          setConnLabel(message.payload.status === "running" ? "Running" : "Ready");
          setWsError(null);
          setToolStatus("");
          clearStagedWorkspace();
          void refreshSessions();
          if (selectedCatalogSessionId === message.payload.sessionId) {
            void fetchSessionDetail(message.payload.sessionId).then(setSelectedSessionDetail);
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
            void fetchSessionDetail(message.payload.sessionId).then(setSelectedSessionDetail);
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
          setStreamingText(null);
          setActiveTools([]);
          activeToolsMapRef.current = {};
          setConnStatus("idle");
          setConnLabel("Ready");
          setToolStatus("");
          setIsRunning(false);
          break;

        case "assistant_delta":
          setStreamingText((prev) => `${prev ?? ""}${message.payload.text}`);
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
          setActiveTools((current) => upsertToolInOrder(current, entry));
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
            setActiveTools((current) => upsertToolInOrder(current, updated));
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
            setActiveTools((current) => upsertToolInOrder(current, updated));
          }
          if (Object.keys(activeToolsMapRef.current).length === 0) {
            setToolStatus("");
          }
          break;
        }

        case "run_completed":
          setActiveTools([]);
          activeToolsMapRef.current = {};
          setStreamingText(null);
          setIsRunning(false);
          setConnStatus("idle");
          setConnLabel("Ready");
          setToolStatus("");
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
          setActiveTools(finalizeStaleTools(activeToolsMapRef.current, false));
          activeToolsMapRef.current = {};
          setStreamingText(null);
          setIsRunning(false);
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
          setToolStatus("Restoring session…");
        }
      } else if (status === "closed") {
        reconnectSessionIdRef.current = sessionId || reconnectSessionIdRef.current;
        setWsConnected(false);
        setSessionReady(false);
        setIsRunning(false);
        setConnStatus("disconnected");
        setConnLabel(detail?.label ?? "Disconnected");
        setStreamingText(null);
        setActiveTools([]);
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
    setStreamingText(null);
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
    if (messages.length > 0) {
      requestConfirm({
        message: "Start a new session? Current chat will be cleared.",
        confirmLabel: "New Session",
        onConfirm: beginNewSession,
      });
      return;
    }
    beginNewSession();
  }, [beginNewSession, isRunning, messages.length, requestConfirm]);

  const openCatalogSession = useCallback(
    (targetSessionId: string) => {
      if (!targetSessionId || isRunning) return;
      const summary = sessions.find((item) => item.sessionId === targetSessionId);
      if (!summary?.hasSessionFile) {
        setToolStatus("Session cannot be opened.");
        return;
      }
      setSelectedCatalogSessionId(targetSessionId);
      void fetchSessionDetail(targetSessionId).then(setSelectedSessionDetail);
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
        setToolStatus("Opening selected session…");
      } else {
        pendingOpenSessionIdRef.current = "";
      }
    },
    [isRunning, sendMessage, sessions]
  );

  const renameSelectedSession = useCallback(async () => {
    const targetId = selectedSessionDetail?.session?.sessionId;
    if (!targetId) return;
    const current = sessionDisplayNames[targetId]?.alias || "";
    const next = window.prompt("Session name", current);
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
      message: "Delete the selected session from the normal list?",
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
      setStreamingText(null);
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
      if (!sendMessage({ type: "revise_latest", payload: { text: trimmed } }))
        return false;
      setReviseMode(false);
      setReviseDraft("");
      setIsRunning(true);
      setConnStatus("running");
      setConnLabel("Revising...");
      setToolStatus("Revising latest turn...");
      return true;
    },
    [isRunning, sendMessage, sessionId]
  );

  const deleteLatest = useCallback(() => {
    if (!sendMessage({ type: "delete_latest" })) return;
    setToolStatus("Deleting latest turn...");
    setRunHint("");
  }, [sendMessage]);

  const startReviseMode = useCallback((text: string) => {
    setReviseDraft(text);
    setReviseMode(true);
    setRunHint(null);
    return text;
  }, []);

  const cancelReviseMode = useCallback(() => {
    setReviseMode(false);
    setReviseDraft("");
  }, []);

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
            text: "Private sessions and files are deleted after 7 inactive days. Download anything you want to keep.",
          });
        }
      }
    },
    [sendMessage, setComposerNoticeTimed]
  );

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
      debugExpanded,
      toggleDebugExpanded,
      transcriptView,
      setTranscriptView,
      discovery,
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
      renameSelectedSession,
      deleteSelectedSession,
      sessionId,
      sessionReady,
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
      messages,
      streamingText,
      activeTools,
      toolStatus,
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
      manifest,
      metrics,
      startNewSession,
      sendPrompt,
      abortRun,
      invokeSkill,
      reviseLatest,
      deleteLatest,
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
      debugExpanded,
      toggleDebugExpanded,
      transcriptView,
      discovery,
      sessions,
      sessionSearch,
      selectedCatalogSessionId,
      selectedSessionDetail,
      sessionDisplayNames,
      sessionsLoading,
      sessionsError,
      refreshSessions,
      openCatalogSession,
      renameSelectedSession,
      deleteSelectedSession,
      sessionId,
      sessionReady,
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
      messages,
      streamingText,
      activeTools,
      toolStatus,
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
      manifest,
      metrics,
      startNewSession,
      sendPrompt,
      abortRun,
      invokeSkill,
      reviseLatest,
      deleteLatest,
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
