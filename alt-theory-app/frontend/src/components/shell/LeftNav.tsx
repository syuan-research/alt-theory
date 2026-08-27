import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionSummary } from "@/api/types";
import { useApp, type SessionAlert } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { t } from "@/i18n";
import {
  buildWorkspaceTree,
  canTakeMainline,
  familyMembersOf,
  folderLabel,
  isFamilyHead,
  listedOriginLabel,
  sessionTitle,
} from "@/lib/sessionList";
import { Workbench } from "@/components/shell/Workbench";
import { SessionImportDialog } from "@/components/shell/SessionImportDialog";
import { HelpMenu } from "@/components/shell/HelpMenu";
import { scrollAffectsAnchor, useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import { promoteToMainline as promoteToMainlineRequest } from "@/api/sessions";
import { hasNativeBridge, pickDirectory, revealPath } from "@/lib/native";
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

export function LeftNav() {
  const app = useApp();
  const shell = useShell();
  const avatarLetter = (
    app.auth.displayLabel ||
    app.auth.accountId ||
    "A"
  )
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <aside className="left">
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
          data-tip={t("New conversation")}
          onClick={() => {
            shell.openApp();
            app.startNewSession();
          }}
        >
          <i className="ph ph-plus" />
        </button>
        <button data-tip={t("Search")} onClick={() => shell.setSearchOpen(true)}>
          <i className="ph ph-magnifying-glass" />
        </button>
        <div style={{ flex: 1 }} />
        <button
          data-tip={t("Settings")}
          onClick={() => shell.openSettings()}
        >
          <i className="ph ph-gear" />
        </button>
        <HelpMenu compact />
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
                ? t("Local mode — no account")
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

function UserNav({ onImport }: { onImport: () => void }) {
  const app = useApp();
  const shell = useShell();
  const navRef = useRef<HTMLDivElement>(null);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [foldedFamilies, setFoldedFamilies] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [listSort, setListSort] = useState<SessionListSort>({
    folders: "name",
    conversations: "modified",
  });
  const local = app.appMode === "local";
  const GROUP_CAP = 4;

  useEffect(() => {
    if (!local) return;
    void getSessionListSort().then(setListSort);
  }, [local]);

  useEffect(() => {
    const closeOpenMenus = (event: PointerEvent) => {
      navRef.current
        ?.querySelectorAll<HTMLDetailsElement>("details.list-more[open]")
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
        "details.list-more[open]",
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
      ),
    [app.sessions, app.knownWorkspaces, app.sessionDisplayNames, listSort, local],
  );

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
    app.openCatalogSession(id);
  };

  const startConversationIn = (dir: string | null) => {
    app.setDraftWorkspace(dir);
    shell.openApp();
    app.startNewSession();
  };

  // Header folder selector. With a conversation open this must MOVE that
  // conversation (server re-point: permissions + file tree rebuild in the new
  // folder) — a draft-only change would leave the UI claiming a workspace the
  // session never got. Without a session it stays the draft picker for the
  // next conversation.
  const chooseFolder = (dir: string | null) => {
    if (!app.sessionId) {
      app.setDraftWorkspace(dir);
      return;
    }
    if ((dir ?? "") === (app.workspacePrimaryDir ?? "")) return;
    const label = dir ? folderLabel(dir) : t("no working folder");
    app.requestConfirm({
      message: t("Move this conversation to work in \"{label}\"?", { label }),
      details: [
        t("Its whole family moves with it — branches and attached conversations always share one working folder."),
        t("Alt will ask for permissions again in the new folder."),
        t("Files already on disk are not moved."),
      ],
      confirmLabel: t("Move"),
      onConfirm: () => {
        void app
          .repointSession(app.sessionId as string, dir)
          .catch((error) =>
            window.alert(error instanceof Error ? error.message : String(error)),
          );
      },
    });
  };

  const addFolder = async () => {
    const path = await pickDirectory("Full path of the working folder to add:");
    if (!path) return;
    try {
      await app.addKnownWorkspace(path);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const removeFolder = (dir: string, sessionIds: string[]) => {
    const finish = async () => {
      if (app.workspacePrimaryDir === dir) app.setDraftWorkspace(null);
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
    app.requestConfirm({
      message:
        t("Move this folder's conversations to No folder, then remove the working folder from the list? Conversations and files are not deleted."),
      confirmLabel: t("Move conversations and remove"),
      cancelLabel: t("Keep working folder"),
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
    const label = target ? folderLabel(target) : t("no working folder");

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
        t("Its whole family moves with it — branches and attached conversations always share one working folder."),
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
    >
      <div className="pad">
        <div className="new-row">
          {local ? (
            <div className="split-new">
              <details className="list-more ws-pick">
                <summary
                  data-tip={app.workspacePrimaryDir ?? t("No working folder")}
                >
                  <i className="ph ph-folder-simple" />
                  <span className="ws-label">
                    {app.workspacePrimaryDir
                      ? folderLabel(app.workspacePrimaryDir)
                      : t("No folder")}
                  </span>
                  <i className="ph ph-caret-down caret" />
                </summary>
                <div className="list-menu">
                  <button
                    onClick={(e) => {
                      closeMenu(e);
                      void addFolder();
                    }}
                  >
                    <i className="ph ph-folder-plus" />
                    {t("Add working folder…")}
                  </button>
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
                    <i className="ph ph-prohibit" />
                    {t("No folder")}
                    {!app.workspacePrimaryDir ? (
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
                      <i className="ph ph-folder-simple" />
                      {folderLabel(dir)}
                      {app.workspacePrimaryDir === dir ? (
                        <i className="ph ph-check check" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </details>
              <button
                className="btn-new split-plus"
                data-tip={t("New conversation")}
                onClick={() => {
                  shell.openApp();
                  app.startNewSession();
                }}
              >
                <i className="ph ph-plus" />
              </button>
            </div>
          ) : (
            <button
              className="btn-new"
              onClick={() => {
                shell.openApp();
                app.startNewSession();
              }}
            >
              <i className="ph ph-plus" />
              {t("New conversation")}
            </button>
          )}
        </div>
        <RunningCount sessions={app.sessions} />
      </div>
      <div className="workspace-list-head">
        <span>{t("Working folders")}</span>
        <div className="workspace-list-actions">
          <button
            type="button"
            data-tip={t("Search")}
            aria-label={t("Search")}
            onClick={() => shell.setSearchOpen(true)}
          >
            <i className="ph ph-magnifying-glass" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-tip={t("Collapse all working folders")}
            aria-label={t("Collapse all working folders")}
            onClick={() => setClosedGroups(new Set(tree.groups.map((group) => group.dir)))}
          >
            <i className="ph ph-arrows-in-line-vertical" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-tip={t("Expand all working folders")}
            aria-label={t("Expand all working folders")}
            onClick={() => setClosedGroups(new Set())}
          >
            <i className="ph ph-arrows-out-line-vertical" aria-hidden="true" />
          </button>
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
      <div className="sessions">
        {app.sessionsLoading && app.sessions.length === 0 ? (
          <div className="rp-empty">{t("Loading conversations…")}</div>
        ) : app.sessionsError && app.sessions.length === 0 ? (
          <div className="rp-empty">{app.sessionsError}</div>
        ) : tree.groups.length === 0 ? (
          <div className="rp-empty">{t("No conversations yet.")}</div>
        ) : (
          tree.groups.map((group) => {
            const closed = closedGroups.has(group.dir);
            return (
              <div
                key={group.dir || "no-folder"}
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
                <div className="group-row">
                  <button
                    className={`group-label ws${closed ? " closed" : ""}`}
                    data-tip={group.dir || undefined}
                    onClick={() => toggleGroup(group.dir)}
                  >
                    <i className="ph ph-folder-simple" />
                    <span className="group-name">{group.label}</span>
                    <i className="ph ph-caret-down tw" />
                  </button>
                  {local && group.dir ? (
                    <details
                      className="list-more group-folder-more"
                      onToggle={(event) => {
                        const details = event.currentTarget;
                        if (details.open) anchorMenuToSummary(details);
                        else unanchorMenu(details);
                      }}
                    >
                      <summary data-tip={t("Working folder actions")}>
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
                          {t("Remove from working folders")}
                        </button>
                      </div>
                    </details>
                  ) : null}
                  {local ? (
                    <button
                      className="group-add"
                      data-tip={t("New conversation in {label}", { label: group.label })}
                      onClick={() => startConversationIn(group.dir || null)}
                    >
                      <i className="ph ph-plus" />
                    </button>
                  ) : null}
                </div>
                {!closed && group.roots.length === 0 ? (
                  <div className="rp-empty ws-empty">{t("No conversations yet.")}</div>
                ) : null}
                {!closed &&
                  (expandedGroups.has(group.dir)
                    ? group.roots
                    : group.roots.slice(0, GROUP_CAP)
                  ).map((root) => (
                    <SessionNode
                      key={root.sessionId}
                      session={root}
                      childrenByParent={tree.childrenByParent}
                      indent={0}
                      onOpen={openSession}
                      draggable={local}
                      foldedFamilies={foldedFamilies}
                      onToggleFamily={toggleFamily}
                    />
                  ))}
                {!closed && group.roots.length > GROUP_CAP ? (
                  <button
                    className="group-more"
                    onClick={() =>
                      setExpandedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.dir)) next.delete(group.dir);
                        else next.add(group.dir);
                        return next;
                      })
                    }
                  >
                    {expandedGroups.has(group.dir)
                      ? t("Show less")
                      : t("Show all ({count})", { count: group.roots.length })}
                  </button>
                ) : null}
              </div>
            );
          })
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
}: {
  session: SessionSummary;
  childrenByParent: Map<string, SessionSummary[]>;
  indent: number;
  onOpen: (id: string) => void;
  draggable?: boolean;
  foldedFamilies: Set<string>;
  onToggleFamily: (id: string) => void;
}) {
  const app = useApp();
  const menu = useContextMenu();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const active = app.selectedCatalogSessionId === session.sessionId;
  const children = childrenByParent.get(session.sessionId) ?? [];
  // The active session's own run state is live in the app, ahead of the poll.
  const runStatus =
    app.sessionId === session.sessionId && app.isRunning
      ? "running"
      : session.runStatus;
  const state = sessionRowState(runStatus, app.sessionAlerts[session.sessionId]);
  const title = sessionTitle(session, app.sessionDisplayNames, app.sessions);
  const folded = foldedFamilies.has(session.sessionId);
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
    onConfirm: () => app.deleteSelectedSession(session.sessionId),
  });
  const removeFamily = () => app.requestConfirm({
    message: t("Delete all {count} conversations in this family?", {
      count: String(familyCount),
    }),
    confirmLabel: t("Delete entire family"),
    onConfirm: () => app.deleteSessionFamily(session.sessionId),
  });
  const contextItems = (): ContextMenuItem[] => [
    ...(canTakeMainline(session, app.sessions) ? [{
      label: t("Make this the main conversation"), icon: "ph-crown-simple", onSelect: promote,
    }] : []),
    { label: t("Rename"), icon: "ph-pencil-simple", onSelect: rename },
    { label: t("Duplicate"), icon: "ph-copy", onSelect: () => app.duplicateSession(session.sessionId) },
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
      <div className="session-row">
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
              void app.renameSelectedSession(session.sessionId, renameValue).then((saved) =>
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
                className={`ph ${
                  session.forkedFrom.purpose === "subagent"
                    ? "ph-robot"
                    : session.forkedFrom.purpose === "helper"
                      ? "ph-lifebuoy"
                      : session.forkedFrom.purpose === "side"
                        ? "ph-arrows-split"
                        : "ph-git-branch"
                } s-fork`}
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
          className="list-more session-more"
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
                app.duplicateSession(session.sessionId);
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
        />
      ))}
    </>
  );
}
