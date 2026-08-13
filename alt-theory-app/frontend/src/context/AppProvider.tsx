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
import { t } from "@/i18n";
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
  TurnRecovery,
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
import { useConversationEngine } from "@/hooks/useConversationEngine";
import { usePromptQueue, type QueuedPrompt } from "@/hooks/usePromptQueue";
import type { ConnStatus } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DEFAULT_KB_DOMAIN } from "@/lib/constants";
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

export type { QueuedPrompt } from "@/hooks/usePromptQueue";

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

  discovery: DiscoveryLists | null;
  /** Re-fetch role/KB/skill lists after the user adds assets in Settings. */
  refreshDiscovery: () => Promise<void>;
  /** Local-mode model config status; carries the active default model. */
  localConfig: ConfigStatus | null;
  /** Re-fetch local provider/default status after Settings changes. */
  refreshLocalConfig: () => Promise<void>;

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
  openHelper: (question?: string, attachToCenter?: boolean) => void;
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
  toolStatus: string;
  /** Live run-phase label (e.g. "Thinking…") shown while no tool is active. */
  runPhaseLabel: string;
  composerNotice: ComposerNotice | null;
  runHint: string | null;
  recovery: TurnRecovery | null;

  stagedWorkspacePaths: string[];
  toggleWorkspaceStage: (path: string, staged: boolean) => void;
  stageWorkspacePath: (path: string) => void;
  unstageWorkspacePaths: (paths: string[]) => void;

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
  continueLatest: () => boolean;
  invokeSkill: (skillName: string, userText?: string) => boolean;
  branchRevision: (text: string, entryId?: string) => boolean;
  reviseLatestInPlace: (text: string, entryId: string) => boolean;
  prepareBranchRevision: (text: string, entryId: string) => boolean;
  retryLatest: () => boolean;
  deleteLatest: () => void;
  requestMetadata: () => void;
  requestMetrics: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

/**
 * The in-flight assistant turn, alone in its own context: a streaming delta
 * replaces this value on every token, and nothing else. Keeping it out of
 * AppContext means the token tick invalidates only the component drawing the
 * stream, not every useApp() consumer (perf backlog item 3).
 */
const StreamContext = createContext<StreamPart[]>([]);

