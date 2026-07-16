import { useMemo } from "react";
import { useApp } from "@/context/AppProvider";
import { useShell, type RailKey } from "@/context/ShellContext";
import { sessionTitle } from "@/lib/sessionList";
import { RecordsPanel } from "@/components/inspector/RecordsPanel";
import { ProvenancePanel } from "@/components/inspector/ProvenancePanel";
import { RuntimePanel } from "@/components/inspector/RuntimePanel";
import { WorkspaceTree } from "@/components/inspector/WorkspaceTree";
import { ChangesPanel } from "@/components/inspector/ChangesPanel";

const RAIL_META: Record<RailKey, { title: string; icon: string; adv?: boolean }> = {
  chats: { title: "Side chats", icon: "ph-arrows-split" },
  changes: { title: "Changes", icon: "ph-pencil-simple-line" },
  workspace: { title: "Workspace", icon: "ph-folder" },
  records: { title: "Records", icon: "ph-scroll", adv: true },
  provenance: { title: "Provenance", icon: "ph-tree-structure", adv: true },
  runtime: { title: "Runtime", icon: "ph-pulse", adv: true },
};

const PRIMARY: RailKey[] = ["chats", "changes", "workspace"];
const ADVANCED: RailKey[] = ["records", "provenance", "runtime"];

export function InspectorPanel() {
  const app = useApp();
  const shell = useShell();
  const advanced = app.viewMode === "researcher";
  const open = shell.rightPanel !== null;
  const active = shell.rightPanel;

  // Side-chat notification dot: any live child hanging off this conversation.
  const hasSideChats = useMemo(
    () =>
      app.sessions.some(
        (s) => s.forkedFrom?.sessionId === app.sessionId && !s.deletedAt
      ),
    [app.sessions, app.sessionId]
  );

  const title = shell.rightSub?.title ?? (active ? RAIL_META[active].title : "");

  return (
    <aside className={`right${open ? " open" : ""}`}>
      <div className="rpanel">
        {active ? (
          <div className={`head${shell.rightSub ? " sub" : ""}`}>
            <button className="back" onClick={shell.closeSub} title="Back">
              <i className="ph ph-arrow-left" />
            </button>
            <span>{title}</span>
            <button className="rp-close" onClick={shell.closeRight} title="Collapse">
              <i className="ph ph-sidebar-simple" style={{ transform: "scaleX(-1)" }} />
            </button>
          </div>
        ) : null}
        <div className="body">
          {active === "chats" ? <SideChats /> : null}
          {active === "changes" ? <ChangesPanel /> : null}
          {active === "workspace" ? <WorkspaceTree /> : null}
          {active === "records" ? (
            <RecordsPanel
              sessionId={app.sessionId}
              sessionReady={app.sessionReady}
              tabActive
            />
          ) : null}
          {active === "provenance" ? (
            <ProvenancePanel
              sessionId={app.sessionId}
              sessionReady={app.sessionReady}
              discovery={app.discovery}
              tabActive
            />
          ) : null}
          {active === "runtime" ? (
            <RuntimePanel
              sessionId={app.sessionId}
              connStatus={app.connStatus}
              connLabel={app.connLabel}
              manifest={app.manifest}
              currentDomain={app.selectors.currentDomain}
              metrics={app.metrics}
              discovery={app.discovery}
              onRefresh={() => {
                app.requestMetadata();
                app.requestMetrics();
              }}
              disabled={!app.sessionReady || !app.wsConnected}
            />
          ) : null}
        </div>
      </div>
      <div className="rail">
        {PRIMARY.map((key) => (
          <button
            key={key}
            className={active === key ? "on" : ""}
            title={RAIL_META[key].title}
            onClick={() => shell.toggleRail(key)}
          >
            <i className={`ph ${RAIL_META[key].icon}`} />
            {key === "chats" && hasSideChats ? <span className="dot" /> : null}
          </button>
        ))}
        {advanced
          ? ADVANCED.map((key) => (
              <button
                key={key}
                className={active === key ? "on" : ""}
                title={RAIL_META[key].title}
                onClick={() => shell.toggleRail(key)}
              >
                <i className={`ph ${RAIL_META[key].icon}`} />
              </button>
            ))
          : null}
      </div>
    </aside>
  );
}

function SideChats() {
  const app = useApp();
  const shell = useShell();
  const children = useMemo(
    () =>
      app.sessions.filter(
        (s) => s.forkedFrom?.sessionId === app.sessionId && !s.deletedAt
      ),
    [app.sessions, app.sessionId]
  );

  const PURPOSE_ICON: Record<string, string> = {
    side: "ph-arrows-split",
    helper: "ph-lifebuoy",
    "ab-arm": "ph-git-fork",
    fork: "ph-git-branch",
  };

  if (children.length === 0) {
    return (
      <div className="rp-empty">
        No side chats. Use <b>/branch</b> or the + menu to start one.
      </div>
    );
  }

  return (
    <>
      {children.map((child) => (
        <button
          key={child.sessionId}
          className="sc-item"
          onClick={() => {
            shell.openApp();
            app.openCatalogSession(child.sessionId);
          }}
        >
          <div className="t">
            <i className={`ph ${PURPOSE_ICON[child.forkedFrom?.purpose ?? "side"]}`} />
            {sessionTitle(child, app.sessionDisplayNames)}
            {child.status === "incomplete" ? (
              <span className="badge-run">running</span>
            ) : null}
          </div>
          <div className="d">
            {child.forkedFrom?.purpose === "helper"
              ? "Ask how Alt works · fresh context"
              : `Forked from this conversation · ${child.messageCount ?? 0} messages`}
          </div>
        </button>
      ))}
    </>
  );
}
