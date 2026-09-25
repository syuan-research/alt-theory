import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionSummary } from "@/api/types";
import { useConversationContext } from "@/context/ConversationContext";
import { useMainView } from "@/context/MainView";
import { useApp, type SessionAlert } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { t } from "@/i18n";
import {
  buildWorkspaceTree,
  canTakeMainline,
  contentRailMatchIds,
  familyMembersOf,
  folderLabel,
  isFamilyHead,
  isListMember,
  listedOriginLabel,
  nearestAncestor,
  purposeIcon,
  railMatchIds,
  relatedPaneSize,
  sessionTitle,
  type WorkspaceTree,
} from "@/lib/sessionList";
import { Workbench } from "@/components/shell/Workbench";
import { SessionImportDialog } from "@/components/shell/SessionImportDialog";
import { HelpMenu } from "@/components/shell/HelpMenu";
import { scrollAffectsAnchor, useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import { promoteToMainline as promoteToMainlineRequest, searchSessionContent } from "@/api/sessions";
import { getWorkingFolders, saveWorkingFolders, type ProjectFolder } from "@/api/config";
import {
  dismissUpdate,
  getUpdateStatus,
  hasNativeBridge,
  onUpdateStatus,
  openExternal,
  pickDirectory,
  revealPath,
  type AppUpdateStatus,
} from "@/lib/native";
import { fetchSessionDetail } from "@/api/sessions";
import {
  getSessionListSort,
  saveSessionListSort,
  type SessionListSort,
} from "@/api/config";
import altTheoryMark from "@/assets/alt-theory-mark.svg";
import {
  downloadMarkdown,
  markdownFileName,
  sessionTranscriptToMarkdown,
} from "@/lib/sessionMarkdown";
import { copyText } from "@/lib/clipboard";
import { NEW_DRAFT, readDraft } from "@/lib/draft";
import { useFindTarget } from "@/lib/find";
import { usePaneMemory } from "@/lib/paneMemory";
import { isPathQuery, quickFindScore, quickFindTerms } from "../../../../shared/quick-find";

/**
 * What a conversation row says about itself when you are not in it (alpha.3).
 * Live state wins over a leftover mark; both clear once you open it.
 */
/** Hover text saying where a listed child came from (alpha.6). */
function originTitle(session: SessionSummary): string | undefined {
  const label = listedOriginLabel(session);
  if (!label) return undefined;
  return {
    Branch: t("Branch of another conversation"),
    "From subagent": t("Came from a subagent"),
    "From Helper": t("Came from a Helper conversation"),
    "From BTW": t("Came from a BTW side conversation"),
  }[label];
}

function sessionRowState(
  runStatus: SessionSummary["runStatus"],
  alert: SessionAlert | undefined,
): { label: string; tone: string; title: string } | null {
  if (runStatus === "awaiting-approval" || alert === "approval") {
    return {
      label: t("needs you"),
      tone: "warn",
      title: t("Waiting for your approval before it can continue"),
    };
  }
  if (runStatus === "running") {
    return { label: t("running"), tone: "", title: t("Working right now") };
  }
  if (runStatus === "failed" || alert === "failed") {
    return { label: t("stopped"), tone: "danger", title: t("This conversation ran into an error") };
  }
  if (alert === "done") {
    return { label: t("done"), tone: "ok", title: t("Finished while you were elsewhere") };
  }
  return null;
}

/**
 * How much work is in flight across every conversation, not just this one.
 * Clicking scrolls the list to the first running conversation.
 */
function RunningCount({ sessions }: { sessions: SessionSummary[] }) {
  const running = sessions.filter(
    (session) =>
      session.runStatus === "running" || session.runStatus === "awaiting-approval",
  );
  if (running.length === 0) return null;
  return (
    <button
      className="running-count"
      data-tip={t("Conversations working right now")}
      onClick={() => {
        document
          .querySelector(`[data-session-id="${running[0].sessionId}"]`)
          ?.scrollIntoView({ block: "center" });
      }}
    >
      <i className="ph ph-circle-notch" aria-hidden />
      {t("{count} running", { count: running.length })}
    </button>
  );
}

/** A <details> menu never closes itself when an item is clicked — close it here. */
function closeMenu(e: { currentTarget: HTMLElement }) {
  e.currentTarget.closest("details")?.removeAttribute("open");
}

/**
 * Position a `position: fixed` `.list-menu` from the summary it belongs to.
 * With top:auto the browser uses the menu's static spot, which for rows deep
 * in a scrolled list lands far below the row or off-screen. Anchor to the
 * clicked row and flip above when the bottom overflows the viewport. Then add
 * `.anchored` so CSS reveals it (kept opacity:0 until now, so the first paint
 * after `open` never shows the wrong spot). Shared by the session-row and
 * folder-group kebab menus (same `.list-menu`).
 */
function anchorMenuToSummary(details: HTMLDetailsElement) {
  const menu = details.querySelector<HTMLElement>(".list-menu");
  const summary = details.querySelector<HTMLElement>("summary");
  if (!menu || !summary) return;
  const rect = summary.getBoundingClientRect();
  menu.style.left = `${Math.max(8, rect.right - menu.offsetWidth)}px`;
  const below = rect.bottom + 4;
  menu.style.top =
    below + menu.offsetHeight > window.innerHeight - 8
      ? `${Math.max(8, rect.top - 4 - menu.offsetHeight)}px`
      : `${below}px`;
  menu.classList.add("anchored");
}

/** Clear JS positioning + reveal so the next open starts from a clean state. */
function unanchorMenu(details: HTMLDetailsElement) {
  details
    .querySelector(".list-menu")
    ?.classList.remove("anchored");
}

export function LeftNav({ hidden = false }: { hidden?: boolean }) {
  const app = useApp();
  const main = useMainView();
  const shell = useShell();

  // Settings surface: same persistent rail instance, content swapped for the
  // settings nav (foot is only "Back to app"; collapsed strip is logo + ←).
  if (shell.surface === "settings") {
    return <SettingsRail hidden={hidden} />;
  }

  const avatarLetter = (
    app.auth.displayLabel ||
    app.auth.accountId ||
    "A"
  )
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <aside className="left" hidden={hidden}>
      {/* collapsed icon strip */}
      <div className="mini">
        <button
          className="mono"
          data-tip={t("Expand")}
          onClick={() => shell.setLeftCollapsed(false)}
        >
          <img className="brand-mark" src={altTheoryMark} alt="" />
        </button>
        <button
          className="mini-new"
          data-tip={t("New conversation")}
          onClick={() => {
            shell.openApp();
            main.startNewSession();
          }}
        >
          <i className="ph ph-note-pencil" />
        </button>
        <button
          className="mini-search"
          data-tip={t("Search")}
          onClick={() => {
            shell.setLeftCollapsed(false);
            shell.setSearchOpen(true);
          }}
        >
          <i className="ph ph-magnifying-glass" />
        </button>
        <div style={{ flex: 1 }} />
        <HelpMenu compact />
        <button
          className="mini-gear"
          data-tip={t("Settings")}
          onClick={() => shell.openSettings()}
        >
          <i className="ph ph-gear" />
        </button>
      </div>

      <div
        className="full"
        style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, }}
      >
        <div className="left-head">
          <span className="brand-lockup">
            <img className="brand-mark" src={altTheoryMark} alt="" />
            <span className="wordmark">{t("Alt Theory")}</span>
          </span>
          <div className="icons">
            <button
              className="icon-btn"
              data-tip={t("Collapse")}
              onClick={() => shell.setLeftCollapsed(true)}
            >
              <i className="ph ph-sidebar-simple" />
            </button>
          </div>
        </div>

        <UserNav onImport={() => shell.setImportOpen(true)} />
        <Workbench />
        <UpdateLine />

        <div className="left-foot">
          <button className="gear" onClick={() => shell.openSettings()}>
            <i className="ph ph-gear" />
            {t("Settings")}
          </button>
          <HelpMenu />
          <div
            className="avatar"
            data-tip={
              app.appMode === "local"
                ? undefined
                : (app.auth.displayLabel ?? t("Signed in"))
            }
          >
            {avatarLetter}
          </div>
        </div>
      </div>
      <SessionImportDialog
        open={shell.importOpen}
        onClose={() => shell.setImportOpen(false)}
      />
    </aside>
  );
}

