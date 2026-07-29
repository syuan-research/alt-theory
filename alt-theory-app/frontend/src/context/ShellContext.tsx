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
import type { CapabilityMode } from "@/api/types";
import { getDefaultMode } from "@/api/config";

/** Full-screen surface. `app` is the 3-pane shell; the others take over. */
export type Surface = "app" | "settings" | "review";

/** Right-rail tabs. The three `adv` ones only appear in researcher mode. */
export type RailKey =
  | "chats"
  | "changes"
  | "workspace"
  | "records"
  | "provenance"
  | "runtime";

export interface RightSub {
  /** Which drill-in view is open, e.g. a side chat, a file diff, a preview. */
  key: string;
  /** Header label. Omitted for related conversations — the panel says what
   *  it is in its own words instead of repeating the child's name. */
  title?: string;
}

/** How wide the right rail should open for a related conversation. */
export type RelatedPaneSize = "half" | "default";

export interface ShellContextValue {
  surface: Surface;
  openApp: () => void;
  openSettings: (panel?: string) => void;
  openReview: () => void;

  settingsPanel: string;
  setSettingsPanel: (panel: string) => void;

  leftCollapsed: boolean;
  setLeftCollapsed: (collapsed: boolean) => void;

  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;

  rightPanel: RailKey | null;
  toggleRail: (key: RailKey) => void;
  openRail: (key: RailKey) => void;
  closeRight: () => void;

  /** Right panel width in px (branch/retry ≈ 50%; btw/helper ≈ 480 default). */
  rightWidth: number;
  /** Clamp + optionally persist. Used by the resizer and related open sizing. */
  setRightPaneWidth: (width: number, persist?: boolean) => void;
  /**
   * Size the right rail for a related conversation open:
   * - half ≈ 50% of center+right work area (not the full window)
   * - default = stored preference or 480 (btw / helper / side)
   * Does not rewrite localStorage (user drag still does).
   */
  setRightPaneForRelated: (size: RelatedPaneSize) => void;

  rightSub: RightSub | null;
  openSub: (sub: RightSub) => void;
  closeSub: () => void;

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

  /** Chosen capability mode for the next new conversation (Understand/Work). */
  newMode: CapabilityMode;
  setNewMode: (mode: CapabilityMode) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

const PARTICIPANT_TAB_KEY = "alt-theory-participant-tab";
const LEFT_COLLAPSED_KEY = "alt-theory-left-collapsed";
const SHOW_THINKING_KEY = "alt-theory-show-thinking";
const THINKING_EXPANDED_KEY = "alt-theory-thinking-expanded";
const NEW_MODE_KEY = "alt-theory-new-mode";
const DARK_MODE_KEY = "alt-theory-dark-mode";
const RIGHT_WIDTH_KEY = "alt-theory-right-width";

/** Default / btw / helper rail. Branch/retry open at ~50% of center+right. */
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
  return Math.round((window.innerWidth - 264 - RIGHT_PANE.collapsed) / 2);
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
  const [surface, setSurface] = useState<Surface>("app");
  const [settingsPanel, setSettingsPanel] = useState("models");
  const [leftCollapsed, setLeftCollapsedState] = useState(() =>
    readFlag(LEFT_COLLAPSED_KEY)
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<RailKey | null>(null);
  const [rightSub, setRightSub] = useState<RightSub | null>(null);
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
  // Persisted: a user who prefers Work should not reset to Understand on
  // every launch (settings review 2026-07-23).
  const [newMode, setNewModeState] = useState<CapabilityMode>(() => {
    try {
      return localStorage.getItem(NEW_MODE_KEY) === "full" ? "full" : "pure";
    } catch {
      return "pure";
    }
  });
  // An explicit Settings > General default wins at launch over the sticky
  // last-used mode, but never over a choice the user already made this run.
  const userPickedModeRef = useRef(false);
  const setNewMode = useCallback((mode: CapabilityMode) => {
    userPickedModeRef.current = true;
    setNewModeState(mode);
    try {
      localStorage.setItem(NEW_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    getDefaultMode()
      .then(({ mode }) => {
        if (mode && !userPickedModeRef.current) setNewModeState(mode);
      })
      .catch(() => {
        /* hosted mode or offline: keep the sticky default */
      });
  }, []);

  const openApp = useCallback(() => setSurface("app"), []);
  const openSettings = useCallback((panel?: string) => {
    if (panel) setSettingsPanel(panel);
    setSurface("settings");
  }, []);
  const openReview = useCallback(() => setSurface("review"), []);

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
    document.documentElement.setAttribute(
      "data-theme",
      darkMode ? "dark" : "light"
    );
  }, [darkMode]);

  const toggleRail = useCallback((key: RailKey) => {
    setRightSub(null);
    setRightPanel((prev) => (prev === key ? null : key));
  }, []);
  const openRail = useCallback((key: RailKey) => {
    setRightSub(null);
    setRightPanel(key);
  }, []);
  const closeRight = useCallback(() => {
    setRightPanel(null);
    setRightSub(null);
  }, []);

  const openSub = useCallback((sub: RightSub) => setRightSub(sub), []);
  const closeSub = useCallback(() => setRightSub(null), []);

  const setRightPaneWidth = useCallback((width: number, persist = false) => {
    const next = Math.min(RIGHT_PANE.max, Math.max(RIGHT_PANE.min, width));
    setRightWidthState(next);
    if (persist) saveStoredRightWidth(next);
  }, []);

  const setRightPaneForRelated = useCallback(
    (size: RelatedPaneSize) => {
      if (size === "half") {
        // Branch / retry only: ~half of center+right. Worker/btw/helper use default.
        setRightPaneWidth(halfCenterRightWorkArea(), false);
      } else {
        setRightPaneWidth(readStoredRightWidth(), false);
      }
    },
    [setRightPaneWidth],
  );

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
      leftCollapsed,
      setLeftCollapsed,
      searchOpen,
      setSearchOpen,
      rightPanel,
      toggleRail,
      openRail,
      closeRight,
      rightWidth,
      setRightPaneWidth,
      setRightPaneForRelated,
      rightSub,
      openSub,
      closeSub,
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
      newMode,
      setNewMode,
    }),
    [
      surface,
      openApp,
      openSettings,
      openReview,
      settingsPanel,
      leftCollapsed,
      setLeftCollapsed,
      searchOpen,
      rightPanel,
      toggleRail,
      openRail,
      closeRight,
      rightWidth,
      setRightPaneWidth,
      setRightPaneForRelated,
      rightSub,
      openSub,
      closeSub,
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
      newMode,
    ]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within ShellProvider");
  return ctx;
}
