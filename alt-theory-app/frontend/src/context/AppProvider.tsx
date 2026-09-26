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
import { fetchDiscovery } from "@/api/discovery";
import type { ProjectFolder } from "@/api/config";
import { fetchAppInfo, getWorkingFolders } from "@/api/config";
import { fetchSessionList } from "@/api/sessions";
import type {
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
import { defaultTranscriptView } from "@/lib/viewMode";
import { pruneDrafts, setDraftScope } from "@/lib/draft";
import { stepActivity, type ActivityChange, type ActivityMap, type ActivityMessage } from "@/lib/listActivity";

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
 * App-level state only: what exists (assets, conversations,
 * folders), app dialogs, the view mode, and the Steer preset experiment.
 * A conversation's own state lives in its conversation module
 * (hooks/useConversation); what the main view shows lives in MainView.
 */
export interface AppContextValue {
  runtimeMode: RuntimeMode;
  loading: boolean;

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

  /** The conversation list; each row's runStatus is the pushed activity (WP-4). */
  sessions: SessionSummary[];
  /**
   * Take a pushed activity picture or change; returns what moved (none for
   * the first picture, which is the baseline). A list change, or activity
   * for a conversation the list lacks, re-reads the list.
   */
  applyActivity: (message: ActivityMessage) => ActivityChange[];
  sessionDisplayNames: Record<string, { alias: string; snippet: string }>;
  setSessionDisplayName: (sessionId: string, alias: string) => void;
  sessionsLoading: boolean;
  sessionsError: string | null;
  refreshSessions: () => Promise<void>;

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
  "show-working-understanding",
  "clear-misunderstanding",
  "guided-next-steps",
];

export function AppProvider({ children }: { children: ReactNode }) {
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("alt-theory");
  const [loading, setLoading] = useState(true);
  const [discovery, setDiscovery] = useState<DiscoveryLists | null>(null);
  const [localConfig, setLocalConfig] = useState<ConfigStatus | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("user");
  const [participant, setParticipant] = useState<ParticipantInfo | null>(null);
  const [transcriptView, setTranscriptView] = useState<TranscriptView>("user");

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
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

  const loadApp = useCallback(async () => {
    setLoading(true);
    // Drafts on this device: one scope, the editors open once it is set.
    setDraftScope("local");
    try {
      const info = await fetchAppInfo();
      setRuntimeMode(info.app?.runtimeMode ?? "alt-theory");
      setParticipant(info.participant ?? null);
      setLocalConfig(info.localConfig ?? null);
      setDiscovery(await fetchDiscovery());
    } catch {
      setDiscovery(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshLocalConfig = useCallback(async () => {
    const info = await fetchAppInfo();
    setLocalConfig(info.localConfig ?? null);
  }, []);

  useEffect(() => {
    void loadApp();
  }, [loadApp]);

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
    const requestId = ++sessionListRequestRef.current;
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const list = await fetchSessionList();
      if (requestId !== sessionListRequestRef.current) return;
      setSessions(list);
      // Drafts of conversations that are gone go too (never one open this run).
      pruneDrafts(new Set(list.map((session) => session.sessionId)));
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
  }, []);

  const setSessionDisplayName = useCallback((sessionId: string, alias: string) => {
    setSessionDisplayNames((prev) => ({
      ...prev,
      [sessionId]: { ...(prev[sessionId] ?? { snippet: "" }), alias },
    }));
  }, []);

  useEffect(() => {
    if (!loading) void refreshSessions();
  }, [loading, refreshSessions]);

  // List activity is pushed (WP-4): the socket brings the whole picture on
  // (re)connect and every change after it; nothing polls.
  const [activity, setActivity] = useState<ActivityMap>(null);
  const activityRef = useRef(activity);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const refreshTimer = useRef<number | null>(null);
  const refreshSoon = useCallback(() => {
    if (refreshTimer.current !== null) return;
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      void refreshSessions();
    }, 150);
  }, [refreshSessions]);
  const applyActivity = useCallback(
    (message: ActivityMessage): ActivityChange[] => {
      const { next, changes } = stepActivity(activityRef.current, message);
      activityRef.current = next;
      setActivity(next);
      // The rows' other facts (order, snippet, message count, openable) move
      // with the activity and with the list itself: re-read the list then,
      // once for a burst. The run state itself never comes from that read.
      const listMoved =
        message.type === "session_activity" &&
        (message.payload.listChanged ||
          !sessionsRef.current.some((row) => row.sessionId === message.payload.sessionId));
      if (listMoved || changes.length > 0) refreshSoon();
      return changes;
    },
    [refreshSoon],
  );
  const listed = useMemo(
    () =>
      activity
        ? sessions.map((row) => ({ ...row, runStatus: activity[row.sessionId] ?? "idle" }))
        : sessions,
    [activity, sessions],
  );

  const refreshWorkingFolders = useCallback(async () => {
    try {
      const folders = await getWorkingFolders();
      setProjects(folders.projects);
      setKnownWorkspaces(folders.knownWorkspaces);
      setGlobalFolders(folders.global);
      setWorkingFoldersLoaded(true);
    } catch {
      /* endpoint unavailable */
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
    void refreshWorkingFolders();
  }, [refreshWorkingFolders]);

  // --- Situational preset buttons (v1.4 round 1 experiment) ---
  // ponytail: config in localStorage, active state in memory only — promote
  // both to app settings / session records if the experiment graduates.
  const [presetButtons, setPresetButtonsState] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem("alt-preset-buttons") ?? "null",
      );
      if (!Array.isArray(stored) || !stored.length) return DEFAULT_PRESET_BUTTONS;
      const names = stored.slice(0, 5).map((name: string) =>
        name === "confirm-why" ? "show-working-understanding" : name,
      );
      // Migrate the former default order while preserving custom button choices.
      return names.join("|") ===
        "adaptive-aligning|show-working-understanding|guided-next-steps|clear-misunderstanding"
        ? DEFAULT_PRESET_BUTTONS
        : names;
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
      runtimeMode,
      loading,
      viewMode,
      toggleViewMode,
      participant,
      transcriptView,
      discovery,
      refreshDiscovery,
      localConfig,
      refreshLocalConfig,
      sessions: listed,
      applyActivity,
      sessionDisplayNames,
      setSessionDisplayName,
      sessionsLoading,
      sessionsError,
      refreshSessions,
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
      runtimeMode,
      loading,
      viewMode,
      toggleViewMode,
      participant,
      transcriptView,
      discovery,
      refreshDiscovery,
      localConfig,
      refreshLocalConfig,
      listed,
      applyActivity,
      sessionDisplayNames,
      setSessionDisplayName,
      sessionsLoading,
      sessionsError,
      refreshSessions,
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