/**
 * The settings surface's view of the shared left rail. Expanded: brand head,
 * the settings nav (same .set-item rows the old set-nav rendered), and a foot
 * with only "Back to app". Collapsed: the logo (expands) and ← (back to app),
 * nothing else.
 */
function SettingsRail({ hidden }: { hidden?: boolean }) {
  const shell = useShell();

  const items = [
    { key: "general", label: t("General"), icon: "ph-gear" },
    { key: "models", label: t("Models"), icon: "ph-cpu" },
    { key: "agents", label: t("Subagents"), icon: "ph-robot" },
    { key: "folders", label: t("Projects and global folders"), icon: "ph-folders" },
    { key: "rolekb", label: t("Role & Knowledge"), icon: "ph-book-open" },
    { key: "skills", label: t("Skills"), icon: "ph-magic-wand" },
    ...(shell.participantTabEnabled
      ? [
          {
            key: "participant",
            label: t("Participant mode"),
            icon: "ph-identification-badge",
          },
        ]
      : []),
    { key: "features", label: t("Help center"), icon: "ph-lifebuoy" },
    { key: "trash", label: t("Trash"), icon: "ph-trash" },
    { key: "about", label: t("About"), icon: "ph-info" },
  ];

  if (shell.leftCollapsed) {
    // The expanded markup stays and only the ink is hidden: the logo, the nav
    // icons and the back arrow keep their expanded positions by construction,
    // with no hand-tuned offsets left to drift when type or padding changes.
    return (
      <aside className="left" hidden={hidden}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div className="left-head">
            <button
              className="brand-btn"
              data-tip={t("Expand")}
              onClick={() => shell.setLeftCollapsed(false)}
            >
              <img className="brand-mark" src={altTheoryMark} alt="" />
            </button>
          </div>
          <nav className="set-rail">
            {items.map((item) => (
              <button
                key={item.key}
                className={`set-item${shell.settingsPanel === item.key ? " on" : ""}`}
                data-tip={item.label}
                onClick={() => shell.setSettingsPanel(item.key)}
              >
                <i className={`ph ${item.icon}`} />
                <span className="lbl">{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="left-foot">
            <button className="gear" data-tip={t("Back to app")} onClick={() => shell.openApp()}>
              <i className="ph ph-arrow-left" />
              <span className="lbl">{t("Back to app")}</span>
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="left" hidden={hidden}>
      <div
        className="full"
        style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
      >
        <div className="left-head">
          <span className="brand-lockup">
            <img className="brand-mark" src={altTheoryMark} alt="" />
            <span className="wordmark">{t("Alt Theory")}</span>
          </span>
          <div className="icons">
            <button
              className="icon-btn"
              data-tip={t("Collapse")}
              onClick={() => shell.setLeftCollapsed(true)}
            >
              <i className="ph ph-sidebar-simple" />
            </button>
          </div>
        </div>
        <nav className="set-rail">
          {items.map((item) => (
            <button
              key={item.key}
              className={`set-item${shell.settingsPanel === item.key ? " on" : ""}`}
              onClick={() => shell.setSettingsPanel(item.key)}
            >
              <i className={`ph ${item.icon}`} />
              <span className="lbl">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="left-foot">
          <button className="gear" onClick={() => shell.openApp()}>
            <i className="ph ph-arrow-left" />
            {t("Back to app")}
          </button>
        </div>
      </div>
    </aside>
  );
}

function UpdateLine() {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  useEffect(() => {
    if (!hasNativeBridge()) return;
    let alive = true;
    void getUpdateStatus().then((next) => alive && setStatus(next));
    const stop = onUpdateStatus((next) => {
      if (alive) setStatus(next);
    });
    return () => {
      alive = false;
      stop();
    };
  }, []);
  if (!status?.newer || !status.latestVersion) return null;
  return (
    <div className="update-line">
      <span>{t("Version {version} is available.", { version: status.latestVersion })}</span>
      {status.htmlUrl ? (
        <button type="button" className="link-btn" onClick={() => void openExternal(status.htmlUrl!)}>
          {t("Open download page")}
        </button>
      ) : null}
      <button
        type="button"
        className="link-btn"
        onClick={() => {
          void dismissUpdate(status.latestVersion!).then(setStatus);
        }}
      >
        {t("Dismiss")}
      </button>
    </div>
  );
}

function SessionRootList({
  roots,
  tree,
  folderHit,
  visibleIds,
  expanded,
  onToggleExpanded,
  foldedFamilies,
  onToggleFamily,
  onOpen,
  draggable,
  cap,
}: {
  roots: SessionSummary[];
  tree: WorkspaceTree;
  folderHit: boolean;
  visibleIds: Set<string> | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  foldedFamilies: Set<string>;
  onToggleFamily: (id: string) => void;
  onOpen: (id: string) => void;
  draggable: boolean;
  cap: number;
}) {
  const shown = expanded || visibleIds !== null ? roots : roots.slice(0, cap);
  return (
    <>
      {roots.length === 0 ? (
        <div className="rp-empty ws-empty">{t("No conversations yet.")}</div>
      ) : null}
      {shown.map((root) => (
        <SessionNode
          key={root.sessionId}
          session={root}
          childrenByParent={tree.childrenByParent}
          indent={0}
          onOpen={onOpen}
          draggable={draggable}
          foldedFamilies={foldedFamilies}
          onToggleFamily={onToggleFamily}
          visibleIds={folderHit ? null : visibleIds}
        />
      ))}
      {visibleIds === null && roots.length > cap ? (
        <button className="group-more" onClick={onToggleExpanded}>
          {expanded ? t("Show less") : t("Show all ({count})", { count: roots.length })}
        </button>
      ) : null}
    </>
  );
}

function UserNav({ onImport }: { onImport: () => void }) {
  const app = useApp();
  const conv = useConversationContext();
  const main = useMainView();
  const shell = useShell();
  const navRef = useRef<HTMLDivElement>(null);
  // Ctrl+F with the list last touched opens and focuses this filter.
  useFindTarget(navRef, {
    focus: () => {
      shell.setSearchOpen(true);
      window.setTimeout(() => {
        const input = navRef.current?.querySelector<HTMLInputElement>(".inline-search input");
        input?.focus();
        input?.select();
      }, 0);
    },
  });
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const [looseCollapsed, setLooseCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [foldedFamilies, setFoldedFamilies] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [listSort, setListSort] = useState<SessionListSort>({
    folders: "name",
    conversations: "modified",
  });
  // In-place filter (proto E): the magnifier reveals a borderless field;
  // typing narrows folders and conversations right here.
  // Pane memory, not useState: Settings swaps this nav out (SettingsRail),
  // and the open search box (ShellContext) came back without its text.
  const [railQuery, setRailQuery] = usePaneMemory("rail:search:query", "");
  const [searchScope, setSearchScope] = usePaneMemory<"names" | "content">("rail:search:scope", "names");
  const [contentResult, setContentResult] = useState<{ query: string; ids: string[] } | null>(null);
  const [contentSearchError, setContentSearchError] = useState("");
  const [pendingRelated, setPendingRelated] = useState<{ centerId: string; childId: string } | null>(null);
  const openRelated = (childId: string) => {
    const child = app.sessions.find((item) => item.sessionId === childId);
    shell.openTarget(
      { kind: "conversation", sessionId: childId },
      { size: child ? relatedPaneSize(child) : "default" },
    );
  };
  useEffect(() => {
    if (!shell.searchOpen) setRailQuery("");
  }, [shell.searchOpen]);
  const local = app.appMode === "local";
  const GROUP_CAP = 4;

  useEffect(() => {
    const query = railQuery.trim();
    if (searchScope !== "content" || !query || !shell.searchOpen) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchSessionContent(query, controller.signal)
        .then((ids) => setContentResult({ query, ids }))
        .catch((error) => {
          if (controller.signal.aborted) return;
          setContentSearchError(error instanceof Error ? error.message : String(error));
        });
    }, 240);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [railQuery, searchScope, shell.searchOpen]);

  useEffect(() => {
    if (!pendingRelated) return;
    if (conv.sessionId === pendingRelated.centerId) {
      openRelated(pendingRelated.childId);
      setPendingRelated(null);
    } else if (main.selectedCatalogSessionId !== pendingRelated.centerId) {
      // The user opened something else: never pop this child in later.
      // ponytail: a server-refused open keeps it until the next selection.
      setPendingRelated(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.sessionId, main.selectedCatalogSessionId, pendingRelated]);

  useEffect(() => {
    if (!local) return;
    void getSessionListSort().then(setListSort);
  }, [local]);

  useEffect(() => {
    const closeOpenMenus = (event: PointerEvent) => {
      navRef.current
        ?.querySelectorAll<HTMLDetailsElement>(
          "details.list-more[open], details.help-menu[open]",
        )
        .forEach((details) => {
          if (!details.contains(event.target as Node)) details.open = false;
        });
    };
    // position:fixed menus keep their layout-time spot while the list
    // scrolls beneath them (opus C2) — a scrolled menu could sit over row B
    // with row A's Delete bound to it. Close them when their own pane scrolls.
    const closeAllMenus = (event: Event) => {
      navRef.current
        ?.querySelectorAll<HTMLDetailsElement>("details.list-more[open]")
        .forEach((details) => {
          if (scrollAffectsAnchor(details, event.target)) details.open = false;
        });
    };
    const closeTopMenu = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const open = navRef.current?.querySelectorAll<HTMLDetailsElement>(
        "details.list-more[open], details.help-menu[open]",
      );
      const details = open?.[open.length - 1];
      if (!details) return;
      event.preventDefault();
      details.open = false;
      details.querySelector<HTMLElement>("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOpenMenus);
    document.addEventListener("scroll", closeAllMenus, { capture: true });
    document.addEventListener("keydown", closeTopMenu);
    return () => {
      document.removeEventListener("pointerdown", closeOpenMenus);
      document.removeEventListener("scroll", closeAllMenus, {
        capture: true,
      });
      document.removeEventListener("keydown", closeTopMenu);
    };
  }, []);

  const tree = useMemo(
    () =>
      buildWorkspaceTree(
        app.sessions,
        local ? app.knownWorkspaces : [],
        listSort,
        app.sessionDisplayNames,
        searchScope === "names" ? railQuery.trim() : "",
      ),
    [app.sessions, app.knownWorkspaces, app.sessionDisplayNames, listSort, local, railQuery, searchScope],
  );

  // Projects (v1.5.1): the group's label is the project's name (defaults to
  // the main folder's). Companions left the rail (WP-C, 2026-09-08) — the
  // label's tooltip lists main / companion folders and the name.
  const projectByDir = useMemo(
    () => new Map(app.projects.map((project) => [project.primaryDir, project])),
    [app.projects],
  );
  const groups = useMemo(
    () =>
      tree.groups.map((group) => {
        const project = projectByDir.get(group.dir);
        if (project?.name) return { ...group, label: project.name };
        return group;
      }),
    [tree, projectByDir],
  );
  const projectGroups = useMemo(
    () => groups.filter((group) => group.dir),
    [groups],
  );
  const looseGroup = useMemo(
    () => groups.find((group) => !group.dir),
    [groups],
  );

  const contentIds = searchScope === "content" && contentResult?.query === railQuery.trim()
    ? new Set(contentResult.ids) : null;
  const visibleIds = useMemo(() =>
    searchScope === "content" && railQuery.trim()
      ? contentRailMatchIds(app.sessions, contentIds ?? new Set())
      : railMatchIds(app.sessions, railQuery, app.sessionDisplayNames),
    [app.sessions, railQuery, app.sessionDisplayNames, searchScope, contentResult],
  );
  const unlistedHits = contentIds
    ? app.sessions.filter((session) => contentIds.has(session.sessionId) && !isListMember(session) && !session.deletedAt)
    : [];
  const sessionsById = new Map(app.sessions.map((session) => [session.sessionId, session]));

  const chooseSort = (next: SessionListSort) => {
    setListSort(next);
    if (local) {
      void saveSessionListSort(next).catch((error) =>
        window.alert(error instanceof Error ? error.message : String(error)),
      );
    }
  };

  const workspaceDirs = useMemo(() => {
    const dirs = new Set(app.knownWorkspaces);
    for (const session of app.sessions) {
      if (session.workspacePrimaryDir) dirs.add(session.workspacePrimaryDir);
    }
    return [...dirs].sort((a, b) =>
      folderLabel(a).localeCompare(folderLabel(b)),
    );
  }, [app.knownWorkspaces, app.sessions]);

  const toggleGroup = (id: string) =>
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleFamily = (id: string) =>
    setFoldedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openSession = (id: string) => {
    shell.openApp();
    main.openCatalogSession(id);
  };

  const openContentHit = (session: SessionSummary) => {
    if (session.forkedFrom?.purpose === "ab-arm") {
      openSession(session.sessionId);
      return;
    }
    const ancestor = nearestAncestor(session, sessionsById, (item) =>
      isListMember(item) && item.hasSessionFile && !item.deletedAt &&
      (local || item.visibility !== "private" || item.ownerAccountId === app.auth.accountId));
    if (!ancestor) {
      openSession(session.sessionId);
      return;
    }
    shell.openApp();
    if (conv.sessionId === ancestor.sessionId) openRelated(session.sessionId);
    else if (main.openCatalogSession(ancestor.sessionId)) {
      setPendingRelated({ centerId: ancestor.sessionId, childId: session.sessionId });
    }
  };

  const startConversationIn = (dir: string | null) => {
    conv.setDraftWorkspace(dir);
    shell.openApp();
    main.startNewSession();
  };

  // Header folder selector. With a conversation open this must MOVE that
  // conversation (server re-point: permissions + file tree rebuild in the new
  // folder) — a draft-only change would leave the UI claiming a workspace the
  // session never got. Without a session it stays the draft picker for the
  // next conversation.
  const chooseFolder = (dir: string | null) => {
    if (!conv.sessionId) {
      conv.setDraftWorkspace(dir);
      return;
    }
    if ((dir ?? "") === (conv.workspacePrimaryDir ?? "")) return;
    const label = dir ? folderLabel(dir) : t("Independent conversations");
    app.requestConfirm({
      message: t("Move this conversation to work in \"{label}\"?", { label }),
      details: [
        t("Its whole family moves with it — branches and attached conversations always share one main folder."),
        t("Alt will ask for permissions again in the new folder."),
        t("Files already on disk are not moved."),
      ],
      confirmLabel: t("Move"),
      onConfirm: () => {
        void app
          .repointSession(conv.sessionId as string, dir)
          .catch((error) =>
            window.alert(error instanceof Error ? error.message : String(error)),
          );
      },
    });
  };

  const addFolder = async () => {
    const path = await pickDirectory(t("Full path of the project to add:"));
    if (!path) return;
    try {
      await app.addKnownWorkspace(path);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  /** Add a companion folder to the project this rail group belongs to (v1.5.1). */
  const addProjectFolder = async (project: ProjectFolder) => {
    const path = await pickDirectory(t("Full path of the folder to add to this project:"));
    if (!path || project.secondaryDirs.includes(path)) return;
    try {
      const current = await getWorkingFolders();
      await saveWorkingFolders({
        projects: current.projects.map((entry) =>
          entry.id === project.id
            ? { ...entry, secondaryDirs: [...entry.secondaryDirs, path] }
            : entry,
        ),
      });
      await app.refreshWorkingFolders();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const removeFolder = (dir: string, sessionIds: string[]) => {
    const finish = async () => {
      // The new-conversation draft no longer goes to a folder that is removed.
      if (readDraft(NEW_DRAFT).settings?.workspacePrimaryDir === dir) conv.setDraftWorkspace(null);
      await app.removeKnownWorkspace(dir);
    };
    const run = async () => {
      await Promise.all(sessionIds.map((id) => app.repointSession(id, null)));
      await finish();
    };
    if (sessionIds.length === 0) {
      void finish().catch((error) =>
        window.alert(error instanceof Error ? error.message : String(error)),
      );
      return;
    }
    const project = projectByDir.get(dir);
    app.requestConfirm({
      message:
        t("Move this project's conversations to Independent conversations, then remove the project from the list? Conversations and files are not deleted."),
      ...(project?.secondaryDirs.length
        ? {
            details: [
              t("The project's companion folders are removed from the list with it."),
            ],
          }
        : {}),
      confirmLabel: t("Move conversations and remove project"),
      cancelLabel: t("Keep this project"),
      onConfirm: () => {
        void run().catch((error) =>
          window.alert(error instanceof Error ? error.message : String(error)),
        );
      },
    });
  };

  const dropSession = (dir: string, event: React.DragEvent) => {
    event.preventDefault();
    setDropTarget(null);
    const sessionId = event.dataTransfer.getData("text/alt-theory-session");
    if (!sessionId) return;
    const target = dir || null;
    const dragged = app.sessions.find((s) => s.sessionId === sessionId);
    const sourceDir = dragged?.workspacePrimaryDir || "";
    if ((target ?? "") === sourceDir) return; // dropped back on its own folder
    const label = target ? folderLabel(target) : t("Independent conversations");

    // Whole-folder migration (item 4): when the dragged conversation's current
    // folder holds other conversations too (the "renamed/merged folder" case),
    // offer to move all of them in one go. Default-checked, red, so the user
    // opts in explicitly. Only roots are moved; branches follow their root.
    const siblings = sourceDir
      ? (tree.groups.find((g) => g.dir === sourceDir)?.roots ?? []).filter(
          (s) => s.sessionId !== sessionId,
        )
      : [];
    const canMigrateFolder = siblings.length > 0;

    const repointAll = (ids: string[]) => {
      void Promise.all(
        ids.map((id) => app.repointSession(id, target))
      ).catch((error) => {
        window.alert(error instanceof Error ? error.message : String(error));
      },);
    };

    app.requestConfirm({
      message: t("Move this conversation to work in \"{label}\"?", { label }),
      details: [
        t("Its whole family moves with it — branches and attached conversations always share one main folder."),
        t("Alt will ask for permissions again in the new folder."),
        t("Files already on disk are not moved."),
      ],
      confirmLabel: t("Move"),
      checkbox: canMigrateFolder
        ? {
            label: t("Also move all {count} conversations in \"{folder}\"", { count: siblings.length + 1, folder: folderLabel(sourceDir) }),
            // Moving unrelated folder-mates is opt-in (owner 2026-08-06);
            // the fork FAMILY still always moves together.
            defaultChecked: false,
            danger: true,
          }
        : undefined,
      onConfirm: (result) => {
        const ids =
          canMigrateFolder && result?.checkboxChecked
            ? [sessionId, ...siblings.map((s) => s.sessionId)]
            : [sessionId];
        repointAll(ids);
      },
    });
  };

  return (
    <div
      ref={navRef}
      className="user-nav"
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, }}
      onKeyDown={(event) => {
        // Escape closes the rail search from anywhere in the rail — the
        // clear button and the scope select take the click focus, so the
        // input's own handler is not enough.
        if (!shell.searchOpen || event.key !== "Escape" || event.nativeEvent.isComposing) return;
        if (navRef.current?.querySelector("details.list-more[open], details.help-menu[open]")) return;
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (target?.closest("input, textarea, select") && !target.closest(".inline-search")) return;
        event.preventDefault();
        event.stopPropagation();
        shell.setSearchOpen(false);
      }}
    >
      <div className="pad">
        <div className="new-row">
          {local ? (
            <div className="split-new">
              <details className="list-more ws-pick">
                <summary
                  data-tip={conv.workspacePrimaryDir ?? t("Independent conversations")}
                >
                  <i className={`ph ${conv.workspacePrimaryDir ? "ph-folder" : "ph-note"}`} />
                  <span className="ws-label">
                    {conv.workspacePrimaryDir
                      ? folderLabel(conv.workspacePrimaryDir)
                      : t("Independent conversations")}
                  </span>
                  <i className="ph ph-caret-down caret" />
                </summary>
                <div className="list-menu">
                  <button
                    onClick={(e) => {
                      closeMenu(e);
                      onImport();
                    }}
                  >
                    <i className="ph ph-download-simple" />
                    {t("Import conversations…")}
                  </button>
                  <div className="sep" />
                  <button
                    onClick={(e) => {
                      e.currentTarget.closest("details")?.removeAttribute("open");
                      chooseFolder(null);
                    }}
                  >
                    <i className="ph ph-note" />
                    {t("Independent conversations")}
                    {!conv.workspacePrimaryDir ? (
                      <i className="ph ph-check check" />
                    ) : null}
                  </button>
                  {workspaceDirs.map((dir) => (
                    <button
                      key={dir}
                      data-tip={dir}
                      onClick={(e) => {
                        e.currentTarget
                          .closest("details")
                          ?.removeAttribute("open");
                        chooseFolder(dir);
                      }}
                    >
                      <i className="ph ph-folder" />
                      {folderLabel(dir)}
                      {conv.workspacePrimaryDir === dir ? (
                        <i className="ph ph-check check" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </details>
              <button
                type="button"
                className={`btn-new split-search${shell.searchOpen ? " on" : ""}`}
                data-tip={t("Search")}
                aria-label={t("Search")}
                aria-expanded={shell.searchOpen}
                onClick={() => shell.setSearchOpen(!shell.searchOpen)}
              >
                <i className="ph ph-magnifying-glass" aria-hidden="true" />
              </button>
              <button
                className="btn-new split-plus"
                data-tip={t("New conversation")}
                onClick={() =>
                  startConversationIn(conv.workspacePrimaryDir || null)
                }
              >
                <i className="ph ph-note-pencil" />
              </button>
            </div>
          ) : (
            <div className="split-new">
              <button
                type="button"
                className={`btn-new split-search${shell.searchOpen ? " on" : ""}`}
                data-tip={t("Search")}
                aria-label={t("Search")}
                aria-expanded={shell.searchOpen}
                onClick={() => shell.setSearchOpen(!shell.searchOpen)}
              >
                <i className="ph ph-magnifying-glass" aria-hidden="true" />
              </button>
              <button
                className="btn-new split-new-text"
                onClick={() => startConversationIn(null)}
              >
                <i className="ph ph-note-pencil" />
                {t("New conversation")}
              </button>
            </div>
          )}
        </div>
        {shell.searchOpen ? (
          <div className="inline-search">
            <i className="ph ph-magnifying-glass" aria-hidden="true" />
            <input
              autoFocus
              placeholder={searchScope === "content" ? t("Search conversation text…") : t("Filter folders and conversations…")}
              value={railQuery}
              onChange={(event) => { setRailQuery(event.target.value); setContentResult(null); setContentSearchError(""); }}
              onKeyDown={(event) => {
                if (event.key === "Escape") shell.setSearchOpen(false);
              }}
            />
            {railQuery ? (
              <button type="button" className="clear" aria-label={t("Clear")} onClick={() => { setRailQuery(""); setContentResult(null); }}>
                <i className="ph ph-x" aria-hidden="true" />
              </button>
            ) : null}
            <select aria-label={t("Search in")} value={searchScope} onChange={(event) => { setSearchScope(event.target.value as "names" | "content"); setContentResult(null); setContentSearchError(""); }}>
              <option value="names">{t("Names")}</option>
              <option value="content">{t("Content")}</option>
            </select>
          </div>
        ) : null}
        <RunningCount sessions={app.sessions} />
      </div>
      <div className="sessions">
        {app.sessionsLoading && app.sessions.length === 0 ? (
          <div className="rp-empty">{t("Loading conversations…")}</div>
        ) : app.sessionsError && app.sessions.length === 0 ? (
          <div className="rp-empty">{app.sessionsError}</div>
        ) : (
          <>
            {(() => {
              const looseLabel = t("Independent conversations");
              const folderHit = searchScope === "names" && visibleIds !== null &&
                quickFindScore(quickFindTerms(railQuery), [{ text: looseLabel, weight: 10 }]) > 0;
              const looseRoots = looseGroup?.roots ?? [];
              const roots =
                visibleIds === null || folderHit
                  ? looseRoots
                  : looseRoots.filter((root) => visibleIds.has(root.sessionId));
              if (visibleIds !== null && roots.length === 0) return null;
              return (
                <div
                  key="independent"
                  className={dropTarget === "" ? "drop-target" : undefined}
                  onDragOver={
                    local
                      ? (e) => {
                          e.preventDefault();
                          setDropTarget("");
                        }
                      : undefined
                  }
                  onDragLeave={
                    local
                      ? () =>
                          setDropTarget((prev) => (prev === "" ? null : prev))
                      : undefined
                  }
                  onDrop={local ? (e) => dropSession("", e) : undefined}
                >
                  <div className="workspace-list-head">
                    <button
                      type="button"
                      className={`workspace-list-title${looseCollapsed ? " closed" : ""}`}
                      aria-expanded={!looseCollapsed}
                      onClick={() => setLooseCollapsed((value) => !value)}
                    >
                      <i className="ph ph-caret-down tw" aria-hidden="true" />
                      {looseLabel}
                    </button>
                    <div className="workspace-list-actions">
                      <button
                        type="button"
                        data-tip={t("New conversation")}
                        aria-label={t("New conversation")}
                        onClick={() => startConversationIn(null)}
                      >
                        <i className="ph ph-note-pencil" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {looseCollapsed && visibleIds === null ? null : (
                  <SessionRootList
                    roots={roots}
                    tree={tree}
                    folderHit={folderHit}
                    visibleIds={visibleIds}
                    expanded={expandedGroups.has("")}
                    onToggleExpanded={() =>
                      setExpandedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has("")) next.delete("");
                        else next.add("");
                        return next;
                      })
                    }
                    foldedFamilies={foldedFamilies}
                    onToggleFamily={toggleFamily}
                    onOpen={openSession}
                    draggable={local}
                    cap={GROUP_CAP}
                  />
                  )}
                </div>
              );
            })()}
            {/* Independent conversations come first (owner 2026-09-25). */}
            <div className="workspace-list-head divided">
              <button
                type="button"
                className={`workspace-list-title${projectsCollapsed ? " closed" : ""}`}
                aria-expanded={!projectsCollapsed}
                onClick={() => setProjectsCollapsed((value) => !value)}
              >
                <i className="ph ph-caret-down tw" aria-hidden="true" />
                {t("Projects")}
              </button>
              <div className="workspace-list-actions">
                <button
                  type="button"
                  data-tip={t("Collapse all projects")}
                  aria-label={t("Collapse all projects")}
                  onClick={() => setClosedGroups(new Set(projectGroups.map((group) => group.dir)))}
                >
                  <i className="ph ph-arrows-in-line-vertical" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  data-tip={t("Expand all projects")}
                  aria-label={t("Expand all projects")}
                  onClick={() => setClosedGroups(new Set())}
                >
                  <i className="ph ph-arrows-out-line-vertical" aria-hidden="true" />
                </button>
                {local ? (
                  <button
                    type="button"
                    data-tip={t("Add project…")}
                    aria-label={t("Add project…")}
                    onClick={() => void addFolder()}
                  >
                    <i className="ph ph-folder-plus" aria-hidden="true" />
                  </button>
                ) : null}
                <details className="list-more list-sort">
                  <summary data-tip={t("Sort conversations")}>
                    <i className="ph ph-sort-ascending" />
                  </summary>
                  <div className="list-menu">
                    <div className="list-menu-label">{t("Folders")}</div>
                    {(["name", "modified"] as const).map((value) => (
                      <button
                        key={`folder-${value}`}
                        onClick={(event) => {
                          closeMenu(event);
                          chooseSort({ ...listSort, folders: value });
                        }}
                      >
                        {t(value === "name" ? "Name" : "Modified")}
                        {listSort.folders === value ? <i className="ph ph-check check" /> : null}
                      </button>
                    ))}
                    <div className="sep" />
                    <div className="list-menu-label">{t("Conversations")}</div>
                    {(["name", "modified"] as const).map((value) => (
                      <button
                        key={`conversation-${value}`}
                        onClick={(event) => {
                          closeMenu(event);
                          chooseSort({ ...listSort, conversations: value });
                        }}
                      >
                        {t(value === "name" ? "Name" : "Modified")}
                        {listSort.conversations === value ? <i className="ph ph-check check" /> : null}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            </div>
            {(!projectsCollapsed || visibleIds !== null) && projectGroups.map((group) => {
            const closed = closedGroups.has(group.dir) && visibleIds === null;
            const project = projectByDir.get(group.dir);
            const companions = project?.secondaryDirs ?? [];
            const folderTip = [
                  `[[${t("Main folder")}]]`,
                  group.dir,
                  ...(companions.length
                    ? [`[[${t("Companion folders")}]]`, ...companions]
                    : []),
                  ...(project?.name
                    ? [`[[${t("Project name")}]]`, project.name]
                    : []),
                ].join("\n");
            // Full paths only for a path-like query: parent folders the rail
            // never shows would otherwise match whole projects.
            const pathQuery = isPathQuery(railQuery);
            const folderHit = searchScope === "names" && visibleIds !== null &&
              quickFindScore(quickFindTerms(railQuery), [
                { text: group.label, weight: 10 },
                { text: pathQuery ? group.dir : null, weight: 3 },
                { text: (pathQuery ? companions : companions.map(folderLabel)).join(" "), weight: 2 },
              ]) > 0;
            const roots =
              visibleIds === null || folderHit
                ? group.roots
                : group.roots.filter((root) => visibleIds.has(root.sessionId));
            if (visibleIds !== null && roots.length === 0) return null;
            return (
              <div
                key={group.dir}
                className={dropTarget === group.dir ? "drop-target" : undefined}
                onDragOver={
                  local
                    ? (e) => {
                        e.preventDefault();
                        setDropTarget(group.dir);
                      }
                    : undefined
                }
                onDragLeave={
                  local
                    ? () =>
                        setDropTarget((prev) =>
                          prev === group.dir ? null : prev,
                        )
                    : undefined
                }
                onDrop={local ? (e) => dropSession(group.dir, e) : undefined}
              >
                <div className="group-row reveal-row">
                  <button
                    className={`group-label ws${closed ? " closed" : ""}`}
                    data-tip={folderTip}
                    onClick={() => toggleGroup(group.dir)}
                  >
                    <i className="ph ph-folder" />
                    <span className="group-name">{group.label}</span>
                  </button>
                  {local ? (
                    <div className="reveal-layer -fade">
                        <details
                          className="list-more group-folder-more"
                          onToggle={(event) => {
                            const details = event.currentTarget;
                            if (details.open) anchorMenuToSummary(details);
                            else unanchorMenu(details);
                          }}
                        >
                          <summary data-tip={t("Project actions")}>
                            <i className="ph ph-dots-three" />
                          </summary>
                          <div className="list-menu">
                            {hasNativeBridge() ? (
                              <button
                                onClick={(event) => {
                                  closeMenu(event);
                                  void revealPath(group.dir);
                                }}
                              >
                                <i className="ph ph-folder-open" />
                                {t("Show in file manager")}
                              </button>
                            ) : null}
                            <button
                              onClick={(event) => {
                                closeMenu(event);
                                void navigator.clipboard?.writeText(group.dir);
                              }}
                            >
                              <i className="ph ph-copy" />
                              {t("Copy folder path")}
                            </button>
                            <div className="sep" />
                            {project ? (
                              <button
                                onClick={(event) => {
                                  closeMenu(event);
                                  void addProjectFolder(project);
                                }}
                              >
                                <i className="ph ph-folder-plus" />
                                {t("Add a folder to this project")}
                              </button>
                            ) : null}
                            {project ? (
                              <button
                                onClick={(event) => {
                                  closeMenu(event);
                                  shell.openSettings("folders");
                                }}
                              >
                                <i className="ph ph-folders" />
                                {t("Manage folders in this project")}
                              </button>
                            ) : null}
                            <button
                              onClick={(event) => {
                                closeMenu(event);
                                removeFolder(
                                  group.dir,
                                  group.roots.map((root) => root.sessionId),
                                );
                              }}
                            >
                              <i className="ph ph-minus-circle" />
                              {t("Remove this project from the list")}
                            </button>
                          </div>
                        </details>
                      <button
                        className="group-add"
                        data-tip={t("New conversation in {label}", { label: group.label })}
                        onClick={() => startConversationIn(group.dir)}
                      >
                        <i className="ph ph-note-pencil" />
                      </button>
                    </div>
                  ) : null}
                </div>
                {!closed ? (
                  <SessionRootList
                    roots={roots}
                    tree={tree}
                    folderHit={folderHit}
                    visibleIds={visibleIds}
                    expanded={expandedGroups.has(group.dir)}
                    onToggleExpanded={() =>
                      setExpandedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.dir)) next.delete(group.dir);
                        else next.add(group.dir);
                        return next;
                      })
                    }
                    foldedFamilies={foldedFamilies}
                    onToggleFamily={toggleFamily}
                    onOpen={openSession}
                    draggable={local}
                    cap={GROUP_CAP}
                  />
                ) : null}
              </div>
            );
          })}
            {unlistedHits.length ? (
              <div className="search-related-hits">
                <div className="files-section-title">{t("Related matches")}</div>
                {unlistedHits.map((session) => {
                  const ancestor = nearestAncestor(session, sessionsById);
                  return (
                    <button key={session.sessionId} type="button" className="sess search-related-hit" data-find-attention="center" onClick={() => openContentHit(session)}>
                      <i className={`ph ${purposeIcon(session)}`} aria-hidden="true" />
                      <span><span className="s-title">{sessionTitle(session, app.sessionDisplayNames, app.sessions)}</span>
                        {ancestor ? <small>{t("From {title}", { title: sessionTitle(ancestor, app.sessionDisplayNames, app.sessions) })}</small> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {searchScope === "content" && railQuery.trim() && !contentIds && !contentSearchError ? <div className="rp-empty">{t("Searching conversations…")}</div> : null}
            {contentSearchError ? <div className="rp-empty">{contentSearchError}</div> : null}
            {visibleIds !== null && visibleIds.size === 0 && unlistedHits.length === 0 && (searchScope !== "content" || contentIds) && !contentSearchError ? <div className="rp-empty">{t("No matching conversations.")}</div> : null}
          </>
        )}
      </div>
    </div>
  );
}

function SessionNode({
  session,
  childrenByParent,
  indent,
  onOpen,
  draggable,
  foldedFamilies,
  onToggleFamily,
  visibleIds = null,
}: {
  session: SessionSummary;
  childrenByParent: Map<string, SessionSummary[]>;
  indent: number;
  onOpen: (id: string) => void;
  /** Rail filter result; null shows everything. */
  visibleIds?: Set<string> | null;
  draggable?: boolean;
  foldedFamilies: Set<string>;
  onToggleFamily: (id: string) => void;
}) {
  const app = useApp();
  const main = useMainView();
  const menu = useContextMenu();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const active = main.selectedCatalogSessionId === session.sessionId;
  const children = (childrenByParent.get(session.sessionId) ?? []).filter(
    (child) => visibleIds === null || visibleIds.has(child.sessionId),
  );
  // One source for every row, the open one included: the pushed activity.
  const state = sessionRowState(session.runStatus, main.sessionAlerts[session.sessionId]);
  const title = sessionTitle(session, app.sessionDisplayNames, app.sessions);
  const folded = visibleIds === null && foldedFamilies.has(session.sessionId);
  const familyCount = familyMembersOf(session, app.sessions).filter(
    (member) => !member.deletedAt,
  ).length;

  const exportMarkdown = async () => {
    try {
      const detail = await fetchSessionDetail(session.sessionId);
      downloadMarkdown(
        markdownFileName(title),
        sessionTranscriptToMarkdown(title, detail.transcript ?? []),
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const getSessionRoot = async () => {
    const detail = await fetchSessionDetail(session.sessionId);
    if (!detail.sessionRoot) throw new Error(t("Session folder is available in the desktop app."));
    return detail.sessionRoot;
  };
  const rename = () => {
    setRenameValue(app.sessionDisplayNames[session.sessionId]?.alias || title);
    setRenaming(true);
  };
  const promote = () => {
    void promoteToMainlineRequest(session.sessionId)
      .then(() => app.refreshSessions())
      .catch((error) => window.alert(error instanceof Error ? error.message : String(error)));
  };
  const copySessionFolder = () => {
    void getSessionRoot()
      .then(copyText)
      .catch((error) => window.alert(error instanceof Error ? error.message : String(error)));
  };
  const openSessionFolder = () => {
    void getSessionRoot()
      .then(revealPath)
      .catch((error) => window.alert(error instanceof Error ? error.message : String(error)));
  };
  const remove = () => app.requestConfirm({
    message: t("Delete this conversation?"),
    confirmLabel: t("Delete"),
    onConfirm: () => main.deleteSession(session.sessionId),
  });
  const removeFamily = () => app.requestConfirm({
    message: t("Delete all {count} conversations in this family?", {
      count: String(familyCount),
    }),
    confirmLabel: t("Delete entire family"),
    onConfirm: () => main.deleteSessionFamily(session.sessionId),
  });
  const contextItems = (): ContextMenuItem[] => [
    ...(canTakeMainline(session, app.sessions) ? [{
      label: t("Make this the main conversation"), icon: "ph-crown-simple", onSelect: promote,
    }] : []),
    { label: t("Rename"), icon: "ph-pencil-simple", onSelect: rename },
    { label: t("Duplicate"), icon: "ph-copy", onSelect: () => main.duplicateSession(session.sessionId) },
    { label: t("Delete"), icon: "ph-trash", danger: true, onSelect: remove },
    { label: t("Delete entire family"), icon: "ph-tree-structure", danger: true, onSelect: removeFamily },
    { label: t("Export Markdown"), icon: "ph-download-simple", separator: true, onSelect: () => void exportMarkdown() },
    { label: t("Copy Session ID"), icon: "ph-identification-card", onSelect: () => void copyText(session.sessionId) },
    ...(app.appMode === "local" ? [
      { label: t("Copy session folder path"), icon: "ph-copy", onSelect: copySessionFolder },
      ...(hasNativeBridge() ? [{ label: t("Open session folder"), icon: "ph-folder-open", onSelect: openSessionFolder }] : []),
    ] : []),
  ];

  return (
    <>
      <div className="session-row reveal-row">
        {!renaming && children.length ? (
          <button
            type="button"
            className={`family-fold${folded ? " folded" : ""}`}
            style={{ left: 8 + indent * 16 }}
            aria-label={folded ? t("Expand conversation family") : t("Collapse conversation family")}
            onClick={() => onToggleFamily(session.sessionId)}
          >
            <i className="ph ph-caret-down" aria-hidden="true" />
          </button>
        ) : null}
        {renaming ? (
          <form
            className="session-rename-inline"
            style={indent ? { marginLeft: 10 + indent * 16 } : undefined}
            onSubmit={(event) => {
              event.preventDefault();
              void main.renameSession(session.sessionId, renameValue).then((saved) =>
                saved && setRenaming(false),
              );
            }}
          >
            <input
              autoFocus
              aria-label={t("Conversation name")}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setRenaming(false);
              }}
            />
            <button type="button" data-tip={t("Cancel")} onClick={() => setRenaming(false)}>
              <i className="ph ph-x" />
            </button>
            <button type="submit" data-tip={t("Save")}>
              <i className="ph ph-check" />
            </button>
          </form>
        ) : (
          <button
            className={`sess${active ? " active" : ""}`}
            data-session-id={session.sessionId}
            data-find-attention="center"
            style={{ paddingLeft: 28 + indent * 16 }}
            onClick={() => onOpen(session.sessionId)}
            onContextMenu={(event) => menu.open(event, contextItems())}
            onKeyDown={(event) => {
              if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              menu.openAt(rect.left + 18, rect.bottom, contextItems(), event.currentTarget);
            }}
            data-tip={title}
            draggable={draggable}
            onDragStart={
              draggable
                ? (e) => {
                    e.dataTransfer.setData(
                      "text/alt-theory-session",
                      session.sessionId,
                    );
                    e.dataTransfer.effectAllowed = "move";
                  }
                : undefined
            }
          >
            {session.forkedFrom ? (
              isFamilyHead(session, app.sessions) ? (
                <i
                  className="ph ph-crown-simple s-fork"
                  aria-hidden
                  data-tip={t("Heads this family — its original main conversation was deleted")}
                />
              ) : (
              <i
                className={`ph ${purposeIcon(session)} s-fork`}
                aria-hidden
                data-tip={originTitle(session)}
              />
              )
            ) : session.delisted ? (
              <i
                className="ph ph-git-branch s-fork"
                aria-hidden
                data-tip={t("Former main conversation — demoted when a branch was promoted")}
              />
            ) : null}
            <span className="s-title">{title}</span>
            {state ? (
              <span className={`badge-run ${state.tone}`} data-tip={state.title}>
                {state.label}
              </span>
            ) : null}
          </button>
        )}
        {!renaming ? (
        <details
          className="list-more session-more reveal-layer -fade"
          onToggle={(event) => {
            const details = event.currentTarget;
            if (!details.open) {
              unanchorMenu(details);
              return;
            }
            anchorMenuToSummary(details);
          }}
        >
          <summary data-tip={t("Conversation actions")}>
            <i className="ph ph-dots-three" />
          </summary>
          <div className="list-menu">
            {canTakeMainline(session, app.sessions) ? (
              <button
                onClick={(e) => {
                  closeMenu(e);
                  promote();
                }}
                data-tip={t("This conversation takes the list spot; the current one stays available from its Related rail.")}
              >
                <i className="ph ph-crown-simple" />
                {t("Make this the main conversation")}
              </button>
            ) : null}
            <button
              onClick={(e) => {
                closeMenu(e);
                rename();
              }}
            >
              <i className="ph ph-pencil-simple" />
              {t("Rename")}
            </button>
            <button
              onClick={(e) => {
                closeMenu(e);
                main.duplicateSession(session.sessionId);
              }}
            >
              <i className="ph ph-copy" />
              {t("Duplicate")}
            </button>
            <button onClick={(event) => { closeMenu(event); remove(); }}>
              <i className="ph ph-trash" />
              {t("Delete")}
            </button>
            <button onClick={(event) => { closeMenu(event); removeFamily(); }}>
              <i className="ph ph-tree-structure" />
              {t("Delete entire family")}
            </button>
            <div className="sep" />
            <button
              onClick={(e) => {
                closeMenu(e);
                void exportMarkdown();
              }}
            >
              <i className="ph ph-download-simple" />
              {t("Export Markdown")}
            </button>
            <button onClick={(event) => { closeMenu(event); void copyText(session.sessionId); }}>
              <i className="ph ph-identification-card" />
              {t("Copy Session ID")}
            </button>
            {app.appMode === "local" ? (
              <>
                <button onClick={(event) => { closeMenu(event); copySessionFolder(); }}>
                  <i className="ph ph-copy" />
                  {t("Copy session folder path")}
                </button>
                {hasNativeBridge() ? (
                  <button onClick={(event) => { closeMenu(event); openSessionFolder(); }}>
                    <i className="ph ph-folder-open" />
                    {t("Open session folder")}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </details>
        ) : null}
      </div>
      {menu.element}
      {!folded && children.map((child) => (
        <SessionNode
          key={child.sessionId}
          session={child}
          childrenByParent={childrenByParent}
          indent={indent + 1}
          onOpen={onOpen}
          draggable={draggable}
          foldedFamilies={foldedFamilies}
          onToggleFamily={onToggleFamily}
          visibleIds={visibleIds}
        />
      ))}
    </>
  );
}
