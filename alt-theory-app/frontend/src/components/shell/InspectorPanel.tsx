import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useApp } from "@/context/AppProvider";
import { useShell, type RailKey } from "@/context/ShellContext";
import { t } from "@/i18n";
import { shouldClearRelatedOnSubChange } from "@/lib/relatedOpen";
import {
  RELATED_KINDS,
  canTakeMainline,
  familyMembersOf,
  filterRelatedRows,
  folderLabel,
  isListMember,
  relatedKindLabel,
  relatedRowsFor,
  sessionTitle,
  type RelatedKind,
  type RelatedRow,
  type RelatedScope,
} from "@/lib/sessionList";
import { ChildConversation } from "@/components/conversation/ChildConversation";
import { RecordsPanel } from "@/components/inspector/RecordsPanel";
import { ProvenancePanel } from "@/components/inspector/ProvenancePanel";
import { RuntimePanel } from "@/components/inspector/RuntimePanel";
import { WorkspaceTree } from "@/components/inspector/WorkspaceTree";
import { ChangesPanel } from "@/components/inspector/ChangesPanel";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import { fetchSessionDetail, promoteToMainline } from "@/api/sessions";
import { copyText } from "@/lib/clipboard";
import { hasNativeBridge, revealPath } from "@/lib/native";
import { paneMemory, usePaneMemory } from "@/lib/paneMemory";
import { downloadMarkdown, markdownFileName, sessionTranscriptToMarkdown } from "@/lib/sessionMarkdown";

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

  // Scroll memory per (conversation, rail, sub): saved on scroll, restored
  // when that view mounts again. Content (file text, lists) arrives after
  // the mount and grows the scroll height, so the restore retries while the
  // content changes instead of on a fixed frame budget: DOM mutations cover
  // React renders, a ResizeObserver on the content covers height-only
  // changes (images loading). Both stop once the position lands; scrolling
  // updates the saved value, so a restore during active reading is a no-op.
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollKey = `${app.sessionId}:${active}:${shell.rightSub?.key ?? ""}:scroll`;
  useLayoutEffect(() => {
    const el = bodyRef.current;
    const saved = paneMemory.get<number>(scrollKey) ?? 0;
    if (!el || !saved) return;
    let resize: ResizeObserver | null = null;
    const restore = () => {
      el.scrollTop = saved;
      if (Math.abs(el.scrollTop - saved) <= 1) {
        mutations.disconnect();
        resize?.disconnect();
        return;
      }
      // The content element is replaced as views swap; follow it.
      resize?.disconnect();
      if (el.firstElementChild) {
        resize = new ResizeObserver(restore);
        resize.observe(el.firstElementChild);
      }
    };
    const mutations = new MutationObserver(restore);
    mutations.observe(el, { childList: true, subtree: true });
    restore();
    return () => {
      mutations.disconnect();
      resize?.disconnect();
    };
  }, [scrollKey]);

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
              data-tip={t("Collapse")}
            >
              <i className="ph ph-sidebar-simple" style={{ transform: "scaleX(-1)" }} />
            </button>
            <button className="back" onClick={leaveRelated} data-tip={t("Back")}>
              <i className="ph ph-arrow-left" />
            </button>
            <span>{title}</span>
          </div>
        ) : null}
        <div
          className="body"
          ref={bodyRef}
          onScroll={(event) => paneMemory.set(scrollKey, event.currentTarget.scrollTop)}
        >
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
              runState={app.runState}
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
            data-tip={RAIL_META[key].title}
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
                data-tip={RAIL_META[key].title}
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
  const menu = useContextMenu();
  const activeChildId = shell.rightSub?.key.startsWith("related:")
    ? shell.rightSub.key.slice("related:".length)
    : null;

  // Filter state outlives the pane (proto E; pane memory per conversation).
  const memoryKey = `${app.sessionId}:related`;
  const [scope, setScope] = usePaneMemory<RelatedScope>(`${memoryKey}:scope`, "conversation");
  const [kinds, setKinds] = usePaneMemory<Set<RelatedKind>>(`${memoryKey}:kinds`, () => new Set(RELATED_KINDS));
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = usePaneMemory(`${memoryKey}:searchOpen`, false);
  const [query, setQuery] = usePaneMemory(`${memoryKey}:query`, "");
  const [closedKinds, setClosedKinds] = usePaneMemory<Set<RelatedKind>>(`${memoryKey}:closed`, () => new Set());

  const titleOf = (s: (typeof app.sessions)[number]) =>
    sessionTitle(s, app.sessionDisplayNames, app.sessions);
  // One row projection carries relation, icon, run state, role (card 9);
  // the membership rule stays in sessionList.ts (§6).
  const rows = useMemo(
    () => (app.sessionId ? relatedRowsFor(app.sessionId, app.sessions, scope) : []),
    [app.sessions, app.sessionId, scope],
  );
  const visible = useMemo(
    () => filterRelatedRows(rows, { kinds, query, titleOf: (s) => sessionTitle(s, app.sessionDisplayNames, app.sessions) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, kinds, query, app.sessionDisplayNames, app.sessions],
  );
  const countOf = (kind: RelatedKind) => rows.filter((row) => row.kind === kind).length;
  const presentKinds = RELATED_KINDS.filter((kind) => countOf(kind) > 0);
  const chain = visible.filter((row) => row.kind === null);
  const ownFolder = app.sessions.find((s) => s.sessionId === app.sessionId)?.workspacePrimaryDir ?? null;

  const toggleKind = (kind: RelatedKind) =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  const toggleSection = (kind: RelatedKind) =>
    setClosedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };
  const filterSummary =
    presentKinds.every((kind) => kinds.has(kind))
      ? t("All types")
      : presentKinds.filter((kind) => kinds.has(kind)).map(relatedKindLabel).join(" · ") || t("No types");

  // Switcher click: setActiveRelatedSessionId only; openSub + width are owned
  // by the one-shot effect on activeRelatedSessionId. Do NOT dual-write openSub.
  //
  // parentRow ("Where this branch started — go back anytime") is intentionally
  // gone. Branch/edit comparisons open the child in this Related rail via
  // branch_created → activeRelatedSessionId (not center compare). Center
  // session is chosen only from the left list.
  const openRow = (row: RelatedRow) => {
    shell.openApp();
    app.setActiveRelatedSessionId(row.session.sessionId, { size: row.paneSize });
  };

  const sessionMenuItems = (child: RelatedRow["session"]): ContextMenuItem[] => {
    const title = titleOf(child);
    const sessionRoot = async () => {
      const detail = await fetchSessionDetail(child.sessionId);
      if (!detail.sessionRoot) throw new Error(t("Session folder is available in the desktop app."));
      return detail.sessionRoot;
    };
    const copyFolder = () => void sessionRoot().then(copyText).catch((error) =>
      window.alert(error instanceof Error ? error.message : String(error)));
    const openFolder = () => void sessionRoot().then(revealPath).catch((error) =>
      window.alert(error instanceof Error ? error.message : String(error)));
    const familyCount = familyMembersOf(child, app.sessions).filter(
      (member) => !member.deletedAt,
    ).length;
    const remove = () => app.requestConfirm({
      message: t("Delete this conversation?"),
      confirmLabel: t("Delete"),
      onConfirm: () => app.deleteSelectedSession(child.sessionId),
    });
    const removeFamily = () => app.requestConfirm({
      message: t("Delete all {count} conversations in this family?", {
        count: String(familyCount),
      }),
      confirmLabel: t("Delete entire family"),
      onConfirm: () => app.deleteSessionFamily(child.sessionId),
    });
    const exportMarkdown = () => void fetchSessionDetail(child.sessionId)
      .then((detail) => downloadMarkdown(
        markdownFileName(title),
        sessionTranscriptToMarkdown(title, detail.transcript ?? []),
      ))
      .catch((error) => window.alert(error instanceof Error ? error.message : String(error)));
    return [
      ...(!isListMember(child) ? [{
        label: t("Show in conversation list"), icon: "ph-list-plus", onSelect: () => void app.promoteRelatedSession(child.sessionId),
      }] : []),
      ...(canTakeMainline(child, app.sessions) ? [{
        label: t("Make this the main conversation"), icon: "ph-crown-simple", onSelect: () => void promoteToMainline(child.sessionId)
          .then(() => app.refreshSessions())
          .catch((error) => window.alert(error instanceof Error ? error.message : String(error))),
      }] : []),
      { label: t("Rename"), icon: "ph-pencil-simple", onSelect: () => {
        const next = window.prompt(t("Conversation name"), app.sessionDisplayNames[child.sessionId]?.alias || title);
        if (next !== null) void app.renameSelectedSession(child.sessionId, next);
      } },
      { label: t("Duplicate"), icon: "ph-copy", onSelect: () => app.duplicateSession(child.sessionId) },
      { label: t("Delete"), icon: "ph-trash", danger: true, onSelect: remove },
      { label: t("Delete entire family"), icon: "ph-tree-structure", danger: true, onSelect: removeFamily },
      { label: t("Export Markdown"), icon: "ph-download-simple", separator: true, onSelect: exportMarkdown },
      { label: t("Copy Session ID"), icon: "ph-identification-card", onSelect: () => void copyText(child.sessionId) },
      ...(app.appMode === "local" ? [
        { label: t("Copy session folder path"), icon: "ph-copy", onSelect: copyFolder },
        ...(hasNativeBridge() ? [{ label: t("Open session folder"), icon: "ph-folder-open", onSelect: openFolder }] : []),
      ] : []),
    ];
  };

  const openMenuFromKey = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    child: RelatedRow["session"],
  ) => {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    menu.openAt(rect.left + 18, rect.bottom, sessionMenuItems(child), event.currentTarget);
  };

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
  }, [visible.length, activeChildId]);

  // One row of small buttons, then the conversation itself: switching between
  // related conversations should not cost a round trip through a list.
  const switcher =
    visible.length > 0 ? (
      <div className="child-switch" ref={switchRef}>
        {visible.map((row) => (
          <button
            key={row.session.sessionId}
            className={row.session.sessionId === activeChildId ? "on" : ""}
            data-tip={titleOf(row.session)}
            onContextMenu={(event) => menu.open(event, sessionMenuItems(row.session))}
            onKeyDown={(event) => openMenuFromKey(event, row.session)}
            onClick={() => {
              shell.openApp();
              if (row.session.sessionId === activeChildId) {
                app.setActiveRelatedSessionId(null);
                shell.closeSub();
              } else {
                app.setActiveRelatedSessionId(row.session.sessionId, { size: row.paneSize });
              }
            }}
          >
            <i className={`ph ${row.icon}`} />
            <span>{titleOf(row.session)}</span>
            {row.runStatus === "running" || row.runStatus === "awaiting-approval" ? (
              <span className="dot" />
            ) : null}
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
        {menu.element}
      </>
    );
  }

  if (rows.length === 0) {
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

  const detailOf = (row: RelatedRow) => {
    const count = row.session.messageCount ?? 0;
    switch (row.relation) {
      case "origin":
        return t("Origin conversation · {count} messages", { count });
      case "parent":
        return t("Parent · {count} messages", { count });
      case "ancestor":
        return t("Ancestor · {count} messages", { count });
      case "helper":
        return t("How Alt works, and fixing setup · fresh context");
      case "subagent":
        return row.role
          ? t("Subagent · {role} · {count} messages", { role: row.role, count })
          : t("Subagent · {count} messages", { count });
      case "fork":
        return t("Branch · {count} messages", { count });
      default:
        return t("Side conversation · {count} messages", { count });
    }
  };

  const item = (row: RelatedRow) => (
    <button
      key={row.session.sessionId}
      className="sc-item"
      onContextMenu={(event) => menu.open(event, sessionMenuItems(row.session))}
      onKeyDown={(event) => openMenuFromKey(event, row.session)}
      onClick={() => openRow(row)}
    >
      <div className="t">
        <i className={`ph ${row.icon}`} />
        {titleOf(row.session)}
        {row.runStatus === "running" || row.runStatus === "awaiting-approval" ? (
          <span className="badge-run">{t("running")}</span>
        ) : null}
      </div>
      <div className="d">{detailOf(row)}</div>
      {row.session.workspacePrimaryDir && row.session.workspacePrimaryDir !== ownFolder ? (
        <div className="d fline">
          <i className="ph ph-folder-simple" /> {t("In {folder}", { folder: folderLabel(row.session.workspacePrimaryDir) })}
        </div>
      ) : null}
    </button>
  );

  return (
    <>
      {switcher}
      <div className="frow">
        <span className="flabel">{t("Filter")}</span>
        <span
          className={`fexp${filterOpen ? " open" : ""}`}
          onMouseLeave={() => setFilterOpen(false)}
        >
          {/* The card expands on hover; the click path is for trackpad and keyboard users. */}
          <button
            type="button"
            className="fcard fsummary"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((open) => !open)}
          >
            {filterSummary}
          </button>
          <span className="fopts">
            {presentKinds.map((kind) => (
              <button
                type="button"
                key={kind}
                className={`fcard${kinds.has(kind) ? " on" : ""}`}
                aria-pressed={kinds.has(kind)}
                onClick={() => toggleKind(kind)}
              >
                {kinds.has(kind) ? <i className="ph ph-check" /> : null}
                {relatedKindLabel(kind)}
                <span className="n">{countOf(kind)}</span>
              </button>
            ))}
          </span>
        </span>
        <button
          type="button"
          className={`fcard${scope === "family" ? " on" : ""}`}
          aria-pressed={scope === "family"}
          onClick={() => setScope((prev) => (prev === "family" ? "conversation" : "family"))}
        >
          {scope === "family" ? <i className="ph ph-check" /> : null}
          {t("Whole family")}
        </button>
        <span className="fspacer" />
        <button
          type="button"
          className={`fsearch-btn${searchOpen || query ? " on" : ""}`}
          data-tip={t("Search within these")}
          aria-label={t("Search within these")}
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
        >
          <i className="ph ph-magnifying-glass" />
        </button>
      </div>
      {searchOpen ? (
        <div className="fsearch">
          <input
            autoFocus
            placeholder={t("Search…")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeSearch();
            }}
          />
        </div>
      ) : null}
      {chain.map(item)}
      {presentKinds
        .filter((kind) => kinds.has(kind))
        .map((kind) => {
          const members = visible.filter((row) => row.kind === kind);
          if (members.length === 0) return null;
          const closed = closedKinds.has(kind);
          return (
            <div key={kind}>
              <button type="button" className="sect-head" onClick={() => toggleSection(kind)}>
                <i className={`ph ph-caret-${closed ? "right" : "down"}`} />
                {relatedKindLabel(kind)}
                <span className="n">{members.length}</span>
              </button>
              {closed ? null : members.map(item)}
            </div>
          );
        })}
      {visible.length === 0 ? (
        <div className="rp-empty">{t("No matching related conversations.")}</div>
      ) : null}
      {menu.element}
    </>
  );
}
