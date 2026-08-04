import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionSummary } from "@/api/types";
import { useApp, type SessionAlert } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { t } from "@/i18n";
import {
  buildWorkspaceTree,
  canTakeMainline,
  folderLabel,
  listedOriginLabel,
  sessionTitle,
} from "@/lib/sessionList";
import { Workbench } from "@/components/shell/Workbench";
import { SessionImportDialog } from "@/components/shell/SessionImportDialog";
import { promoteToMainline as promoteToMainlineRequest } from "@/api/sessions";
import { hasNativeBridge, pickDirectory, revealPath } from "@/lib/native";
import { fetchSessionDetail } from "@/api/sessions";
import altTheoryMark from "@/assets/alt-theory-mark.svg";
import {
  downloadMarkdown,
  markdownFileName,
  sessionTranscriptToMarkdown,
} from "@/lib/sessionMarkdown";

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
      title={t("Conversations working right now")}
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
          title={t("Expand")}
          onClick={() => shell.setLeftCollapsed(false)}
        >
          <img className="brand-mark" src={altTheoryMark} alt="" />
        </button>
        <button
          title={t("New conversation")}
          onClick={() => {
            shell.openApp();
            app.startNewSession();
          }}
        >
          <i className="ph ph-plus" />
        </button>
        <button title={t("Search")} onClick={() => shell.setSearchOpen(true)}>
          <i className="ph ph-magnifying-glass" />
        </button>
        <div style={{ flex: 1 }} />
        <button
          title={t("Settings")}
          style={{ marginBottom: 10 }}
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
              title={t("Search")}
              onClick={() => shell.setSearchOpen(true)}
            >
              <i className="ph ph-magnifying-glass" />
            </button>
            <button
              className="icon-btn"
              title={t("Collapse")}
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
          <div
            className="avatar"
            title={
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
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const local = app.appMode === "local";
  // Newest N per folder so one busy folder can't bury the others (item 4b).
  const GROUP_CAP = 8;

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
    // with row A's Delete bound to it. Close them on any scroll.
    const closeAllMenus = () => {
      navRef.current
        ?.querySelectorAll<HTMLDetailsElement>("details.list-more[open]")
        .forEach((details) => {
          details.open = false;
        });
    };
    document.addEventListener("pointerdown", closeOpenMenus);
    document.addEventListener("scroll", closeAllMenus, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", closeOpenMenus);
      document.removeEventListener("scroll", closeAllMenus, {
        capture: true,
      });
    };
  }, []);

  const tree = useMemo(
    () => buildWorkspaceTree(app.sessions, local ? app.knownWorkspaces : []),
    [app.sessions, app.knownWorkspaces, local],
  );

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
        t("Its branches move with it."),
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
        t("Its branches move with it."),
        t("Alt will ask for permissions again in the new folder."),
        t("Files already on disk are not moved."),
      ],
      confirmLabel: t("Move"),
      checkbox: canMigrateFolder
        ? {
            label: t("Also move all {count} conversations in \"{folder}\"", { count: siblings.length + 1, folder: folderLabel(sourceDir) }),
            defaultChecked: true,
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
                  title={app.workspacePrimaryDir ?? t("No working folder")}
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
                      title={dir}
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
                title={t("New conversation")}
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
                    title={group.dir || undefined}
                    onClick={() => toggleGroup(group.dir)}
                  >
                    <i className="ph ph-folder-simple" />
                    <span className="group-name">{group.label}</span>
                    <i className="ph ph-caret-down tw" />
                  </button>
                  {local && group.dir ? (
                    <details className="list-more group-folder-more">
                      <summary title={t("Working folder actions")}>
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
                      title={t("New conversation in {label}", { label: group.label })}
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
}: {
  session: SessionSummary;
  childrenByParent: Map<string, SessionSummary[]>;
  indent: number;
  onOpen: (id: string) => void;
  draggable?: boolean;
}) {
  const app = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  return (
    <>
      <div className="session-row">
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
            <button type="button" title={t("Cancel")} onClick={() => setRenaming(false)}>
              <i className="ph ph-x" />
            </button>
            <button type="submit" title={t("Save")}>
              <i className="ph ph-check" />
            </button>
          </form>
        ) : (
          <button
            className={`sess${active ? " active" : ""}`}
            data-session-id={session.sessionId}
            style={indent ? { paddingLeft: 10 + indent * 16 } : undefined}
            onClick={() => onOpen(session.sessionId)}
            title={title}
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
                title={originTitle(session)}
              />
            ) : session.delisted ? (
              <i
                className="ph ph-git-branch s-fork"
                aria-hidden
                title={t("Former main conversation — demoted when a branch was promoted")}
              />
            ) : null}
            <span className="s-title">{title}</span>
            {state ? (
              <span className={`badge-run ${state.tone}`} title={state.title}>
                {state.label}
              </span>
            ) : null}
          </button>
        )}
        {!renaming ? (
        <details
          className="list-more session-more"
          onToggle={(event) => {
            if (!event.currentTarget.open) setConfirmDelete(false);
          }}
        >
          <summary title={t("Conversation actions")}>
            <i className="ph ph-dots-three" />
          </summary>
          <div className="list-menu">
            {canTakeMainline(session, app.sessions) ? (
              <button
                onClick={(e) => {
                  closeMenu(e);
                  void promoteToMainlineRequest(session.sessionId)
                    .then(() => app.refreshSessions())
                    .catch((error) =>
                      window.alert(
                        error instanceof Error ? error.message : String(error),
                      ),
                    );
                }}
                title={t("This conversation takes the list spot; the current one stays available from its Related rail.")}
              >
                <i className="ph ph-crown-simple" />
                {t("Make this the main conversation")}
              </button>
            ) : null}
            <button
              onClick={(e) => {
                closeMenu(e);
                setRenameValue(app.sessionDisplayNames[session.sessionId]?.alias || title);
                setRenaming(true);
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
            <button
              onClick={(e) => {
                closeMenu(e);
                void exportMarkdown();
              }}
            >
              <i className="ph ph-download-simple" />
              {t("Export Markdown")}
            </button>
            {confirmDelete ? (
              <div className="list-menu-confirm">
                <button onClick={() => setConfirmDelete(false)}>{t("Cancel")}</button>
                <button
                  className="danger"
                  onClick={(event) => {
                    closeMenu(event);
                    app.deleteSelectedSession(session.sessionId);
                  }}
                >
                  {t("Delete")}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}>
                <i className="ph ph-trash" />
                {t("Delete")}
              </button>
            )}
          </div>
        </details>
        ) : null}
      </div>
      {children.map((child) => (
        <SessionNode
          key={child.sessionId}
          session={child}
          childrenByParent={childrenByParent}
          indent={indent + 1}
          onOpen={onOpen}
          draggable={draggable}
        />
      ))}
    </>
  );
}
