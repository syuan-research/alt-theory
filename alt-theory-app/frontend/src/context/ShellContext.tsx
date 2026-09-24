import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { syncTitlebarTheme } from "@/lib/native";
import { INITIAL_PANE, navigate, targetKey, type RailKey, type ViewTarget } from "@/lib/viewTarget";

export type { RailKey, ViewTarget };

/** Full-screen surface. `app` is the 3-pane shell; the others take over. */
export type Surface = "app" | "settings" | "review";

/** How wide the right rail should open for a related conversation. */
export type RelatedPaneSize = "half" | "default";

export interface ShellContextValue {
  surface: Surface;
  openApp: () => void;
  openSettings: (panel?: string) => void;
  openReview: () => void;

  settingsPanel: string;
  setSettingsPanel: (panel: string) => void;
  externalAiSetupOpen: boolean;
  openExternalAiSetup: () => void;
  closeExternalAiSetup: () => void;

  leftCollapsed: boolean;
  setLeftCollapsed: (collapsed: boolean) => void;

  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;

  /** The side view's navigation — its one owner (lib/viewTarget). */
  rightPanel: RailKey | null;
  toggleRail: (key: RailKey) => void;
  openRail: (key: RailKey) => void;
  closeRight: () => void;
  /** What the open rail shows beyond its list; drawn against its own conversation. */
  target: ViewTarget | null;
  /** Open a target on its rail; a conversation also sizes the pane (branch ≈ half). */
  openTarget: (target: ViewTarget, options?: { size?: RelatedPaneSize }) => void;
  /** Back: to where the user came from, else to the rail's list. */
  closeTarget: () => void;
  /** The side conversation shown, if the view shows one. */
  openConversationId: string | null;
  /** Conversations that are gone (deleted): none of their targets stays or returns. */
  forgetConversations: (sessionIds: string[]) => void;
  /** Open the collapsed pane on the rail open last (drag, keyboard). */
  reopenRight: () => void;

  /** Right panel width in px (branch/edit ≈ 50%; btw/helper ≈ 480 default). */
  rightWidth: number;
  /** Clamp + optionally persist. Used by the resizer and related open sizing. */
  setRightPaneWidth: (width: number, persist?: boolean) => void;

  workspaceRevealPath: string | null;
  revealWorkspacePath: (path: string) => void;
  clearWorkspaceRevealPath: () => void;

  /** Whether the participant-mode settings tab is revealed (opt-in, General). */
  participantTabEnabled: boolean;
  setParticipantTabEnabled: (on: boolean) => void;

  /** Whether thinking blocks appear at all outside developer view (General). */
  showThinking: boolean;
  setShowThinking: (on: boolean) => void;

  /** Whether thinking blocks start expanded in the transcript (General). */
  thinkingExpanded: boolean;
  setThinkingExpanded: (on: boolean) => void;

  /** Dark appearance (General). Applied via data-theme on <html>. */
  darkMode: boolean;
  setDarkMode: (on: boolean) => void;

  /** Session-import dialog (triggered from empty state or the list menu). */
  importOpen: boolean;
  setImportOpen: (open: boolean) => void;

  /** A/B comparison setup panel (float-cmp) over the center (researcher). */
  compareOpen: boolean;
  openCompare: () => void;
  closeCompare: () => void;

