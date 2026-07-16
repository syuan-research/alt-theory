import { useMemo, useState } from "react";
import type { SessionSummary } from "@/api/types";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { buildSessionTree, sessionTitle } from "@/lib/sessionList";
import { Workbench } from "@/components/shell/Workbench";

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

        <UserNav />
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
    </aside>
  );
}

function UserNav() {
  const app = useApp();
  const shell = useShell();
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());

  const projectNames = useMemo(
    () =>
      new Map(
        (app.discovery?.projects ?? []).map((p) => [p.projectId, p.displayName])
      ),
    [app.discovery?.projects]
  );

  const tree = useMemo(
    () => buildSessionTree(app.sessions, projectNames),
    [app.sessions, projectNames]
  );

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

  return (
    <div
      className="user-nav"
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      <div className="pad">
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
      </div>
      <div className="sessions">
        {app.sessionsLoading ? (
          <div className="rp-empty">Loading conversations…</div>
        ) : tree.groups.length === 0 ? (
          <div className="rp-empty">No conversations yet.</div>
        ) : (
          tree.groups.map((group) => {
            const closed = closedGroups.has(group.projectId);
            return (
              <div key={group.projectId || "unassigned"}>
                <button
                  className={`group-label ws${closed ? " closed" : ""}`}
                  onClick={() => toggleGroup(group.projectId)}
                >
                  <i className="ph ph-folder-simple" />
                  {group.label}
                  <i className="ph ph-caret-down tw" />
                </button>
                {!closed &&
                  group.roots.map((root) => (
                    <SessionNode
                      key={root.sessionId}
                      session={root}
                      childrenByParent={tree.childrenByParent}
                      indent={0}
                      onOpen={openSession}
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
}: {
  session: SessionSummary;
  childrenByParent: Map<string, SessionSummary[]>;
  indent: number;
  onOpen: (id: string) => void;
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
        />
      ))}
    </>
  );
}
