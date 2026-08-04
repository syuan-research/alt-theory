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
import { t } from "@/i18n";
import {
  mergeQueuedPrompts,
  shouldFlushQueuedPrompts,
} from "@/lib/promptQueue";
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
  AltMode,
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
  SessionVisibility,
  StreamPart,
  StudyTag,
  TranscriptMessage,
  TranscriptView,
  ViewMode,
  ParticipantInfo,
  ConfigStatus,
  RuntimeMode,
} from "@/api/types";
import {
  addWorkspace as addWorkspaceRequest,
  listWorkspaces,
  removeWorkspace as removeWorkspaceRequest,
  setSessionWorkspace as setSessionWorkspaceRequest,
} from "@/api/workspaces";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { ConnStatus } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DEFAULT_KB_DOMAIN } from "@/lib/constants";
import { isInterruptedError } from "@/lib/format";
import { handleConversationStreamMessage } from "@/lib/conversationStream";
import { notifyBackground } from "@/lib/notify";
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

/** Why a conversation in the list is asking for attention (alpha.3). */
export type SessionAlert = "done" | "failed" | "approval";

export interface ComposerNotice {
  prefix?: string;
  text: string;
  warn?: boolean;
}

export interface QueuedPrompt {
  id: string;
  text: string;
  attachments: string[];
}

export interface ConfirmRequest {
  message: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (result?: { checkboxChecked: boolean }) => void;
  /** Optional opt-in checkbox (e.g. whole-folder migration, item 4). */
  checkbox?: { label: string; defaultChecked?: boolean; danger?: boolean };
}

export interface AppContextValue {
  auth: AuthContext;
  appMode: "local" | "hosted";
  runtimeMode: RuntimeMode;
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
  /** Re-fetch role/KB/skill lists after the user adds assets in Settings. */
  refreshDiscovery: () => Promise<void>;
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
  forkCurrentSession: (
    purpose: "fork" | "side" | "helper" | "ab-arm",
    seedPrompt?: string,
  ) => void;
  duplicateSession: (sessionId: string) => void;
  /** Conversations that changed state while you were looking elsewhere. */
  sessionAlerts: Record<string, SessionAlert>;
  activeRelatedSessionId: string | null;
  /**
   * Preferred right-rail width when this related conversation is opened:
   * half ≈ branch/edit comparison; default ≈ btw/helper/subagent.
   */
  relatedPaneSize: "half" | "default" | null;
  setActiveRelatedSessionId: (
    sessionId: string | null,
    opts?: { size?: "half" | "default" },
  ) => void;
  /** Draft for a just-created child; helper sends immediately, compare waits. */
  childSeed: { sessionId: string; text: string; autoSend: boolean } | null;
  clearChildSeed: () => void;
  promoteRelatedSession: (sessionId: string) => Promise<void>;
  renameSelectedSession: (sessionId: string, name: string) => Promise<boolean>;
  deleteSelectedSession: (sessionId?: string) => void;

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
  switchVisibility: (visibility: SessionVisibility) => void;

  /** Working folder for the draft/current conversation; null = none. */
  workspacePrimaryDir: string | null;
  /** Explicitly added working folders (may be empty of sessions). */
  knownWorkspaces: string[];
  /** Choose the working folder for the next (or current) conversation. */
  setDraftWorkspace: (primaryDir: string | null) => void;
  addKnownWorkspace: (path: string) => Promise<void>;
  removeKnownWorkspace: (path: string) => Promise<void>;
  /** Re-point any existing session's working folder (drag & drop, M4). */
  repointSession: (sessionId: string, primaryDir: string | null,) => Promise<void>;

  /** Situational preset buttons (v1.4 round 1 experiment). */
  presetButtons: string[];
  setPresetButtons: (names: string[]) => void;
  presetState: {
    sessionId: string;
    name: string;
    ordinal: number;
    turnsLeft: number;
    locked: boolean;
  } | null;
  /** Click state machine: inactive → press, active → lock, locked → unlock. */
  pressPreset: (name: string) => void;

  sessionMode: AltMode;
  switchMode: (mode: AltMode) => void;
  modelOverride: SessionModelOverride | null;
  currentSessionModel: { provider: string; modelId: string } | null;
  setSessionModel: (override: SessionModelOverride | null) => void;
  studyTag: StudyTag | null;
  /** Hosted-only deletion date for a "private" conversation; null locally. */
  retentionDueAt: string | null;
  setStudyTag: (tag: StudyTag | null) => void;

  messages: TranscriptMessage[];
  streamParts: StreamPart[];
  toolStatus: string;
  /** Live run-phase label (e.g. "Thinking…") shown while no tool is active. */
  runPhaseLabel: string;
  composerNotice: ComposerNotice | null;
  runHint: string | null;
  canRetryFailed: boolean;

  stagedWorkspacePaths: string[];
  toggleWorkspaceStage: (path: string, staged: boolean) => void;
  stageWorkspacePath: (path: string) => void;
  unstageWorkspacePaths: (paths: string[]) => void;
  clearStagedWorkspace: () => void;

  runCompletedCount: number;
  requestConfirm: (request: ConfirmRequest) => void;

  approvals: ApprovalRequestPayload[];
  respondApproval: (
    approvalId: string,
    response: { accept?: boolean; choice?: string | null; text?: string | null; },
  ) => void;
  approvalMarkers: string[];
  addApprovalMarker: (text: string) => void;

  manifest: AssemblyManifest | null;
  metrics: SessionMetrics | null;