  /** A/B side-by-side reader over the center (researcher). null = closed. */
  armsComparisonId: string | null;
  openArms: (comparisonId: string) => void;
  closeArms: () => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

const PARTICIPANT_TAB_KEY = "alt-theory-participant-tab";
const LEFT_COLLAPSED_KEY = "alt-theory-left-collapsed";
// Below this window width the settings column can no longer hold its widest
// control row with the rail expanded, so the rail yields (see the window
// minWidth in electron/main.cjs for the hard floor underneath this).
const LEFT_COLLAPSE_AT = 800;
const SHOW_THINKING_KEY = "alt-theory-show-thinking";
const THINKING_EXPANDED_KEY = "alt-theory-thinking-expanded";
const DARK_MODE_KEY = "alt-theory-dark-mode";
const RIGHT_WIDTH_KEY = "alt-theory-right-width";

/** Default / btw / helper rail. Branch/edit comparison opens at ~50%. */
export const RIGHT_PANE = {
  initial: 480,
  min: 320,
  /** High enough for half of a wide center+right work area. */
  max: 1200,
  collapsed: 48,
} as const;

/**
 * Half of the center + right work area (exclude left nav and the icon rail).
 * Not half the browser window — that over-squeezes the parent conversation.
 */
function halfCenterRightWorkArea(): number {
  try {
    const cols = document.querySelector(".cols") as HTMLElement | null;
    const left = document.querySelector(".cols > .left") as HTMLElement | null;
    const rail = document.querySelector(".cols .right .rail") as HTMLElement | null;
    if (cols) {
      const colsW = cols.getBoundingClientRect().width;
      const leftW = left?.getBoundingClientRect().width ?? 264;
      const railW = rail?.getBoundingClientRect().width ?? RIGHT_PANE.collapsed;
      // Resizers are ~5px each; treat as noise. Work = center + rpanel.
      const work = Math.max(0, colsW - leftW - railW);
      return Math.round(work / 2);
    }
  } catch {
    /* ignore measurement failures */
  }
  // Fallback when shell not mounted yet: rough window minus typical left+rail.
  return Math.round((window.innerWidth - 256 - RIGHT_PANE.collapsed) / 2);
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function readStoredRightWidth(): number {
  try {
    const stored = localStorage.getItem(RIGHT_WIDTH_KEY);
    if (stored === null) return RIGHT_PANE.initial;
    const value = Number(stored);
    return Number.isFinite(value)
      ? Math.min(RIGHT_PANE.max, Math.max(RIGHT_PANE.min, value))
      : RIGHT_PANE.initial;
  } catch {
    return RIGHT_PANE.initial;
  }
}

function saveStoredRightWidth(width: number): void {
  try {
    localStorage.setItem(RIGHT_WIDTH_KEY, String(width));
  } catch {
    /* ignore */
  }
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const openModelsFromUrl =
    new URLSearchParams(window.location.search).get("settings") === "models";
  const [surface, setSurface] = useState<Surface>(
    openModelsFromUrl ? "settings" : "app",
  );
  useEffect(() => {
    if (!openModelsFromUrl) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("settings");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [openModelsFromUrl]);
  const [settingsPanel, setSettingsPanel] = useState("models");
  const [externalAiSetupOpen, setExternalAiSetupOpen] = useState(false);
  const [leftCollapsed, setLeftCollapsedState] = useState(() =>
    readFlag(LEFT_COLLAPSED_KEY)
  );
  // Auto-collapse is derived, never persisted: the user's own choice above is
  // restored as soon as the window is wide again.
  const [narrow, setNarrow] = useState(() => window.innerWidth < LEFT_COLLAPSE_AT);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < LEFT_COLLAPSE_AT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [searchOpen, setSearchOpen] = useState(false);
  // Right-pane memory (Owner 2026-09-03) — what each rail showed last, and
  // where the user was before a target on another rail took over — lives in
  // the one navigation state (lib/viewTarget).
  const [pane, dispatchPane] = useReducer(navigate, INITIAL_PANE);
  const paneRef = useRef(pane);
  paneRef.current = pane;
  const [workspaceRevealPath, setWorkspaceRevealPath] = useState<string | null>(null);
  const [rightWidth, setRightWidthState] = useState(() => readStoredRightWidth());
  const [participantTabEnabled, setParticipantTabState] = useState(() =>
    readFlag(PARTICIPANT_TAB_KEY)
  );
  const [showThinking, setShowThinkingState] = useState(() =>
    readFlag(SHOW_THINKING_KEY)
  );
  const [thinkingExpanded, setThinkingExpandedState] = useState(() =>
    readFlag(THINKING_EXPANDED_KEY)
  );
  const [darkMode, setDarkModeState] = useState(() => readFlag(DARK_MODE_KEY));
  const [importOpen, setImportOpen] = useState(false);
  const [armsComparisonId, setArmsComparisonId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const openApp = useCallback(() => setSurface("app"), []);
  const openSettings = useCallback((panel?: string) => {
    if (panel) setSettingsPanel(panel);
    setSurface("settings");
  }, []);
  const openReview = useCallback(() => setSurface("review"), []);
  const openExternalAiSetup = useCallback(() => setExternalAiSetupOpen(true), []);
  const closeExternalAiSetup = useCallback(() => setExternalAiSetupOpen(false), []);

  const setLeftCollapsed = useCallback((collapsed: boolean) => {
    setLeftCollapsedState(collapsed);
    writeFlag(LEFT_COLLAPSED_KEY, collapsed);
  }, []);

  const setParticipantTabEnabled = useCallback((on: boolean) => {
    setParticipantTabState(on);
    writeFlag(PARTICIPANT_TAB_KEY, on);
  }, []);

  const setShowThinking = useCallback((on: boolean) => {
    setShowThinkingState(on);
    writeFlag(SHOW_THINKING_KEY, on);
  }, []);

  const setThinkingExpanded = useCallback((on: boolean) => {
    setThinkingExpandedState(on);
    writeFlag(THINKING_EXPANDED_KEY, on);
  }, []);

  const setDarkMode = useCallback((on: boolean) => {
    setDarkModeState(on);
    writeFlag(DARK_MODE_KEY, on);
  }, []);

  useEffect(() => {
    const theme = darkMode ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    syncTitlebarTheme(theme);
  }, [darkMode]);

  const toggleRail = useCallback((rail: RailKey) => dispatchPane({ type: "toggle", rail }), []);
  const openRail = useCallback((rail: RailKey) => dispatchPane({ type: "rail", rail }), []);
  const closeRight = useCallback(() => dispatchPane({ type: "collapse" }), []);
  const closeTarget = useCallback(() => dispatchPane({ type: "back" }), []);
  const forgetConversations = useCallback(
    (sessionIds: string[]) => dispatchPane({ type: "forget", sessionIds }),
    [],
  );
  const reopenRight = useCallback(() => dispatchPane({ type: "reopen" }), []);
  const revealWorkspacePath = useCallback((path: string) => {
    setSurface("app");
    dispatchPane({ type: "show", rail: "workspace" });
    setWorkspaceRevealPath(path);
  }, []);
  const clearWorkspaceRevealPath = useCallback(() => setWorkspaceRevealPath(null), []);

  const setRightPaneWidth = useCallback((width: number, persist = false) => {
    const next = Math.min(RIGHT_PANE.max, Math.max(RIGHT_PANE.min, width));
    setRightWidthState(next);
    if (persist) saveStoredRightWidth(next);
  }, []);

  // A side conversation sizes the pane as it opens: a branch/edit ≈ half of
  // center+right, BTW/Helper/subagent the stored preference (≈480). The
  // stored preference is not rewritten (a user drag still does).
  const openTarget = useCallback(
    (target: ViewTarget, options?: { size?: RelatedPaneSize }) => {
      const shown = paneRef.current.target;
      const already = shown !== null && targetKey(shown) === targetKey(target);
      // Opening what is already on show keeps a width the user dragged.
      if (target.kind === "conversation" && !already) {
        setRightPaneWidth(
          options?.size === "half" ? halfCenterRightWorkArea() : readStoredRightWidth(),
          false,
        );
      }
      dispatchPane({ type: "open", target });
    },
    [setRightPaneWidth],
  );
  const openConversationId = pane.target?.kind === "conversation" ? pane.target.sessionId : null;

  const openCompare = useCallback(() => setCompareOpen(true), []);
  const closeCompare = useCallback(() => setCompareOpen(false), []);
  const openArms = useCallback((comparisonId: string) => {
    setCompareOpen(false);
    setArmsComparisonId(comparisonId);
  }, []);
  const closeArms = useCallback(() => setArmsComparisonId(null), []);

  const value = useMemo<ShellContextValue>(
    () => ({
      surface,
      openApp,
      openSettings,
      openReview,
      settingsPanel,
      setSettingsPanel,
      externalAiSetupOpen,
      openExternalAiSetup,
      closeExternalAiSetup,
      leftCollapsed: leftCollapsed || narrow,
      setLeftCollapsed,
      searchOpen,
      setSearchOpen,
      rightPanel: pane.rail,
      toggleRail,
      openRail,
      closeRight,
      target: pane.target,
      openTarget,
      closeTarget,
      openConversationId,
      forgetConversations,
      reopenRight,
      rightWidth,
      setRightPaneWidth,
      workspaceRevealPath,
      revealWorkspacePath,
      clearWorkspaceRevealPath,
      participantTabEnabled,
      setParticipantTabEnabled,
      showThinking,
      setShowThinking,
      thinkingExpanded,
      setThinkingExpanded,
      darkMode,
      setDarkMode,
      importOpen,
      setImportOpen,
      compareOpen,
      openCompare,
      closeCompare,
      armsComparisonId,
      openArms,
      closeArms,
    }),
    [
      surface,
      openApp,
      openSettings,
      openReview,
      settingsPanel,
      externalAiSetupOpen,
      openExternalAiSetup,
      closeExternalAiSetup,
      leftCollapsed,
      setLeftCollapsed,
      narrow,
      searchOpen,
      pane,
      toggleRail,
      openRail,
      closeRight,
      openTarget,
      closeTarget,
      openConversationId,
      forgetConversations,
      reopenRight,
      rightWidth,
      setRightPaneWidth,
      workspaceRevealPath,
      revealWorkspacePath,
      clearWorkspaceRevealPath,
      participantTabEnabled,
      setParticipantTabEnabled,
      showThinking,
      setShowThinking,
      thinkingExpanded,
      setThinkingExpanded,
      darkMode,
      setDarkMode,
      importOpen,
      setImportOpen,
      compareOpen,
      openCompare,
      closeCompare,
      armsComparisonId,
      openArms,
      closeArms,
    ]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within ShellProvider");
  return ctx;
}
