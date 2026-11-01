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
import { useVersions } from "@/lib/versions";
import { paneMemory } from "@/lib/paneMemory";
import { INITIAL_PANE, navigate, targetKey, type RailKey, type ViewTarget } from "@/lib/viewTarget";
import { usePaneLayout } from "@/lib/usePaneLayout";
import type { Column } from "@/lib/attention";

export type { RailKey, ViewTarget };

/** Full-screen surface. `app` is the 3-pane shell; the others take over. */
export type Surface = "app" | "settings" | "review" | "files";

/** How wide the right rail should open for a related conversation. */
export type RelatedPaneSize = "half" | "default";

export interface ShellContextValue {
  versions: ReturnType<typeof useVersions>;
  surface: Surface;
  openApp: () => void;
  openSettings: (panel?: string) => void;
  openReview: () => void;
  /** The Conversation files page (every conversation folder's files). */
  openFiles: () => void;

  settingsPanel: string;
  setSettingsPanel: (panel: string) => void;
  externalAiSetupOpen: boolean;
  openExternalAiSetup: () => void;
  closeExternalAiSetup: () => void;

  leftCollapsed: boolean;
  setLeftCollapsed: (collapsed: boolean) => void;
  layout: ReturnType<typeof usePaneLayout>;
  showPane: (column: Column) => void;

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

  workspaceRevealPath: string | null;
  revealWorkspacePath: (path: string) => void;
  clearWorkspaceRevealPath: () => void;

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

const THINKING_EXPANDED_KEY = "alt-theory-thinking-expanded";
const DARK_MODE_KEY = "alt-theory-dark-mode";

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
  const [settingsPanel, setSettingsPanelState] = useState("models");
  const [externalAiSetupOpen, setExternalAiSetupOpen] = useState(false);
  const versions = useVersions();
  const [searchOpen, setSearchOpen] = useState(false);
  // Right-pane memory (Owner 2026-09-03) — what each rail showed last, and
  // where the user was before a target on another rail took over — lives in
  // the one navigation state (lib/viewTarget).
  const [pane, dispatchPane] = useReducer(navigate, INITIAL_PANE);
  const paneRef = useRef(pane);
  paneRef.current = pane;
  const layout = usePaneLayout(surface, pane.rail !== null,
    pane.rail ? `${surface}:${pane.rail}:${pane.target ? targetKey(pane.target) : "list"}` : null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const showPane = layout.show;
  const setLeftCollapsed = layout.setLeftCollapsed;
  const setSettingsPanel = useCallback((panel: string) => {
    setSettingsPanelState(panel);
    showPane("center");
  }, [showPane]);
  const [workspaceRevealPath, setWorkspaceRevealPath] = useState<string | null>(null);
  const [thinkingExpanded, setThinkingExpandedState] = useState(() =>
    readFlag(THINKING_EXPANDED_KEY)
  );
  const [darkMode, setDarkModeState] = useState(() => readFlag(DARK_MODE_KEY));
  const [importOpen, setImportOpen] = useState(false);
  const [armsComparisonId, setArmsComparisonId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const openApp = useCallback(() => {
    setSurface("app");
    showPane("center");
  }, [showPane]);
  const openSettings = useCallback((panel?: string) => {
    if (panel) setSettingsPanel(panel);
    setSurface("settings");
    showPane("center");
  }, [setSettingsPanel, showPane]);
  const openReview = useCallback(() => { setSurface("review"); showPane("center"); }, [showPane]);
  const openFiles = useCallback(() => { setSurface("files"); showPane("center"); }, [showPane]);
  const openExternalAiSetup = useCallback(() => setExternalAiSetupOpen(true), []);
  const closeExternalAiSetup = useCallback(() => setExternalAiSetupOpen(false), []);

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

  const toggleRail = useCallback((rail: RailKey) => {
    const active = layoutRef.current.state.single;
    // A hidden open rail is a destination, not a request to close its contents.
    if (active && active !== "right" && paneRef.current.rail === rail) {
      showPane("right");
      return;
    }
    const closing = paneRef.current.rail === rail;
    dispatchPane({ type: "toggle", rail });
    if (!closing) showPane("right");
    else if (active === "right") showPane("center");
  }, [showPane]);
  const openRail = useCallback((rail: RailKey) => { dispatchPane({ type: "rail", rail }); showPane("right"); }, [showPane]);
  const closeRight = useCallback(() => {
    dispatchPane({ type: "collapse" });
    if (layoutRef.current.state.single === "right") showPane("center");
  }, [showPane]);
  const closeTarget = useCallback(() => { dispatchPane({ type: "back" }); showPane("right"); }, [showPane]);
  const forgetConversations = useCallback((sessionIds: string[]) => {
    paneMemory.forgetSessions(sessionIds);
    dispatchPane({ type: "forget", sessionIds });
  }, []);
  const reopenRight = useCallback(() => { dispatchPane({ type: "reopen" }); showPane("right"); }, [showPane]);
  const revealWorkspacePath = useCallback((path: string) => {
    setSurface("app");
    dispatchPane({ type: "show", rail: "workspace" });
    showPane("right");
    setWorkspaceRevealPath(path);
  }, [showPane]);
  const clearWorkspaceRevealPath = useCallback(() => setWorkspaceRevealPath(null), []);

  // A side conversation sizes the pane as it opens: a branch/edit ≈ half of
  // center+right, BTW/subagent the stored preference (≈480). The
  // stored preference is not rewritten (a user drag still does).
  const openTarget = useCallback(
    (target: ViewTarget, options?: { size?: RelatedPaneSize }) => {
      const shown = paneRef.current.target;
      const already = shown !== null && targetKey(shown) === targetKey(target);
      // Opening what is already on show keeps a width the user dragged.
      if (target.kind === "conversation" && !already) {
        layoutRef.current.openSize(options?.size ?? "default");
      }
      dispatchPane({ type: "open", target });
      showPane("right");
    },
    [showPane],
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
      openFiles,
      settingsPanel,
      setSettingsPanel,
      externalAiSetupOpen,
      versions,
      openExternalAiSetup,
      closeExternalAiSetup,
      leftCollapsed: layout.geometry.leftCollapsed,
      setLeftCollapsed,
      layout,
      showPane,
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
      workspaceRevealPath,
      revealWorkspacePath,
      clearWorkspaceRevealPath,
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
      openFiles,
      settingsPanel,
      setSettingsPanel,
      externalAiSetupOpen,
      versions,
      openExternalAiSetup,
      closeExternalAiSetup,
      setLeftCollapsed,
      layout,
      showPane,
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
      workspaceRevealPath,
      revealWorkspacePath,
      clearWorkspaceRevealPath,
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
