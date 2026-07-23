import { useMemo, useState } from "react";
import type { SessionSummary } from "@/api/types";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import {
  buildWorkspaceTree,
  folderLabel,
  sessionTitle,
} from "@/lib/sessionList";
import { Workbench } from "@/components/shell/Workbench";
import { SessionImportDialog } from "@/components/shell/SessionImportDialog";

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
          title="Expand"
          onClick={() => shell.setLeftCollapsed(false)}
        >
          A
        </button>
        <button
          title="New conversation"
          onClick={() => {
            shell.openApp();
            app.startNewSession();
          }}
        >
          <i className="ph ph-plus" />
        </button>
        <button title="Search" onClick={() => shell.setSearchOpen(true)}>
          <i className="ph ph-magnifying-glass" />
        </button>
        <div style={{ flex: 1 }} />
        <button
          title="Settings"
          style={{ marginBottom: 10 }}
          onClick={() => shell.openSettings()}
        >
          <i className="ph ph-gear" />
        </button>
      </div>

      <div
        className="full"
        style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
      >
        <div className="left-head">
          <span className="wordmark">Alt Theory</span>
          <div className="icons">
            <button
              className="icon-btn"
              title="Search"
              onClick={() => shell.setSearchOpen(true)}
            >
              <i className="ph ph-magnifying-glass" />
            </button>
            <button
              className="icon-btn"
              title="Collapse"
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
            Settings
          </button>
          <div className="avatar" title={app.auth.displayLabel ?? undefined}>
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
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const local = app.appMode === "local";

  const tree = useMemo(
    () => buildWorkspaceTree(app.sessions, local ? app.knownWorkspaces : []),
    [app.sessions, app.knownWorkspaces, local]
  );

  const workspaceDirs = useMemo(() => {
    const dirs = new Set(app.knownWorkspaces);
    for (const session of app.sessions) {
      if (session.workspacePrimaryDir) dirs.add(session.workspacePrimaryDir);
    }
    return [...dirs].sort((a, b) =>
      folderLabel(a).localeCompare(folderLabel(b))
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

  const addFolder = async () => {
    // ponytail: window.prompt for the path; upgrade path is the Electron
    // native directory picker when bundle work resumes.
    const path = window.prompt("Full path of the working folder to add:");
    if (!path?.trim()) return;
    try {
      await app.addKnownWorkspace(path.trim());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const dropSession = (dir: string, event: React.DragEvent) => {
    event.preventDefault();
    setDropTarget(null);
    const sessionId = event.dataTransfer.getData("text/alt-theory-session");
    if (!sessionId) return;
    const target = dir || null;
    const label = target ? folderLabel(target) : "no working folder";
    app.requestConfirm({
      message: `Move this conversation to work in "${label}"? Alt will ask for permissions again in the new folder. Files already on disk are not moved.`,
      confirmLabel: "Move",
      onConfirm: () => {
        void app.repointSession(sessionId, target).catch((error) => {
          window.alert(error instanceof Error ? error.message : String(error));
        });
      },
    });
  };

  return (
    <div
      className="user-nav"
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      <div className="pad">
        <div className="new-row">
          {local ? (
            <div className="split-new">
              <details className="list-more ws-pick">
                <summary
                  title={app.workspacePrimaryDir ?? "No working folder"}
                >
                  <i className="ph ph-folder-simple" />
                  <span className="ws-label">
                    {app.workspacePrimaryDir
                      ? folderLabel(app.workspacePrimaryDir)
                      : "No folder"}
                  </span>
                  <i className="ph ph-caret-down caret" />
                </summary>
                <div className="list-menu">
                  <button
                    onClick={(e) => {
                      e.currentTarget.closest("details")?.removeAttribute("open");
                      app.setDraftWorkspace(null);
                    }}
                  >
                    <i className="ph ph-prohibit" />
                    No folder
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
                        app.setDraftWorkspace(dir);
                      }}
                    >
                      <i className="ph ph-folder-simple" />
                      {folderLabel(dir)}
                      {app.workspacePrimaryDir === dir ? (
                        <i className="ph ph-check check" />
                      ) : null}
                    </button>
                  ))}
                  <div className="sep" />
                  <button
                    onClick={(e) => {
                      e.currentTarget.closest("details")?.removeAttribute("open");
                      void addFolder();
                    }}
                  >
                    <i className="ph ph-plus" />
                    Add working folder…
                  </button>
                </div>
              </details>
              <button
                className="btn-new split-plus"
                title="New conversation"
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
              New conversation
            </button>
          )}
          {local ? (
            <details className="list-more">
              <summary title="More">
                <i className="ph ph-dots-three" />
              </summary>
              <div className="list-menu">
                <button
                  onClick={(e) => {
                    e.currentTarget.closest("details")?.removeAttribute("open");
                    onImport();
                  }}
                >
                  <i className="ph ph-download-simple" />
                  Import conversations…
                </button>
              </div>
            </details>
          ) : null}
        </div>
      </div>
      <div className="sessions">
        {app.sessionsLoading && app.sessions.length === 0 ? (
          <div className="rp-empty">Loading conversations…</div>
        ) : app.sessionsError && app.sessions.length === 0 ? (
          <div className="rp-empty">{app.sessionsError}</div>
        ) : tree.groups.length === 0 ? (
          <div className="rp-empty">No conversations yet.</div>
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
                          prev === group.dir ? null : prev
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
                    {group.label}
                    <i className="ph ph-caret-down tw" />
                  </button>
                  {local ? (
                    <button
                      className="group-add"
                      title={`New conversation in ${group.label}`}
                      onClick={() => startConversationIn(group.dir || null)}
                    >
                      <i className="ph ph-plus" />
                    </button>
                  ) : null}
                </div>
                {!closed && group.roots.length === 0 ? (
                  <div className="rp-empty ws-empty">No conversations yet.</div>
                ) : null}
                {!closed &&
                  group.roots.map((root) => (
                    <SessionNode
                      key={root.sessionId}
                      session={root}
                      childrenByParent={tree.childrenByParent}
                      indent={0}
                      onOpen={openSession}
                      draggable={local}
                    />
                  ))}
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
  const active = app.selectedCatalogSessionId === session.sessionId;
  const children = childrenByParent.get(session.sessionId) ?? [];
  const running = session.status === "incomplete";

  return (
    <>
      <button
        className={`sess${active ? " active" : ""}`}
        style={indent ? { paddingLeft: 10 + indent * 16 } : undefined}
        onClick={() => onOpen(session.sessionId)}
        title={sessionTitle(session, app.sessionDisplayNames)}
        draggable={draggable}
        onDragStart={
          draggable
            ? (e) => {
                e.dataTransfer.setData(
                  "text/alt-theory-session",
                  session.sessionId
                );
                e.dataTransfer.effectAllowed = "move";
              }
            : undefined
        }
      >
        {session.forkedFrom ? (
          <i className="ph ph-git-branch s-fork" aria-hidden />
        ) : null}
        <span className="s-title">
          {sessionTitle(session, app.sessionDisplayNames)}
        </span>
        {running ? <span className="badge-run">running</span> : null}
      </button>
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
