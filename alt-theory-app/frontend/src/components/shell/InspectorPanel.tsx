import { useEffect, useMemo, useRef } from "react";
import { useApp } from "@/context/AppProvider";
import { useShell, type RailKey } from "@/context/ShellContext";
import { t } from "@/i18n";
import { sessionTitle } from "@/lib/sessionList";
import { ChildConversation } from "@/components/conversation/ChildConversation";
import { RecordsPanel } from "@/components/inspector/RecordsPanel";
import { ProvenancePanel } from "@/components/inspector/ProvenancePanel";
import { RuntimePanel } from "@/components/inspector/RuntimePanel";
import { WorkspaceTree } from "@/components/inspector/WorkspaceTree";
import { ChangesPanel } from "@/components/inspector/ChangesPanel";

const RAIL_META: Record<RailKey, { title: string; icon: string; adv?: boolean }> = {
  chats: { title: t("Related conversations"), icon: "ph-arrows-split" },
  changes: { title: t("Changes"), icon: "ph-pencil-simple-line" },
  workspace: { title: t("Files"), icon: "ph-folder" },
  records: { title: t("Records"), icon: "ph-scroll", adv: true },
  provenance: { title: t("Provenance"), icon: "ph-tree-structure", adv: true },
  runtime: { title: t("Runtime"), icon: "ph-pulse", adv: true },
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
        (s) =>
          s.forkedFrom?.sessionId === app.sessionId &&
          s.forkedFrom.purpose !== "ab-arm" &&
          !s.deletedAt
      ),
    [app.sessions, app.sessionId]
  );

  const title = shell.rightSub?.title ?? (active ? RAIL_META[active].title : "");

  // Opening a child panel is a one-shot per child id. It used to depend on
  // `app.sessions`, so every refreshSessions() (one per worker output) re-ran
  // it and slammed the panel back open on whatever child was last active.
  const openedChildRef = useRef<string | null>(null);
  useEffect(() => {
    const childId = app.activeRelatedSessionId;
    if (!childId) {
      openedChildRef.current = null;
      return;
    }
    if (openedChildRef.current === childId) return;
    openedChildRef.current = childId;
    shell.openRail("chats");
    shell.openSub({ key: `related:${childId}` });
  }, [app.activeRelatedSessionId, shell.openRail, shell.openSub]);

  return (
    <aside className={`right${open ? " open" : ""}`}>
      <div className="rpanel">
        {active ? (
          <div className={`head${shell.rightSub ? " sub" : ""}`}>
            {/* Collapse sits on the inner edge: on a narrow window the outer
                edge is the first thing to go off-screen. */}
            <button className="rp-close" onClick={shell.closeRight} title={t("Collapse")}>
              <i className="ph ph-sidebar-simple" style={{ transform: "scaleX(-1)" }} />
            </button>
            <button className="back" onClick={shell.closeSub} title={t("Back")}>
              <i className="ph ph-arrow-left" />
            </button>
            <span>{title}</span>
          </div>
        ) : null}
        <div className="body">
          {active === "chats" ? <RelatedConversations /> : null}
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
              approvalMarkers={app.approvalMarkers}
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

function RelatedConversations() {
  const app = useApp();
  const shell = useShell();
  const activeChildId = shell.rightSub?.key.startsWith("related:")
    ? shell.rightSub.key.slice("related:".length)
    : null;
  const children = useMemo(
    () =>
      app.sessions.filter(
        (s) =>
          s.forkedFrom?.sessionId === app.sessionId &&
          s.forkedFrom.purpose !== "ab-arm" &&
          !s.deletedAt
      ),
    [app.sessions, app.sessionId]
  );

  const PURPOSE_ICON: Record<string, string> = {
    side: "ph-arrows-split",
    helper: "ph-lifebuoy",
    "ab-arm": "ph-git-fork",
    fork: "ph-git-branch",
    worker: "ph-robot",
  };

  // Orientation when the open conversation is itself a branch/side/helper:
  // a way back to where it started, so a fresh fork never shows a dead end.
  const current = app.sessions.find((s) => s.sessionId === app.sessionId);
  const parent = current?.forkedFrom
    ? app.sessions.find(
        (s) => s.sessionId === current.forkedFrom?.sessionId && !s.deletedAt,
      )
    : undefined;

  // One row of small buttons, then the conversation itself: switching between
  // related conversations should not cost a round trip through a list.
  const switcher =
    children.length > 0 ? (
      <div className="child-switch">
        {children.map((child) => (
          <button
            key={child.sessionId}
            className={child.sessionId === activeChildId ? "on" : ""}
            title={sessionTitle(child, app.sessionDisplayNames)}
            onClick={() => {
              shell.openApp();
              app.setActiveRelatedSessionId(
                child.sessionId === activeChildId ? null : child.sessionId,
              );
              if (child.sessionId === activeChildId) shell.closeSub();
            }}
          >
            <i className={`ph ${PURPOSE_ICON[child.forkedFrom?.purpose ?? "side"]}`} />
            <span>{sessionTitle(child, app.sessionDisplayNames)}</span>
            {child.status === "incomplete" ? <span className="dot" /> : null}
          </button>
        ))}
      </div>
    ) : null;

  if (activeChildId) {
    return (
      <>
        {switcher}
        <ChildConversation
          sessionId={activeChildId}
          variant="panel"
          onClose={() => {
            app.setActiveRelatedSessionId(null);
            shell.closeSub();
          }}
        />
      </>
    );
  }

  const parentRow = parent ? (
    <button
      key="parent"
      className="sc-item"
      onClick={() => {
        shell.openApp();
        app.setActiveRelatedSessionId(null);
        app.openCatalogSession(parent.sessionId);
      }}
    >
      <div className="t">
        <i className="ph ph-arrow-u-up-left" />
        {sessionTitle(parent, app.sessionDisplayNames)}
      </div>
      <div className="d">{t("Where this branch started — go back anytime")}</div>
    </button>
  ) : null;

  if (children.length === 0) {
    return (
      <>
        {parentRow}
        <div className="rp-empty">
          {t("No related conversations. Use ")} <b>/branch</b> {t(" or ")} <b>/btw</b>, {t(" or open Helper.")}
        </div>
      </>
    );
  }

  return (
    <>
      {switcher}
      {parentRow}
      {children.map((child) => (
        <button
          key={child.sessionId}
          className="sc-item"
          onClick={() => {
            shell.openApp();
            app.setActiveRelatedSessionId(child.sessionId);
          }}
        >
          <div className="t">
            <i className={`ph ${PURPOSE_ICON[child.forkedFrom?.purpose ?? "side"]}`} />
            {sessionTitle(child, app.sessionDisplayNames)}
            {child.status === "incomplete" ? (
              <span className="badge-run">{t("running")}</span>
            ) : null}
          </div>
          <div className="d">
            {child.forkedFrom?.purpose === "helper"
              ? t("How Alt works, and fixing setup · fresh context")
              : child.forkedFrom?.purpose === "worker"
                ? t("Worker agent · {count} messages — you can join in", { count: child.messageCount ?? 0 })
                : child.forkedFrom?.purpose === "fork"
                  ? t("Branch · {count} messages", { count: child.messageCount ?? 0 })
                  : t("Side conversation · {count} messages", { count: child.messageCount ?? 0 })}
          </div>
        </button>
      ))}
    </>
  );
}
