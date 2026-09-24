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
} from "@/api/auth";
import { fetchDiscovery } from "@/api/discovery";
import type { ProjectFolder } from "@/api/config";
import { getWorkingFolders } from "@/api/config";
import { fetchSessionList } from "@/api/sessions";
import type {
  AuthContext,
  DiscoveryLists,
  SessionSummary,
  TranscriptView,
  ViewMode,
  ParticipantInfo,
  ConfigStatus,
  RuntimeMode,
} from "@/api/types";
import {
  addWorkspace as addWorkspaceRequest,
  removeWorkspace as removeWorkspaceRequest,
  setProjectMainFolder as setProjectMainFolderRequest,
  setSessionWorkspace as setSessionWorkspaceRequest,
} from "@/api/workspaces";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { defaultTranscriptView, viewModeForRole } from "@/lib/viewMode";

const anonymousAuth: AuthContext = {
  accountId: null,
  role: "anonymous",
  displayLabel: null,
  defaultRoleCondition: null,
  defaultConsent: null,
};

/** Why a conversation in the list is asking for attention (alpha.3). */
export type SessionAlert = "done" | "failed" | "approval";

export interface ConfirmRequest {
  message: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (result?: { checkboxChecked: boolean }) => void;
  /** Optional opt-in checkbox (e.g. whole-folder migration, item 4). */
  checkbox?: { label: string; defaultChecked?: boolean; danger?: boolean };
}

/** A Steer press waiting to ride the next message of its conversation. */
export interface PendingPreset {
  invoke: string | null;
  texts: string[];
}

/**
 * App-level state only: who is signed in, what exists (assets, conversations,
 * folders), app dialogs, the view mode, and the Steer preset experiment.
 * A conversation's own state lives in its conversation module
 * (hooks/useConversation); what the main view shows lives in MainView.
 */
export interface AppContextValue {
  auth: AuthContext;
  appMode: "local" | "hosted";
  runtimeMode: RuntimeMode;
  loginRequired: boolean;
  /** The server refused for lack of a sign-in: show the login overlay. */
  requireLogin: () => void;
  loading: boolean;
  authError: string | null;
  login: (accountId: string, loginCode: string) => Promise<void>;

  viewMode: ViewMode;
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
  sessionDisplayNames: Record<string, { alias: string; snippet: string }>;
  setSessionDisplayName: (sessionId: string, alias: string) => void;
  sessionsLoading: boolean;
  sessionsError: string | null;
  refreshSessions: () => Promise<void>;
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

  /** Explicitly added working folders (may be empty of sessions). */
  knownWorkspaces: string[];
  /** Projects (v1.5.1): id, name, main folder, companions. */
  projects: ProjectFolder[];
  /** Global working folders (settings): readable by every conversation. */
  globalFolders: Array<{ path: string; writable: boolean }>;
  /** True once a working-folders fetch answered (even with an empty list). */
  workingFoldersLoaded: boolean;
  /** Fetch projects + the derived workspace list again. */
  refreshWorkingFolders: () => Promise<void>;
  addKnownWorkspace: (path: string) => Promise<void>;
  removeKnownWorkspace: (path: string) => Promise<void>;
  /** Re-point any existing session's working folder (drag & drop, M4). The
   *  open conversation hears its new folder in its snapshot. */
  repointSession: (sessionId: string, primaryDir: string | null) => Promise<void>;
  /** Change a project's main folder; every conversation of it moves. */
  repointProject: (projectId: string, primaryDir: string) => Promise<number>;

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
  pressPreset: (sessionId: string, name: string) => void;
  /** What an armed preset adds to the next message of this conversation. */
  pendingPreset: (sessionId: string | null) => PendingPreset | null;
  /** The next message carried the pending preset: consume it, spend a turn. */
  presetSent: (sessionId: string | null) => void;