  startNewSession: () => void;
  compactCurrentSession: () => void;
  sendPrompt: (text: string) => boolean;
  queuedPrompts: QueuedPrompt[];
  restoreQueuedPrompt: (id: string) => string | null;
  deleteQueuedPrompt: (id: string) => void;
  sendQueuedPromptNow: (id: string) => void;
  interruptAndSendQueuedPrompt: (id: string) => void;
  abortRun: () => void;
  invokeSkill: (skillName: string, userText?: string) => boolean;
  branchRevision: (text: string, entryId?: string) => boolean;
  prepareBranchRevision: (text: string, entryId: string) => boolean;
  retryLatest: () => boolean;
  deleteLatest: () => void;
  requestMetadata: () => void;
  requestMetrics: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Situational preset buttons (v1.4 round 1): turns a press stays active. */
const PRESET_TURNS = 5;
const DEFAULT_PRESET_BUTTONS = [
  "adaptive-aligning",
  "confirm-why",
  "guided-next-steps",
  "clear-misunderstanding",
];

function applySnapshotSelectors(
  payload: SessionSnapshot | SessionDraftSnapshot,
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

export function AppProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [auth, setAuth] = useState<AuthContext>(anonymousAuth);
  const [appMode, setAppMode] = useState<"local" | "hosted">("hosted");
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("alt-theory");
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
  const [activeRelatedSessionId, setActiveRelatedSessionIdState] = useState<
    string | null
  >(null);
  const [relatedPaneSize, setRelatedPaneSize] = useState<
    "half" | "default" | null
  >(null);
  const setActiveRelatedSessionId = useCallback(
    (sessionId: string | null, opts?: { size?: "half" | "default" }) => {
      setActiveRelatedSessionIdState(sessionId);
      if (!sessionId) setRelatedPaneSize(null);
      else if (opts?.size) setRelatedPaneSize(opts.size);
    },
    [],
  );
  const pendingChildSeedRef = useRef<{ text: string; autoSend: boolean } | null>(null);
  const [childSeed, setChildSeed] = useState<
    { sessionId: string; text: string; autoSend: boolean } | null
  >(null);
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
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const queuedPromptsRef = useRef<QueuedPrompt[]>([]);
  const sendQueueAfterInterruptRef = useRef<string | null>(null);
  const startPromptRef = useRef<
    (text: string, attachments: string[]) => boolean
  >(() => false);
  const flushQueuedPromptRef = useRef<(id?: string) => void>(() => {});
  const [connStatus, setConnStatus] = useState<ConnStatus>("connecting");
  const [connLabel, setConnLabel] = useState(t("Connecting"));
  const [wsError, setWsError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [selectors, setSelectors] = useState<SessionSelectors>(defaultSelectors);
  const [sessionMode, setSessionMode] = useState<AltMode>("understand");
  const [workspacePrimaryDir, setWorkspacePrimaryDir] = useState<string | null>(
    null,
  );
  const [knownWorkspaces, setKnownWorkspaces] = useState<string[]>([]);
  const [modelOverride, setModelOverride] =
    useState<SessionModelOverride | null>(null);
  const [currentSessionModel, setCurrentSessionModel] = useState<{
    provider: string;
    modelId: string;
  } | null>(null);
  const [studyTag, setStudyTagState] = useState<StudyTag | null>(null);
  // Hosted-only: when a "private" conversation gets deleted. Null locally —
  // local conversations have no expiry at all.
  const [retentionDueAt, setRetentionDueAt] = useState<string | null>(null);

  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [streamParts, setStreamParts] = useState<StreamPart[]>([]);
  const [toolStatus, setToolStatus] = useState("");
  const [runPhaseLabel, setRunPhaseLabel] = useState("");
  const [composerNotice, setComposerNotice] = useState<ComposerNotice | null>(
    null,
  );
  const [runHint, setRunHint] = useState<string | null>(null);
  const [canRetryFailed, setCanRetryFailed] = useState(false);
  const [stagedWorkspacePaths, setStagedWorkspacePaths] = useState<string[]>([],);
  const [runCompletedCount, setRunCompletedCount] = useState(0);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(
    null,
  );
  const [approvals, setApprovals] = useState<ApprovalRequestPayload[]>([]);
  // Conversation-scoped approval markers, recorded
  // client-side the moment the user grants a conversation allowance (M7 §3).
  const [approvalMarkers, setApprovalMarkers] = useState<string[]>([]);

  const [manifest, setManifest] = useState<AssemblyManifest | null>(null);
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [sessionAlerts, setSessionAlerts] = useState<Record<string, SessionAlert>>({});
  const sessionRunStatusRef = useRef<Record<string, string>>({});

  const reconnectSessionIdRef = useRef<string | null>(null);
  const pendingOpenSessionIdRef = useRef("");
  const pendingAssetSwitchRef = useRef(false);
  const pendingCompactRef = useRef(false);
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
      prev.includes(path) ? prev : [...prev, path],
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
    [],
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
        !me.localConfig.anyUsable &&
        window.location.pathname !== "/config"
      ) {
        navigate("/config?firstRun=1", { replace: true });
        return;
      }

      setAuth(me.auth ?? anonymousAuth);
      setAppMode(mode);
      setRuntimeMode(me.app?.runtimeMode ?? "alt-theory");
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
      setRuntimeMode("alt-theory");
      setAccountsConfigured(false);
      setLoginRequired(false);
      setDiscovery(null);
      setAuthError(err instanceof Error ? err.message : t("Auth check failed"));
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
  }, [],);

  const refreshDiscovery = useCallback(async () => {
    try {
      setDiscovery(await fetchDiscovery());
    } catch {
      /* keep the current lists */
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
          : ( list[0]?.sessionId ?? null
      ),
      );
    } catch (err) {
      if (requestId === sessionListRequestRef.current) {
        setSessionsError(
          err instanceof Error ? err.message : t("Could not load conversations"),
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
        setComposerNoticeTimed({ prefix: "⚠", text: t("Not connected"), warn: true, });
        wsApiRef.current?.reconnect();
      }
      return sent;
    },
    [setComposerNoticeTimed],
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
      setConnLabel(t("Switching..."));
      setToolStatus(label);
      return true;
    },
    [sendMessage],
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
  }, [],);

  const handleServerMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case "session_draft":
          setCanRetryFailed(false);
          if (reconnectSessionIdRef.current) {
            // Even when the draft message is ignored (reconnect race), a
            // pending asset switch was answered by THIS message — leaving its
            // "Switching role preset…" status would strand the composer in a
            // fake busy state with nothing left to clear it.
            if (pendingAssetSwitchRef.current) {
              pendingAssetSwitchRef.current = false;
              setToolStatus("");
              setIsRunning(false);
              setConnStatus("idle");
              setConnLabel(t("Ready"));
              setSelectors(applySnapshotSelectors(message.payload));
            }
            break;
          }
          setSessionId(null);
          setSessionReady(true);
          setSessionCreatedHere(false);
          setSessionWarnings([]);
          setIsRunning(false);
          // A draft answers asset switches with this message and nothing else,
          // so the "Switching role preset…" status has to be cleared here or it
          // sits on the new-conversation screen forever.
          pendingAssetSwitchRef.current = false;
          setToolStatus("");
          setConnStatus("idle");
          setConnLabel(t("Ready"));
          setSelectors(applySnapshotSelectors(message.payload));
          setSessionMode(message.payload.mode ?? "understand");
          setModelOverride(message.payload.modelOverride ?? null);
          setCurrentSessionModel(null);
          setWorkspacePrimaryDir(message.payload.workspacePrimaryDir ?? null);
          setStudyTagState(message.payload.studyTag ?? null);
          setRetentionDueAt(null);
          setApprovalMarkers([]);
          setManifest(null);
          setMetrics(null);
          setMessages([]);
          setStreamParts([]);
          activeToolsMapRef.current = {};
          setConnStatus("idle");
          setConnLabel(t("Ready"));
          setRunPhaseLabel("");
          setWsError(null);
          pendingAssetSwitchRef.current = false;
          pendingOpenSessionIdRef.current = "";
          if (message.payload.resetComposer) clearStagedWorkspace();
          void refreshSessions();
          break;

        case "session_opened": {
          setCanRetryFailed(false);
          // Decide "created here" before the pending refs are consumed below:
          // an explicit open, an asset-switch rebuild, or a reconnect to the
          // same id is NOT a new conversation (persisted Work mode must not
          // silently expand an existing Understand session's tools).
          setSessionCreatedHere(
            !pendingOpenSessionIdRef.current &&
              !pendingAssetSwitchRef.current &&
              message.payload.sessionId !== reconnectSessionIdRef.current,
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
          setSessionMode(message.payload.mode ?? "understand");
          setModelOverride(message.payload.modelOverride ?? null);
          setCurrentSessionModel(message.payload.currentModel ?? null);
          setStudyTagState(message.payload.studyTag ?? null);
          setRetentionDueAt(message.payload.retentionDueAt ?? null);
          setSessionReady(true);
          setIsRunning(message.payload.status === "running");
          setConnStatus(message.payload.status === "running" ? "running" : "idle",);
          setConnLabel(message.payload.status === "running" ? t("Running") : t("Ready"),);
          setWsError(null);
          setToolStatus("");
          setRunPhaseLabel(
            message.payload.status === "running" ? "Processing…" : "",
          );
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
          if (message.payload.currentModel) {
            setCurrentSessionModel(message.payload.currentModel);
          }
          if (message.payload.studyTag !== undefined) {
            setStudyTagState(message.payload.studyTag);
          }
          if (message.payload.retentionDueAt !== undefined) {
            setRetentionDueAt(message.payload.retentionDueAt);
          }
          if (message.payload.status === "running") {
            setConnStatus("running");
            setConnLabel(t("Running"));
            setIsRunning(true);
          } else {
            setConnStatus("idle");
            setConnLabel(message.payload.status || t("Ready"));
            setIsRunning(false);
            setToolStatus("");
            setRunPhaseLabel("");
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
          if (
            pendingCompactRef.current &&
            message.payload.messages.some(
              (item) => item.marker === "compaction",
            )
          ) {
            pendingCompactRef.current = false;
            setComposerNoticeTimed({ text: t("Conversation compacted.") });
          }
          break;

        case "related_session_created":
          // btw / helper: keep the original compact default (~480), not 50%.
          setActiveRelatedSessionId(message.payload.sessionId, {
            size: "default",
          });
          if (pendingChildSeedRef.current) {
            setChildSeed({
              sessionId: message.payload.sessionId,
              ...pendingChildSeedRef.current,
            });
            pendingChildSeedRef.current = null;
          }
          setIsRunning(false);
          setConnStatus("idle");
          setConnLabel("Ready");
          setToolStatus("");
          void refreshSessions();
          break;

        case "branch_created":
          // Main conversation stays in the center. Branched edit work opens in
          // the right Related rail at ~50% width.
          // Center multi-arm compare stays on Workbench A/B only.
          setActiveRelatedSessionId(message.payload.sessionId, {
            size: "half",
          });
          if (pendingChildSeedRef.current) {
            setChildSeed({
              sessionId: message.payload.sessionId,
              ...pendingChildSeedRef.current,
            });
            pendingChildSeedRef.current = null;
          }
          setIsRunning(false);
          setConnStatus("idle");
          setConnLabel("Ready");
          setToolStatus("");
          setRunPhaseLabel("");
          void refreshSessions();
          break;

        case "assistant_delta":
        case "thinking_delta":
        case "tool_started":
        case "tool_updated":
        case "tool_finished":
        case "run_phase":
          handleConversationStreamMessage(message, {
            activeTools: activeToolsMapRef,
            setParts: setStreamParts,
            setPhaseLabel: setRunPhaseLabel,
          });
          break;

        case "run_completed":
          sendQueueAfterInterruptRef.current = null;
          setCanRetryFailed(false);
          setStreamParts([]);
          activeToolsMapRef.current = {};
          setCurrentSessionModel(message.payload.currentModel ?? null);
          setIsRunning(false);
          setConnStatus("idle");
          setConnLabel("Ready");
          setToolStatus("");
          setRunPhaseLabel("");
          setRunHint("");
          setRunCompletedCount((count) => count + 1);
          // Keep the composer's context ring honest without polling.
          sendMessage({ type: "get_session_metrics" });
          if (message.payload.sessionId) {
            reconnectSessionIdRef.current = message.payload.sessionId;
            void refreshSessions();
            // Flush only after the transcript refresh lands: the refresh
            // replaces the whole message list with what the server persisted
            // BEFORE the queued prompt, so flushing first would wipe the
            // queued message's bubble until the next run finishes.
            void refreshCurrentTranscript(message.payload.sessionId).finally(
              () => flushQueuedPromptRef.current(),
            );
          } else {
            queueMicrotask(() => flushQueuedPromptRef.current());
          }
          break;

        case "run_failed": {
          const interrupted = isInterruptedError(message.payload.error);
          const queuedPromptId = interrupted
            ? sendQueueAfterInterruptRef.current
            : null;
          sendQueueAfterInterruptRef.current = null;
          // The transcript refresh below re-renders everything from the
          // authoritative persisted entries; leftover stream parts would
          // render the same tool calls twice.
          setStreamParts([]);
          activeToolsMapRef.current = {};
          setIsRunning(false);
          setCanRetryFailed(message.payload.canRetry !== false);
          setToolStatus("");
          setRunPhaseLabel("");
          setConnStatus(interrupted ? "idle" : "error");
          setConnLabel(interrupted ? t("Ready") : t("Error"));
          setComposerNoticeTimed({
            prefix: interrupted ? undefined : "⚠",
            text: `${interrupted ? t("Run interrupted: ") : t("Run failed: ")}${message.payload.error}`,
            warn: !interrupted,
          });
          if (!interrupted) setRunHint("");
          {
            // Same ordering as run_completed: the refresh full-replaces the
            // message list, so it must land before the queued prompt's
            // optimistic bubble is appended or the bubble disappears.
            const refreshed = sessionId
              ? refreshCurrentTranscript(sessionId)
              : Promise.resolve();
            if (
              interrupted &&
              shouldFlushQueuedPrompts("interrupted", Boolean(queuedPromptId))
            ) {
              void refreshed.finally(() =>
                flushQueuedPromptRef.current(queuedPromptId ?? undefined),
              );
            }
          }
          break;
        }

        case "approval_requested":
          setApprovals((prev) => [...prev, message.payload]);
          break;

        case "approval_resolved":
          setApprovals((prev) =>
            prev.filter(
              (entry) => entry.approvalId !== message.payload.approvalId,
            ),
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
          pendingCompactRef.current = false;
          if (message.payload.code === "auth_required") {
            setToolStatus(t("Please sign in to continue."));
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
      setActiveRelatedSessionId,
      setComposerNoticeTimed,
    ],
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
          setToolStatus(t("Restoring conversation…"));
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
        setToolStatus(t("Reconnecting..."));
      } else if (status === "error") {
        setWsConnected(false);
        setConnStatus("error");
        setConnLabel(detail?.label ?? t("Connection error"));
      } else {
        setWsConnected(false);
        setConnStatus("connecting");
        setConnLabel(detail?.label ?? t("Connecting"));
      }
    },
  });

  wsApiRef.current = wsApi;

  const beginNewSession = useCallback(() => {
    reconnectSessionIdRef.current = null;
    setSelectedCatalogSessionId(null);
    queuedPromptsRef.current = [];
    setQueuedPrompts([]);
    setMessages([]);
    setStreamParts([]);
    setWsError(null);
    setRunHint(null);
    setRunPhaseLabel("");
    clearStagedWorkspace();
    if (sendMessage({ type: "new_session" })) {
      setIsRunning(true);
      setConnStatus("running");
      setConnLabel(t("Starting..."));
      setRunPhaseLabel(t("Connecting…"));
    }
  }, [clearStagedWorkspace, sendMessage]);

  const startNewSession = useCallback(() => {
    beginNewSession();
  }, [beginNewSession]);

  const compactCurrentSession = useCallback(() => {
    if (!sessionId || isRunning) return;
    if (sendMessage({ type: "compact" })) {
      pendingCompactRef.current = true;
      setIsRunning(true);
      setConnStatus("running");
      setConnLabel(t("Compacting..."));
      setToolStatus("");
      setRunPhaseLabel(t("Compacting conversation…"));
    }
  }, [isRunning, sendMessage, sessionId]);

  const openCatalogSession = useCallback(
    (targetSessionId: string) => {
      if (!targetSessionId || targetSessionId === sessionId) return;
      const summary = sessions.find((item) => item.sessionId === targetSessionId,);
      if (summary && !summary.hasSessionFile) {
        setToolStatus(t("Conversation cannot be opened."));
        return;
      }
      queuedPromptsRef.current = [];
      setQueuedPrompts([]);
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
        setConnLabel(t("Opening..."));
        setToolStatus("");
        setRunPhaseLabel(t("Opening conversation…"));
      } else {
        pendingOpenSessionIdRef.current = "";
      }
    },
    [sendMessage, sessionId, sessions],
  );

  useEffect(() => {
    if (
      !sessions.some(
        (session) =>
          session.runStatus === "running" ||
          session.runStatus === "awaiting-approval",
      )
    )
      return;
    const timer = window.setInterval(() => void refreshSessions(), 1500);
    return () => window.clearInterval(timer);
  }, [refreshSessions, sessions]);

  // Background visibility (alpha.3). Switching between running Work sessions
  // already worked, but a session that finished, failed, or stopped for an
  // approval while you were elsewhere signalled nothing. Watch the polled list
  // for transitions and leave a mark that survives until the session is opened.
  useEffect(() => {
    const previous = sessionRunStatusRef.current;
    const next: Record<string, string> = {};
    const raised: Record<string, SessionAlert> = {};
    for (const session of sessions) {
      const id = session.sessionId;
      const now = session.runStatus ?? "idle";
      next[id] = now;
      const before = previous[id];
      if (before === undefined || id === sessionId || now === before) continue;
      const name = sessionDisplayNames[id]?.alias || t("A conversation");
      if (before === "running" && now === "idle") {
        raised[id] = "done";
        notifyBackground(t("Work finished"), t("{name} finished its turn.", { name }));
      } else if (now === "failed") {
        raised[id] = "failed";
        notifyBackground(t("Work stopped"), t("{name} ran into an error.", { name }));
      } else if (now === "awaiting-approval") {
        raised[id] = "approval";
        notifyBackground(t("Waiting for you"), t("{name} needs your approval.", { name }));
      }
    }
    sessionRunStatusRef.current = next;
    if (Object.keys(raised).length > 0) {
      setSessionAlerts((prev) => ({ ...prev, ...raised }));
    }
  }, [sessions, sessionId, sessionDisplayNames]);

  // Opening a conversation is reading it.
  useEffect(() => {
    if (!sessionId) return;
    setSessionAlerts((prev) => {
      if (!(sessionId in prev)) return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }, [sessionId]);

  const forkCurrentSession = useCallback(
    (purpose: "fork" | "side" | "helper" | "ab-arm", seedPrompt?: string) => {
      if (!sessionId || isRunning) return;
      const related = purpose === "side" || purpose === "helper";
      const message: ClientMessage = related
        ? { type: "create_related_session", payload: { purpose } }
        : { type: "fork_session", payload: { purpose } };
      // The child asks the question the user already typed, instead of opening
      // with "what can I help with?".
      pendingChildSeedRef.current = seedPrompt?.trim()
        ? { text: seedPrompt.trim(), autoSend: true }
        : null;
      if (sendMessage(message)) {
        setIsRunning(true);
        setConnStatus("running");
        setConnLabel(related ? t("Creating...") : t("Forking..."));
        setToolStatus(
          purpose === "helper"
            ? t("Starting a fresh helper…")
            : related
              ? t("Starting a related conversation…")
              : t("Branching conversation…"),
        );
      }
    },
    [isRunning, sendMessage, sessionId],
  );

  // Duplicate straight from the session list — no need to open the source first.
  // The server attaches to the copy, so the view follows it.
  const duplicateSession = useCallback(
    (targetSessionId: string) => {
      if (sendMessage({
        type: "fork_session",
        payload: { purpose: "fork", sourceSessionId: targetSessionId },
      })) {
        setIsRunning(true);
        setConnStatus("running");
        setConnLabel(t("Duplicating..."));
        setToolStatus(t("Making a copy of this conversation…"));
      }
    },
    [sendMessage],
  );

  const clearChildSeed = useCallback(() => setChildSeed(null), []);

  const promoteRelatedSession = useCallback(
    async (targetSessionId: string) => {
      await promoteRelatedSessionRequest(targetSessionId);
      await refreshSessions();
      setActiveRelatedSessionId(null);
      openCatalogSession(targetSessionId);
    },
    [openCatalogSession, refreshSessions],
  );

  const renameSelectedSession = useCallback(async (targetId: string, name: string) => {
    const alias = normalizeSessionAlias(name);
    try {
      await saveSessionAlias(targetId, alias);
      setSessionDisplayNames((prev) => ({
        ...prev,
        [targetId]: { ...(prev[targetId] ?? { snippet: "" }), alias },
      }));
      setToolStatus("");
      return true;
    } catch (err) {
      setToolStatus(
        `Rename failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }, []);

  const performDeleteSelectedSession = useCallback(async (targetId: string) => {
    try {
      await deleteSessionRequest(targetId);
      if (sessionId === targetId) {
        reconnectSessionIdRef.current = null;
        queuedPromptsRef.current = [];
        setQueuedPrompts([]);
        setMessages([]);
        clearStagedWorkspace();
        sendMessage({ type: "new_session" });
      }
        if (selectedCatalogSessionId === targetId) {
      setSelectedCatalogSessionId(null);
      setSelectedSessionDetail(null);
        }
      await refreshSessions();
    } catch (err) {
      setToolStatus(
        `Delete failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, [
    clearStagedWorkspace,
    refreshSessions,
      selectedCatalogSessionId,
    sendMessage,
    sessionId,
  ],);

  const deleteSelectedSession = useCallback((sessionId?: string) => {
    const targetId = sessionId ?? selectedSessionDetail?.session?.sessionId;
    if (!targetId) return;
    void performDeleteSelectedSession(targetId);
  }, [performDeleteSelectedSession, selectedSessionDetail],);

  const replaceQueuedPrompts = useCallback(
    (update: (current: QueuedPrompt[]) => QueuedPrompt[]) => {
      setQueuedPrompts((current) => {
        const next = update(current);
        queuedPromptsRef.current = next;
        return next;
      });
    },
    [],
  );

  const startPrompt = useCallback(
    (text: string, attachmentPaths: string[]) => {
      const outgoing = buildOutgoingPrompt(text.trim(), attachmentPaths);
      if (!outgoing) return false;
      const attachments = attachmentPaths.length ? attachmentPaths : undefined;
      if (!sendMessage({ type: "prompt", payload: outgoing, attachments })) {
        return false;
      }
      setMessages((prev) => [
        ...prev,
        { role: "user", text: outgoing, timestamp: null },
      ]);
      setStreamParts([]);
      setWsError(null);
      setRunHint("");
      setCanRetryFailed(false);
      setToolStatus("");
      setRunPhaseLabel(t("Connecting…"));
      setIsRunning(true);
      setConnStatus("running");
      setConnLabel(t("Thinking…"));
      return true;
    },
    [sendMessage],
  );
  startPromptRef.current = startPrompt;

  const flushQueuedPrompt = useCallback((onlyId?: string) => {
    const allQueued = queuedPromptsRef.current;
    const queued = onlyId
      ? allQueued.filter((item) => item.id === onlyId)
      : allQueued;
    const merged = mergeQueuedPrompts(queued);
    replaceQueuedPrompts((current) =>
      onlyId ? current.filter((item) => item.id !== onlyId) : [],
    );
    if (!merged) return;
    if (!startPromptRef.current(merged.text, merged.attachments)) {
      replaceQueuedPrompts((current) => [...queued, ...current]);
    }
  }, [replaceQueuedPrompts]);
  flushQueuedPromptRef.current = flushQueuedPrompt;

  const restoreQueuedPrompt = useCallback((id: string) => {
    const queued = queuedPromptsRef.current.find((item) => item.id === id);
    if (!queued) return null;
    replaceQueuedPrompts((current) =>
      current.filter((item) => item.id !== id),
    );
    setStagedWorkspacePaths((current) => [
      ...new Set([...current, ...queued.attachments]),
    ]);
    return queued.text;
  }, [replaceQueuedPrompts]);

  const deleteQueuedPrompt = useCallback(
    (id: string) => {
      replaceQueuedPrompts((current) =>
        current.filter((item) => item.id !== id),
      );
    },
    [replaceQueuedPrompts],
  );

  // --- Situational preset buttons (v1.4 round 1 experiment) ---
  // ponytail: config in localStorage, active state in memory only — promote
  // both to app settings / session records if the experiment graduates.
  const [presetButtons, setPresetButtonsState] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem("alt-preset-buttons") ?? "null",
      );
      return Array.isArray(stored) && stored.length
        ? stored.slice(0, 5)
        : DEFAULT_PRESET_BUTTONS;
    } catch {
      return DEFAULT_PRESET_BUTTONS;
    }
  });
  const setPresetButtons = useCallback((names: string[]) => {
    const next = names.slice(0, 5);
    setPresetButtonsState(next);
    try {
      window.localStorage.setItem("alt-preset-buttons", JSON.stringify(next));
    } catch {
      /* private mode */
    }
  }, []);
  const [presetState, setPresetState] = useState<
    AppContextValue["presetState"]
  >(null);
  const pendingPresetReleaseRef = useRef<{
    ordinal: number;
    name: string;
  } | null>(null);
  const notePresetTurn = useCallback(() => {
    setPresetState((current) => {
      if (!current || current.locked) return current;
      const turnsLeft = current.turnsLeft - 1;
      return turnsLeft <= 0 ? null : { ...current, turnsLeft };
    });
  }, []);

  const sendPrompt = useCallback(
    (text: string) => {
      let trimmed = text.trim();
      const release = pendingPresetReleaseRef.current;
      if (release && trimmed) {
        // flomo design: unlock is announced on the user's next turn, not as
        // a turn of its own.
        trimmed = `Preset command #${release.ordinal} (${release.name}) is released; stop applying it.\n\n${trimmed}`;
        pendingPresetReleaseRef.current = null;
      }
      const attachments = [...stagedWorkspacePaths];
      if (!trimmed && attachments.length === 0) return false;
      if (isRunning) {
        replaceQueuedPrompts((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            text: trimmed,
            attachments,
          },
        ]);
        clearStagedWorkspace();
        notePresetTurn();
        return true;
      }
      if (!startPrompt(trimmed, attachments)) return false;
      clearStagedWorkspace();
      notePresetTurn();
      return true;
    },
    [
      clearStagedWorkspace,
      isRunning,
      notePresetTurn,
      replaceQueuedPrompts,
      stagedWorkspacePaths,
      startPrompt,
    ],
  );

  const abortRun = useCallback(() => {
    sendQueueAfterInterruptRef.current = null;
    if (sendMessage({ type: "abort" })) {
      setToolStatus("");
      setRunPhaseLabel(t("Stopping…"));
      setRunHint(t("You can edit or delete your latest message."));
    }
  }, [sendMessage]);

  const interruptAndSendQueuedPrompt = useCallback((id: string) => {
    if (!queuedPromptsRef.current.some((item) => item.id === id)) return;
    sendQueueAfterInterruptRef.current = id;
    if (sendMessage({ type: "abort" })) {
      setToolStatus("");
      setRunPhaseLabel(t("Stopping…"));
    } else {
      sendQueueAfterInterruptRef.current = null;
    }
  }, [sendMessage]);

  const invokeSkillRef = useRef<
    ((skillName: string, userText?: string) => boolean) | null
  >(null);
  const pressPreset = useCallback(
    (name: string) => {
      if (!sessionId || isRunning) return;
      const ordinal = presetButtons.indexOf(name) + 1;
      if (ordinal === 0) return;
      const active =
        presetState &&
        presetState.sessionId === sessionId &&
        presetState.name === name
          ? presetState
          : null;
      if (!active) {
        const wrapper = `[IMPORTANT] The user pressed preset command #${ordinal} (${name}) — a manual trigger that signals what they expect right now. It normally applies for the next 3-5 turns. Fit its requirements into the current situation rather than restarting from scratch; only set it aside where it truly contradicts the immediate need, and say so if you do.`;
        if (invokeSkillRef.current?.(name, wrapper)) {
          pendingPresetReleaseRef.current = null;
          setPresetState({
            sessionId,
            name,
            ordinal,
            turnsLeft: PRESET_TURNS,
            locked: false,
          });
        }
        return;
      }
      if (!active.locked) {
        if (
          sendPrompt(
            `[IMPORTANT] The user locked preset command #${ordinal} (${name}): it now applies to every turn until you are told it is released.`,
          )
        ) {
          setPresetState({ ...active, locked: true });
        }
        return;
      }
      pendingPresetReleaseRef.current = { ordinal, name };
      setPresetState(null);
    },
    [sessionId, isRunning, presetButtons, presetState, sendPrompt],
  );

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
          text: userText?.trim() || t("Invoke {skillName}", { skillName }),
          timestamp: null,
        },
      ]);
      setIsRunning(true);
      setConnStatus("running");
      setConnLabel(t("Thinking…"));
      setToolStatus("");
      setRunPhaseLabel(t("Connecting…"));
      return true;
    },
    [isRunning, sendMessage],
  );
  invokeSkillRef.current = invokeSkill;

  const branchRevision = useCallback(
    (text: string, entryId?: string) => {
      const trimmed = text.trim();
      if (!trimmed || isRunning || !sessionId) return false;
      if (
        !sendMessage({
          type: "branch_revision",
          payload: entryId
            ? { text: trimmed, entryId }
            : { text: trimmed },
        })
      )
        return false;
      // This conversation keeps running its own life — the branch opens in
      // the right Related panel on `branch_created`.
      setCanRetryFailed(false);
      setComposerNoticeTimed({
        text: entryId
          ? t("Same question, fresh answer. What repeats is probably solid; what changes was a choice.")
          : t("Both takes are kept — the branch is in Related conversations on the right."),
      });
      return true;
    },
    [isRunning, sendMessage, sessionId, setComposerNoticeTimed],
  );

  const prepareBranchRevision = useCallback(
    (text: string, entryId: string) => {
      const trimmed = text.trim();
      if (!trimmed || !entryId || isRunning || !sessionId) return false;
      pendingChildSeedRef.current = { text: trimmed, autoSend: false };
      if (!sendMessage({ type: "prepare_branch_revision", payload: { entryId } })) {
        pendingChildSeedRef.current = null;
        return false;
      }
      setIsRunning(true);
      setConnStatus("running");
      setConnLabel(t("Branching..."));
      setToolStatus(t("Preparing comparison…"));
      return true;
    },
    [isRunning, sendMessage, sessionId],
  );

  const retryLatest = useCallback(() => {
    if (isRunning || !sessionId || !sendMessage({ type: "retry_latest" })) {
      return false;
    }
    setCanRetryFailed(false);
    setIsRunning(true);
    setConnStatus("running");
    setConnLabel(t("Retrying…"));
    setToolStatus("");
    setRunPhaseLabel(t("Connecting…"));
    return true;
  }, [isRunning, sendMessage, sessionId]);

  const deleteLatest = useCallback(() => {
    if (!sendMessage({ type: "delete_latest" })) return;
    setToolStatus(t("Deleting latest turn..."));
    setRunHint("");
  }, [sendMessage]);


  const setDraftWorkspace = useCallback(
    (primaryDir: string | null) => {
      if (sendMessage({ type: "set_draft_workspace", payload: { primaryDir } })) {
        // Sticky choice for the NEXT conversation; server echoes only in
        // draft state, so track it optimistically here.
        setWorkspacePrimaryDir(primaryDir);
      }
    },
    [sendMessage],
  );

  const addKnownWorkspace = useCallback(async (path: string) => {
    const result = await addWorkspaceRequest(path);
    setKnownWorkspaces(result.workspaces);
  }, []);

  const removeKnownWorkspace = useCallback(async (path: string) => {
    const result = await removeWorkspaceRequest(path);
    setKnownWorkspaces(result.workspaces);
  }, []);

  const repointSession = useCallback(
    async (targetSessionId: string, primaryDir: string | null) => {
      await setSessionWorkspaceRequest(targetSessionId, primaryDir);
      // The server reopened the session against the new folder; the attached
      // conversation's local state must follow or the file tree and folder
      // indicator keep showing the old workspace until a manual reopen.
      if (targetSessionId === sessionId) {
        setWorkspacePrimaryDir(primaryDir);
      }
      void refreshSessions();
    },
    [refreshSessions, sessionId],
  );

  useEffect(() => {
    if (appMode !== "local") return;
    listWorkspaces()
      .then((result) => setKnownWorkspaces(result.workspaces))
      .catch(() => {
        /* hosted or endpoint unavailable */
      });
  }, [appMode]);

  const switchProject = useCallback(
    (projectId: string | null) => {
      if (sendMessage({ type: "switch_project", payload: { projectId } })) {
        setSelectors((prev) => ({ ...prev, projectId }));
        if (sessionId) void refreshSessions();
      }
    },
    [refreshSessions, sendMessage, sessionId],
  );

  const switchKb = useCallback(
    (domain: string) => {
      if (!domain) return;
      if (sendMessage({ type: "switch_kb", payload: { domain } })) {
        setSelectors((prev) => ({ ...prev, currentDomain: domain }));
      }
    },
    [sendMessage],
  );

  const switchSoul = useCallback(
    (soulSlug: string | null) => {
      if (
        requestAssetSwitch(
          { type: "switch_soul", payload: { soulSlug } },
          "Switching soul...",
        )
      ) {
        setSelectors((prev) => ({ ...prev, soulSlug }));
      }
    },
    [requestAssetSwitch],
  );

  const switchRolePreset = useCallback(
    (rolePresetSlug: string | null) => {
      if (
        requestAssetSwitch(
          { type: "switch_role_preset", payload: { rolePresetSlug } },
          "Switching role preset...",
        )
      ) {
        setSelectors((prev) => ({ ...prev, rolePresetSlug }));
      }
    },
    [requestAssetSwitch],
  );

  const switchInstruction = useCallback(
    (customInstructionRef: string | null) => {
      if (
        requestAssetSwitch(
          { type: "switch_instruction", payload: { customInstructionRef } },
          "Switching instruction...",
        )
      ) {
        setSelectors((prev) => ({ ...prev, customInstructionRef }));
      }
    },
    [requestAssetSwitch],
  );

  const switchVisibility = useCallback(
    (visibility: SessionVisibility) => {
      if (
        sendMessage({ type: "switch_visibility", payload: { visibility } })
      ) {
        setSelectors((prev) => ({ ...prev, visibility }));
        // Hosted "private" is the one value that really deletes — say so, and
        // say when. Local markers change nothing about what is kept.
        if (visibility === "private") {
          setComposerNoticeTimed({
            prefix: "⏏",
            text: t("Private conversations and their files are deleted 7 days after you last use them. Download anything you want to keep."),
          });
        } else if (visibility === "no-export") {
          setComposerNoticeTimed({
            prefix: "🔖",
            text: t("Marked as not for export. Nothing is deleted or sent anywhere — this only affects what a future export includes."),
          });
        }
      }
    },
    [sendMessage, setComposerNoticeTimed],
  );

  const switchMode = useCallback(
    (mode: AltMode) => {
      if (sendMessage({ type: "switch_mode", payload: { mode } })) {
        setSessionMode(mode);
      }
    },
    [sendMessage],
  );

  const setSessionModel = useCallback(
    (override: SessionModelOverride | null) => {
      if (sendMessage({ type: "set_session_model", payload: { override } })) {
        setModelOverride(override);
      }
    },
    [sendMessage],
  );

  const setStudyTag = useCallback(
    (tag: StudyTag | null) => {
      if (sendMessage({ type: "set_study_tag", payload: { studyTag: tag } })) {
        setStudyTagState(tag);
        if (sessionId) void refreshSessions();
      }
    },
    [refreshSessions, sendMessage, sessionId],
  );

  const respondApproval = useCallback(
    (
      approvalId: string,
      response: { accept?: boolean; choice?: string | null; text?: string | null; },
    ) => {
      sendMessage({ type: "respond_approval", payload: { approvalId, ...response }, });
      setApprovals((prev) => prev.filter((entry) => entry.approvalId !== approvalId),);
    },
    [sendMessage],
  );

  const addApprovalMarker = useCallback((text: string) => {
    setApprovalMarkers((prev) =>prev.includes(text) ? prev : [...prev, text],);
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
      runtimeMode,
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
      refreshDiscovery,
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
      duplicateSession,
      sessionAlerts,
      activeRelatedSessionId,
      relatedPaneSize,
      setActiveRelatedSessionId,
      childSeed,
      clearChildSeed,
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
      presetButtons,
      setPresetButtons,
      presetState,
      pressPreset,
      sessionMode,
      workspacePrimaryDir,
      knownWorkspaces,
      setDraftWorkspace,
      addKnownWorkspace,
      removeKnownWorkspace,
      repointSession,
      switchMode,
      modelOverride,
      currentSessionModel,
      setSessionModel,
      studyTag,
      retentionDueAt,
      setStudyTag,
      messages,
      streamParts,
      toolStatus,
      runPhaseLabel,
      composerNotice,
      runHint,
      canRetryFailed,
      stagedWorkspacePaths,
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
      compactCurrentSession,
      sendPrompt,
      queuedPrompts,
      restoreQueuedPrompt,
      deleteQueuedPrompt,
      sendQueuedPromptNow: flushQueuedPrompt,
      interruptAndSendQueuedPrompt,
      abortRun,
      invokeSkill,
      branchRevision,
      prepareBranchRevision,
      retryLatest,
      deleteLatest,
      requestMetadata,
      requestMetrics,
    }),
    [
      auth,
      appMode,
      runtimeMode,
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
      refreshDiscovery,
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
      duplicateSession,
      sessionAlerts,
      activeRelatedSessionId,
      relatedPaneSize,
      setActiveRelatedSessionId,
      childSeed,
      clearChildSeed,
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
      presetButtons,
      setPresetButtons,
      presetState,
      pressPreset,
      sessionMode,
      workspacePrimaryDir,
      knownWorkspaces,
      setDraftWorkspace,
      addKnownWorkspace,
      removeKnownWorkspace,
      repointSession,
      switchMode,
      modelOverride,
      currentSessionModel,
      setSessionModel,
      studyTag,
      retentionDueAt,
      setStudyTag,
      messages,
      streamParts,
      toolStatus,
      runPhaseLabel,
      composerNotice,
      runHint,
      canRetryFailed,
      stagedWorkspacePaths,
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
      compactCurrentSession,
      sendPrompt,
      queuedPrompts,
      restoreQueuedPrompt,
      deleteQueuedPrompt,
      flushQueuedPrompt,
      interruptAndSendQueuedPrompt,
      abortRun,
      invokeSkill,
      branchRevision,
      prepareBranchRevision,
      retryLatest,
      deleteLatest,
      requestMetadata,
      requestMetrics,
    ],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={Boolean(confirmRequest)}
        message={confirmRequest?.message ?? ""}
        details={confirmRequest?.details}
        confirmLabel={confirmRequest?.confirmLabel}
        cancelLabel={confirmRequest?.cancelLabel}
        checkbox={confirmRequest?.checkbox}
        onConfirm={(result) => {
          confirmRequest?.onConfirm(result);
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