/** Situational preset buttons (v1.4 round 1): turns a press stays active. */
export const PRESET_TURNS = 5;
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
  const pendingHelperSeedRef = useRef<string | null>(null);
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
  const startPromptRef = useRef<
    (text: string, attachments: string[]) => boolean
  >(() => false);
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

  const [toolStatus, setToolStatus] = useState("");
  const [composerNotice, setComposerNotice] = useState<ComposerNotice | null>(
    null,
  );
  const [runHint, setRunHint] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<TurnRecovery | null>(null);
  const [stagedWorkspacePaths, setStagedWorkspacePaths] = useState<string[]>([],);
  const [runCompletedCount, setRunCompletedCount] = useState(0);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(
    null,
  );
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
  const composerNoticeTimerRef = useRef<number | null>(null);
  const hydratedNamesRef = useRef<Set<string>>(new Set());
  const sessionListRequestRef = useRef(0);
  const sessionDetailRequestRef = useRef(0);

  // The ONE prompt queue (shared with the right pane): Enter-while-running
  // queues; run end merges and flushes after the transcript refresh.
  const promptQueue = usePromptQueue(startPromptRef);
  const { queuedPrompts, queuedPromptsRef } = promptQueue;

  // The ONE center engine (v1.4.3): messages / stream / running plus the
  // connection-wide approval registry and server-message transitions live in the shared hook
  // (also used by the right-pane ChildConversation). Only center-specific
  // behavior stays here, via the callbacks below.
  const engine = useConversationEngine({
    onTranscript: (transcript) => {
      if (
        pendingCompactRef.current &&
        transcript.some((item) => item.marker === "compaction")
      ) {
        pendingCompactRef.current = false;
        setComposerNoticeTimed({ text: t("Conversation compacted.") });
      }
    },
    onStepBoundary: () => {
      promptQueue.flushIntoRun((text, attachments) => {
        const outgoing = buildOutgoingPrompt(text, attachments);
        return outgoing ? sendMessage({ type: "prompt", payload: outgoing }) : false;
      });
    },
    onRunCompleted: (payload) => {
      setRecovery(null);
      setCurrentSessionModel(payload.currentModel ?? null);
      setConnStatus("idle");
      setConnLabel("Ready");
      setToolStatus("");
      setRunHint("");
      setRunCompletedCount((count) => count + 1);
      // Keep the composer's context ring honest without polling.
      sendMessage({ type: "get_session_metrics" });
      if (payload.sessionId) {
        reconnectSessionIdRef.current = payload.sessionId;
        void refreshSessions();
        promptQueue.handleRunCompleted(refreshCurrentTranscript(payload.sessionId));
      } else {
        promptQueue.handleRunCompleted(Promise.resolve());
      }
    },
    onRunFailed: (payload) => {
      // Same ordering as run_completed: the refresh must land before the
      // queued prompt's optimistic bubble is appended, or it disappears.
      const queueInterrupted = promptQueue.handleRunFailed(
        payload.error,
        sessionId ? refreshCurrentTranscript(sessionId) : Promise.resolve(),
      );
      const interrupted =
        payload.recovery?.outcome === "interrupted" || queueInterrupted;
      setRecovery(payload.recovery ?? null);
      setToolStatus("");
      setConnStatus(interrupted ? "idle" : "error");
      setConnLabel(interrupted ? t("Ready") : t("Error"));
      const userStopped = payload.recovery?.interruptionCause === "user_abort";
      if (userStopped) {
        setComposerNotice(null);
        setRunHint(t("Editing after Stop won't branch. Use /branch if needed."));
      } else {
        setComposerNoticeTimed({
          prefix: interrupted ? undefined : "⚠",
          text: `${interrupted ? t("Run interrupted: ") : t("Run failed: ")}${payload.error}`,
          warn: !interrupted,
        });
        if (!interrupted) setRunHint("");
      }
    },
  });
  const {
    messages,
    setMessages,
    streamParts,
    setStreamParts,
    running: isRunning,
    setRunning: setIsRunning,
    phaseLabel: runPhaseLabel,
    setPhaseLabel: setRunPhaseLabel,
    approvals,
    setApprovals,
    activeToolsRef: activeToolsMapRef,
  } = engine;

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
  }, []);

  const refreshLocalConfig = useCallback(async () => {
    const me = await fetchAuthMe();
    setLocalConfig(me.localConfig ?? null);
  }, []);

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
      // Stream/transcript/run messages and the connection-wide approval registry
      // are the shared engine's; center extras run via its callbacks.
      if (engine.handleMessage(message)) return;
      switch (message.type) {
        case "session_draft":
          setRecovery(null);
          if (reconnectSessionIdRef.current) {
            // Even when the draft message is ignored (reconnect race), a
            // pending asset switch was answered by THIS message — leaving its
            // "Switching role preset…" status would strand the composer in a
            // fake busy state with nothing left to clear it. Only while NOT
            // attached: draft selectors must never overwrite a live
            // session's chips (opus H1).
            if (pendingAssetSwitchRef.current && !sessionId) {
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
          setRecovery(message.payload.recovery ?? null);
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
          setRunHint(
            message.payload.recovery?.interruptionCause === "user_abort"
              ? t("Editing after Stop won't branch. Use /branch if needed.")
              : "",
          );
          clearStagedWorkspace();
          void refreshSessions();
          if (selectedCatalogSessionId === message.payload.sessionId) {
            void refreshSessionDetail(message.payload.sessionId);
          }
          if (pendingHelperSeedRef.current) {
            const seed = pendingHelperSeedRef.current;
            pendingHelperSeedRef.current = null;
            window.setTimeout(() => startPromptRef.current(seed, []), 0);
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
            void refreshSessions();
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
          if (pendingHelperSeedRef.current) {
            setChildSeed({
              sessionId: message.payload.sessionId,
              text: pendingHelperSeedRef.current,
              autoSend: true,
            });
            pendingHelperSeedRef.current = null;
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

        case "extension_notice":
          setComposerNoticeTimed({
            prefix: message.payload.level === "info" ? undefined : "⚠",
            text: message.payload.message,
            warn: message.payload.level !== "info",
          });
          break;

        case "error": {
          pendingHelperSeedRef.current = null;
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
      engine.handleMessage,
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
    promptQueue.clear();
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
      promptQueue.clear();
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

  const openHelper = useCallback(
    (question?: string, attachToCenter = true) => {
      const seed = question?.trim() || null;
      pendingHelperSeedRef.current = seed;
      const current = sessions.find((item) => item.sessionId === sessionId);
      const currentIsHelper =
        current?.helper || current?.forkedFrom?.purpose === "helper";
      const parentSessionId =
        attachToCenter && sessionId && !currentIsHelper ? sessionId : undefined;
      if (
        !sendMessage({
          type: "create_helper_session",
          payload: parentSessionId ? { parentSessionId } : {},
        })
      ) {
        pendingHelperSeedRef.current = null;
      }
    },
    [sendMessage, sessionId, sessions],
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
        promptQueue.clear();
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
      setRecovery(null);
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

  const restoreQueuedPrompt = useCallback((id: string) => {
    const queued = promptQueue.restore(id);
    if (!queued) return null;
    setStagedWorkspacePaths((current) => [
      ...new Set([...current, ...queued.attachments]),
    ]);
    return queued.text;
  }, [promptQueue]);

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
  // Stage semantics (owner 2026-08-04): press/lock/release NEVER spend a
  // turn of their own — announcements ride the user's next message, and the
  // press rides it as the actual /skill: invoke. Keyed by session so an
  // armed preset never leaks into another conversation (opus B2).
  const pendingPresetRef = useRef<{
    sessionId: string | null;
    invoke: string | null;
    texts: string[];
  }>({ sessionId: null, invoke: null, texts: [] });
  const notePresetTurn = useCallback(
    (forSessionId: string | null) => {
      setPresetState((current) => {
        if (!current || current.locked) return current;
        if (!forSessionId || current.sessionId !== forSessionId) return current;
        const turnsLeft = current.turnsLeft - 1;
        return turnsLeft <= 0 ? null : { ...current, turnsLeft };
      });
    },
    [],
  );

  const sendPrompt = useCallback(
    (text: string) => {
      // A pending preset applies only to the conversation it was armed in
      // (opus B2); a leftover from another conversation is dropped.
      const pending =
        pendingPresetRef.current.sessionId === sessionId
          ? pendingPresetRef.current
          : null;
      let trimmed = text.trim();
      const attachments = [...stagedWorkspacePaths];
      if (!trimmed && attachments.length === 0) return false;
      // Merge AFTER the empty-guard, and also for attachment-only sends
      // (opus B4: the announcement must never be silently discarded while
      // the button still claims to be active).
      if (pending?.texts.length) {
        trimmed = [...pending.texts, trimmed].filter(Boolean).join("\n\n");
      }
      const consumePending = () => {
        if (!pending) return;
        pending.sessionId = null;
        pending.invoke = null;
        pending.texts = [];
      };
      // Queue while running OR while a queue exists (opus G1: the delayed
      // post-run flush would otherwise race a fresh send and invert order).
      if (isRunning || queuedPromptsRef.current.length > 0) {
        // ponytail: a queued message can't ride the /skill: invoke path, so
        // an armed press degrades to the wrapper text (which names the
        // skill); the skill body loads on a later idle press if it matters.
        promptQueue.enqueue(trimmed, attachments);
        consumePending();
        clearStagedWorkspace();
        notePresetTurn(sessionId);
        return true;
      }
      if (pending?.invoke && attachments.length === 0) {
        if (!invokeSkillRef.current?.(pending.invoke, trimmed)) return false;
        consumePending();
        clearStagedWorkspace();
        notePresetTurn(sessionId);
        return true;
      }
      // ponytail: with attachments the wrapper text rides along but the
      // /skill: invoke is skipped (invoke_skill carries no attachments) —
      // the wrapper names the skill, same degrade as the queue path.
      if (!startPrompt(trimmed, attachments)) return false;
      consumePending();
      clearStagedWorkspace();
      notePresetTurn(sessionId);
      return true;
    },
    [
      clearStagedWorkspace,
      isRunning,
      notePresetTurn,
      promptQueue,
      sessionId,
      stagedWorkspacePaths,
      startPrompt,
    ],
  );

  const abortRun = useCallback(() => {
    promptQueue.cancelPendingInterrupt();
    if (sendMessage({ type: "abort" })) {
      setToolStatus("");
      setRunPhaseLabel(t("Stopping…"));
      setRunHint("");
    }
  }, [promptQueue, sendMessage]);

  const interruptAndSendQueuedPrompt = useCallback((id: string) => {
    promptQueue.interruptAndSend(id, () => {
      if (!sendMessage({ type: "abort" })) return false;
      setToolStatus("");
      setRunPhaseLabel(t("Stopping…"));
      return true;
    });
  }, [promptQueue, sendMessage]);

  const invokeSkillRef = useRef<
    ((skillName: string, userText?: string) => boolean) | null
  >(null);
  const pressPreset = useCallback(
    (name: string) => {
      if (!sessionId) return;
      const ordinal = presetButtons.indexOf(name) + 1;
      if (ordinal === 0) return;
      const active =
        presetState &&
        presetState.sessionId === sessionId &&
        presetState.name === name
          ? presetState
          : null;
      const pending = pendingPresetRef.current;
      // Leftover pending state from another conversation is dead weight.
      if (pending.sessionId !== sessionId) {
        pending.sessionId = sessionId;
        pending.invoke = null;
        pending.texts = [];
      }
      if (!active) {
        // Switching from a different, already-announced preset: release it
        // in the same ride-along.
        const prior =
          presetState && presetState.sessionId === sessionId
            ? presetState
            : null;
        const priorAnnounced = prior && pending.invoke !== prior.name;
        pending.invoke = name;
        pending.texts = priorAnnounced
          ? [
              `Preset command #${prior.ordinal} (${prior.name}) is released; stop applying it.`,
            ]
          : [];
        pending.texts.push(
          `[IMPORTANT] The user pressed preset command #${ordinal} (${name}) — a manual trigger that signals what they expect right now. It normally applies for the next 3-5 turns. Fit its requirements into the current situation rather than restarting from scratch; only set it aside where it truly contradicts the immediate need, and say so if you do.`,
        );
        setPresetState({
          sessionId,
          name,
          ordinal,
          turnsLeft: PRESET_TURNS,
          locked: false,
        });
        return;
      }
      if (!active.locked) {
        pending.texts.push(
          `[IMPORTANT] The user locked preset command #${ordinal} (${name}): it now applies to every turn until you are told it is released.`,
        );
        setPresetState({ ...active, locked: true });
        return;
      }
      // Unlock. Nothing announced yet (armed + locked without a message in
      // between) → just clear; otherwise the release rides the next message.
      if (pending.invoke === name) {
        pending.sessionId = null;
        pending.invoke = null;
        pending.texts = [];
      } else {
        pending.texts.push(
          `Preset command #${ordinal} (${name}) is released; stop applying it.`,
        );
      }
      setPresetState(null);
    },
    [sessionId, presetButtons, presetState],
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
      setRecovery(null);
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
    setRecovery(null);
    setIsRunning(true);
    setConnStatus("running");
    setConnLabel(t("Retrying…"));
    setToolStatus("");
    setRunPhaseLabel(t("Connecting…"));
    return true;
  }, [isRunning, sendMessage, sessionId]);

  const continueLatest = useCallback(() => {
    if (isRunning || !sessionId || !sendMessage({ type: "continue_latest" })) {
      return false;
    }
    setRecovery(null);
    setRunHint("");
    setIsRunning(true);
    setConnStatus("running");
    setConnLabel(t("Continuing…"));
    setToolStatus("");
    setRunPhaseLabel(t("Connecting…"));
    return true;
  }, [isRunning, sendMessage, sessionId]);

  const reviseLatestInPlace = useCallback(
    (text: string, entryId: string) => {
      const trimmed = text.trim();
      if (
        !trimmed ||
        isRunning ||
        !sessionId ||
        !sendMessage({
          type: "revise_latest",
          payload: { text: trimmed, entryId },
        })
      ) {
        return false;
      }
      setRecovery(null);
      setRunHint("");
      setIsRunning(true);
      setConnStatus("running");
      setConnLabel(t("Retrying…"));
      setToolStatus("");
      setRunPhaseLabel(t("Connecting…"));
      return true;
    },
    [isRunning, sendMessage, sessionId],
  );

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
      discovery,
      refreshDiscovery,
      localConfig,
      refreshLocalConfig,
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
      openHelper,
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
      toolStatus,
      runPhaseLabel,
      composerNotice,
      runHint,
      recovery,
      stagedWorkspacePaths,
      toggleWorkspaceStage,
      stageWorkspacePath,
      unstageWorkspacePaths,
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
      deleteQueuedPrompt: promptQueue.remove,
      sendQueuedPromptNow: promptQueue.flush,
      interruptAndSendQueuedPrompt,
      abortRun,
      continueLatest,
      invokeSkill,
      branchRevision,
      reviseLatestInPlace,
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
      refreshLocalConfig,
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
      openHelper,
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
      toolStatus,
      runPhaseLabel,
      composerNotice,
      runHint,
      recovery,
      stagedWorkspacePaths,
      toggleWorkspaceStage,
      stageWorkspacePath,
      unstageWorkspacePaths,
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
      promptQueue,
      interruptAndSendQueuedPrompt,
      abortRun,
      continueLatest,
      invokeSkill,
      branchRevision,
      reviseLatestInPlace,
      prepareBranchRevision,
      retryLatest,
      deleteLatest,
      requestMetadata,
      requestMetrics,
    ],
  );

  return (
    <AppContext.Provider value={value}>
      <StreamContext.Provider value={streamParts}>
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
      </StreamContext.Provider>
    </AppContext.Provider>
  );
}

export function useStreamParts(): StreamPart[] {
  return useContext(StreamContext);
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within AppProvider");
  }
  return ctx;
}