  requestConfirm: (request: ConfirmRequest) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Situational preset buttons (v1.4 round 1): turns a press stays active. */
export const PRESET_TURNS = 5;
const DEFAULT_PRESET_BUTTONS = [
  "adaptive-aligning",
  "confirm-why",
  "guided-next-steps",
  "clear-misunderstanding",
];

export function AppProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthContext>(anonymousAuth);
  const [appMode, setAppMode] = useState<"local" | "hosted">("hosted");
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("alt-theory");
  const [loginRequired, setLoginRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryLists | null>(null);
  const [localConfig, setLocalConfig] = useState<ConfigStatus | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("user");
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
  const [sessionDisplayNames, setSessionDisplayNames] = useState<
    Record<string, { alias: string; snippet: string }>
  >({});
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [knownWorkspaces, setKnownWorkspaces] = useState<string[]>([]);
  const [projects, setProjects] = useState<ProjectFolder[]>([]);
  const [globalFolders, setGlobalFolders] = useState<
    Array<{ path: string; writable: boolean }>
  >([]);
  /** True once a working-folders fetch answered (even with an empty list). */
  const [workingFoldersLoaded, setWorkingFoldersLoaded] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(
    null,
  );
  const sessionListRequestRef = useRef(0);

  const requestConfirm = useCallback((request: ConfirmRequest) => {
    setConfirmRequest(request);
  }, []);

  const requireLogin = useCallback(() => setLoginRequired(true), []);

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

      setAuth(me.auth ?? anonymousAuth);
      setAppMode(mode);
      setRuntimeMode(me.app?.runtimeMode ?? "alt-theory");
      setLoginRequired(required);
      setViewMode(nextViewMode);
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

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => {
      const next: ViewMode = prev === "researcher" ? "user" : "researcher";
      setTranscriptView(defaultTranscriptView(next));
      return next;
    });
  }, []);

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
      setSessionDisplayNames(
        Object.fromEntries(
          list.map((session) => [
            session.sessionId,
            { alias: session.alias ?? "", snippet: session.snippet ?? "" },
          ]),
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

  const setSessionDisplayName = useCallback((sessionId: string, alias: string) => {
    setSessionDisplayNames((prev) => ({
      ...prev,
      [sessionId]: { ...(prev[sessionId] ?? { snippet: "" }), alias },
    }));
  }, []);

  useEffect(() => {
    if (!loading && !loginRequired) {
      void refreshSessions();
    }
  }, [loading, loginRequired, refreshSessions]);

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

  const refreshWorkingFolders = useCallback(async () => {
    try {
      const folders = await getWorkingFolders();
      setProjects(folders.projects);
      setKnownWorkspaces(folders.knownWorkspaces);
      setGlobalFolders(folders.global);
      setWorkingFoldersLoaded(true);
    } catch {
      /* hosted or endpoint unavailable */
    }
  }, []);

  const addKnownWorkspace = useCallback(
    async (path: string) => {
      await addWorkspaceRequest(path);
      await refreshWorkingFolders();
    },
    [refreshWorkingFolders],
  );

  const removeKnownWorkspace = useCallback(
    async (path: string) => {
      await removeWorkspaceRequest(path);
      await refreshWorkingFolders();
    },
    [refreshWorkingFolders],
  );

  const repointSession = useCallback(
    async (targetSessionId: string, primaryDir: string | null) => {
      await setSessionWorkspaceRequest(targetSessionId, primaryDir);
      void refreshSessions();
    },
    [refreshSessions],
  );

  /** Change a project's main folder (v1.5.1); returns how many conversations moved. */
  const repointProject = useCallback(
    async (projectId: string, primaryDir: string) => {
      const result = await setProjectMainFolderRequest(projectId, primaryDir);
      await refreshWorkingFolders();
      void refreshSessions();
      return result.movedCount;
    },
    [refreshSessions, refreshWorkingFolders],
  );

  useEffect(() => {
    if (appMode !== "local") return;
    void refreshWorkingFolders();
  }, [appMode, refreshWorkingFolders]);

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

  const pendingPreset = useCallback((sessionId: string | null) => {
    const pending = pendingPresetRef.current;
    return pending.sessionId === sessionId && (pending.invoke || pending.texts.length)
      ? { invoke: pending.invoke, texts: [...pending.texts] }
      : null;
  }, []);

  const presetSent = useCallback((forSessionId: string | null) => {
    const pending = pendingPresetRef.current;
    if (pending.sessionId === forSessionId) {
      pending.sessionId = null;
      pending.invoke = null;
      pending.texts = [];
    }
    setPresetState((current) => {
      if (!current || current.locked) return current;
      if (!forSessionId || current.sessionId !== forSessionId) return current;
      const turnsLeft = current.turnsLeft - 1;
      return turnsLeft <= 0 ? null : { ...current, turnsLeft };
    });
  }, []);

  const pressPreset = useCallback(
    (sessionId: string, name: string) => {
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
    [presetButtons, presetState],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      auth,
      appMode,
      runtimeMode,
      loginRequired,
      requireLogin,
      loading,
      authError,
      login,
      viewMode,
      toggleViewMode,
      participant,
      transcriptView,
      discovery,
      refreshDiscovery,
      localConfig,
      refreshLocalConfig,
      sessions,
      sessionDisplayNames,
      setSessionDisplayName,
      sessionsLoading,
      sessionsError,
      refreshSessions,
      activeRelatedSessionId,
      relatedPaneSize,
      setActiveRelatedSessionId,
      knownWorkspaces,
      projects,
      globalFolders,
      workingFoldersLoaded,
      refreshWorkingFolders,
      addKnownWorkspace,
      removeKnownWorkspace,
      repointSession,
      repointProject,
      presetButtons,
      setPresetButtons,
      presetState,
      pressPreset,
      pendingPreset,
      presetSent,
      requestConfirm,
    }),
    [
      auth,
      appMode,
      runtimeMode,
      loginRequired,
      requireLogin,
      loading,
      authError,
      login,
      viewMode,
      toggleViewMode,
      participant,
      transcriptView,
      discovery,
      refreshDiscovery,
      localConfig,
      refreshLocalConfig,
      sessions,
      sessionDisplayNames,
      setSessionDisplayName,
      sessionsLoading,
      sessionsError,
      refreshSessions,
      activeRelatedSessionId,
      relatedPaneSize,
      setActiveRelatedSessionId,
      knownWorkspaces,
      projects,
      globalFolders,
      workingFoldersLoaded,
      refreshWorkingFolders,
      addKnownWorkspace,
      removeKnownWorkspace,
      repointSession,
      repointProject,
      presetButtons,
      setPresetButtons,
      presetState,
      pressPreset,
      pendingPreset,
      presetSent,
      requestConfirm,
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
