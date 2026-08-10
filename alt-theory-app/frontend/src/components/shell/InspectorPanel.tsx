import { useEffect, useMemo, useRef } from "react";
import { useApp } from "@/context/AppProvider";
import { useShell, type RailKey } from "@/context/ShellContext";
import { t } from "@/i18n";
import { shouldClearRelatedOnSubChange } from "@/lib/relatedOpen";
import { relatedConversationsFor, sessionTitle } from "@/lib/sessionList";
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
  // `app.sessions`, so every refreshSessions() (one per subagent output) re-ran
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

    // Width depends on conversation kind (branch/edit ≈ 50%; btw/helper default).
    // Prefer the explicit hint from branch_created / related_session_created;
    // when the user picks from the switcher, fall back to purpose on the summary.
    let size = app.relatedPaneSize;
    if (!size) {
      const child = app.sessions.find((s) => s.sessionId === childId);
      const purpose = child?.forkedFrom?.purpose;
      // Branch/edit only: half work area. Subagent / btw / helper: default ~480.
      size = purpose === "fork" ? "half" : "default";
    }
    shell.setRightPaneForRelated(size);
    shell.openRail("chats");
    shell.openSub({ key: `related:${childId}` });
  }, [
    app.activeRelatedSessionId,
    app.relatedPaneSize,
    app.sessions,
    shell.openRail,
    shell.openSub,
    shell.setRightPaneForRelated,
  ]);

  // Back / closeRight / openRail only clear rightSub. When we *leave* a related
  // sub (transition related:* → not), clear app.activeRelatedSessionId too so
  // re-clicking the same child re-runs open (setState same id is a no-op and
  // openedChildRef would early-return). Transition-only: do not clear on open.
  const prevRightSubRef = useRef(shell.rightSub);
  useEffect(() => {
    const prev = prevRightSubRef.current;
    prevRightSubRef.current = shell.rightSub;
    if (!shouldClearRelatedOnSubChange(prev?.key, shell.rightSub?.key)) return;
    openedChildRef.current = null;
    if (app.activeRelatedSessionId) app.setActiveRelatedSessionId(null);
  }, [shell.rightSub, app.activeRelatedSessionId, app.setActiveRelatedSessionId]);

  const leaveRelated = () => {
    app.setActiveRelatedSessionId(null);
    shell.closeSub();
  };

  return (
    <aside className={`right${open ? " open" : ""}`}>
      <div className="rpanel">
        {active ? (
          <div className={`head${shell.rightSub ? " sub" : ""}`}>
            {/* Collapse sits on the inner edge: on a narrow window the outer
                edge is the first thing to go off-screen. */}
            <button
              className="rp-close"
              onClick={() => {
                app.setActiveRelatedSessionId(null);
                shell.closeRight();
              }}
              title={t("Collapse")}
            >
              <i className="ph ph-sidebar-simple" style={{ transform: "scaleX(-1)" }} />
            </button>
            <button className="back" onClick={leaveRelated} title={t("Back")}>
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
  // Ancestors first (root → parent — a child always sees its parent), then
  // children and the family-wide attached pass; rules in sessionList.ts.
  const { ancestors, others } = useMemo(
    () =>
      app.sessionId
        ? relatedConversationsFor(app.sessionId, app.sessions)
        : { ancestors: [], others: [] },
    [app.sessions, app.sessionId],
  );
  const children = useMemo(
    () => [...ancestors, ...others],
    [ancestors, others],
  );
  const parentId = ancestors.at(-1)?.sessionId;
  const ancestorIds = useMemo(
    () => new Set(ancestors.map((s) => s.sessionId)),
    [ancestors],
  );

  const PURPOSE_ICON: Record<string, string> = {
    side: "ph-arrows-split",
    helper: "ph-lifebuoy",
    "ab-arm": "ph-git-fork",
    fork: "ph-git-branch",
    subagent: "ph-robot",
  };
  // Delisted roots keep the crown; other ancestors read as "up the chain".
  const iconFor = (child: (typeof children)[number], upChain: Set<string>) =>
    child.delisted && !child.forkedFrom
      ? "ph-crown-simple"
      : upChain.has(child.sessionId)
        ? "ph-arrow-elbow-left-up"
        : PURPOSE_ICON[child.forkedFrom?.purpose ?? "side"];

  // Switcher click: setActiveRelatedSessionId only; openSub + width are owned
  // by the one-shot effect on activeRelatedSessionId. Do NOT dual-write openSub.
  //
  // parentRow ("Where this branch started — go back anytime") is intentionally
  // gone. Branch/edit comparisons open the child in this Related rail via
  // branch_created → activeRelatedSessionId (not center compare). Center
  // session is chosen only from the left list.

  const sizeForChild = (purpose: string | undefined): "half" | "default" =>
    purpose === "fork" ? "half" : "default";

  // Wheel → horizontal: trackpads/mice emit vertical delta; without this the
  // strip only moves via the scrollbar thumb.
  const switchRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = switchRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 1) return;
      const dominantY = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
      if (!dominantY && event.deltaX === 0) return;
      const dx = dominantY ? event.deltaY : event.deltaX;
      if (dx === 0) return;
      const next = el.scrollLeft + dx;
      const max = el.scrollWidth - el.clientWidth;
      if (next <= 0 && el.scrollLeft <= 0) return;
      if (next >= max && el.scrollLeft >= max) return;
      event.preventDefault();
      el.scrollLeft = Math.max(0, Math.min(max, next));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [children.length, activeChildId]);

  // One row of small buttons, then the conversation itself: switching between
  // related conversations should not cost a round trip through a list.
  const switcher =
    children.length > 0 ? (
      <div className="child-switch" ref={switchRef}>
        {children.map((child) => (
          <button
            key={child.sessionId}
            className={child.sessionId === activeChildId ? "on" : ""}
            title={sessionTitle(child, app.sessionDisplayNames, app.sessions)}
            onClick={() => {
              shell.openApp();
              if (child.sessionId === activeChildId) {
                app.setActiveRelatedSessionId(null);
                shell.closeSub();
              } else {
                app.setActiveRelatedSessionId(child.sessionId, {
                  size: sizeForChild(child.forkedFrom?.purpose),
                });
              }
            }}
          >
            <i className={`ph ${iconFor(child, ancestorIds)}`} />
            <span>{sessionTitle(child, app.sessionDisplayNames, app.sessions)}</span>
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
          key={activeChildId}
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

  if (children.length === 0) {
    return (
      <div className="rp-empty">
        <div>{t("No related conversations.")}</div>
        <div className="related-empty-actions">
          {app.sessionId ? (
            <>
              <button onClick={() => app.forkCurrentSession("fork")}>
                {t("Create branch")}
              </button>
              <button onClick={() => app.forkCurrentSession("side")}>
                {t("Start BTW")}
              </button>
            </>
          ) : null}
          <button onClick={() => app.openHelper(undefined, Boolean(app.sessionId))}>
            {t("Ask Helper")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {switcher}
      {children.map((child) => (
        <button
          key={child.sessionId}
          className="sc-item"
          onClick={() => {
            shell.openApp();
            app.setActiveRelatedSessionId(child.sessionId, {
              size: sizeForChild(child.forkedFrom?.purpose),
            });
          }}
        >
          <div className="t">
            <i className={`ph ${iconFor(child, ancestorIds)}`} />
            {sessionTitle(child, app.sessionDisplayNames, app.sessions)}
            {child.status === "incomplete" ? (
              <span className="badge-run">{t("running")}</span>
            ) : null}
          </div>
          <div className="d">
            {child.delisted && !child.forkedFrom
              ? t("Origin conversation · {count} messages", { count: child.messageCount ?? 0 })
              : child.sessionId === parentId
                ? t("Parent · {count} messages", { count: child.messageCount ?? 0 })
                : ancestorIds.has(child.sessionId)
                  ? t("Ancestor · {count} messages", { count: child.messageCount ?? 0 })
                  : child.forkedFrom?.purpose === "helper"
                    ? t("How Alt works, and fixing setup · fresh context")
                    : child.forkedFrom?.purpose === "subagent"
                      ? t("Subagent · {count} messages", { count: child.messageCount ?? 0 })
                      : child.forkedFrom?.purpose === "fork"
                        ? t("Branch · {count} messages", { count: child.messageCount ?? 0 })
                        : t("Side conversation · {count} messages", { count: child.messageCount ?? 0 })}
          </div>
        </button>
      ))}
      <div className="related-legend" aria-hidden="true">
        {t("br = Branch · btw = side chat · Helper · sa = Subagent")}
      </div>
    </>
  );
}
