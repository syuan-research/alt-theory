import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CapabilityMode } from "@/api/types";

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
  title: string;
}

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

  rightSub: RightSub | null;
  openSub: (sub: RightSub) => void;
  closeSub: () => void;

  /** Whether the participant-mode settings tab is revealed (opt-in, General). */
  participantTabEnabled: boolean;
  setParticipantTabEnabled: (on: boolean) => void;

  /** Whether thinking blocks start expanded in the transcript (General). */
  thinkingExpanded: boolean;
  setThinkingExpanded: (on: boolean) => void;

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
const THINKING_EXPANDED_KEY = "alt-theory-thinking-expanded";
const NEW_MODE_KEY = "alt-theory-new-mode";

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

export function ShellProvider({ children }: { children: ReactNode }) {
  const [surface, setSurface] = useState<Surface>("app");
  const [settingsPanel, setSettingsPanel] = useState("models");
  const [leftCollapsed, setLeftCollapsedState] = useState(() =>
    readFlag(LEFT_COLLAPSED_KEY)
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<RailKey | null>(null);
  const [rightSub, setRightSub] = useState<RightSub | null>(null);
  const [participantTabEnabled, setParticipantTabState] = useState(() =>
    readFlag(PARTICIPANT_TAB_KEY)
  );
  const [thinkingExpanded, setThinkingExpandedState] = useState(() =>
    readFlag(THINKING_EXPANDED_KEY)
  );
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
  const setNewMode = useCallback((mode: CapabilityMode) => {
    setNewModeState(mode);
    try {
      localStorage.setItem(NEW_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
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

  const setThinkingExpanded = useCallback((on: boolean) => {
    setThinkingExpandedState(on);
    writeFlag(THINKING_EXPANDED_KEY, on);
  }, []);

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
      rightSub,
      openSub,
      closeSub,
      participantTabEnabled,
      setParticipantTabEnabled,
      thinkingExpanded,
      setThinkingExpanded,
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
      rightSub,
      openSub,
      closeSub,
      participantTabEnabled,
      setParticipantTabEnabled,
      thinkingExpanded,
      setThinkingExpanded,
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
