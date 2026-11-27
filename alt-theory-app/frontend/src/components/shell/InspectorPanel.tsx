import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useConversationContext } from "@/context/ConversationContext";
import { useMainView } from "@/context/MainView";
import { useApp } from "@/context/AppProvider";
import { useShell, type RailKey } from "@/context/ShellContext";
import { t } from "@/i18n";
import { targetKey, targetTitle } from "@/lib/viewTarget";
import {
  RELATED_KINDS,
  canTakeMainline,
  familyMembersOf,
  filterRelatedRows,
  folderLabel,
  isListMember,
  relatedKindLabel,
  relatedRowsFor,
  sortRelatedRows,
  type RelatedSort,
  sessionTitle,
  type RelatedKind,
  type RelatedRow,
  type RelatedScope,
} from "@/lib/sessionList";
import { draggableSession } from "@/lib/sessionDrag";
import { ChildConversation } from "@/components/conversation/ChildConversation";
import { RecordsPanel } from "@/components/inspector/RecordsPanel";
import { ProvenancePanel } from "@/components/inspector/ProvenancePanel";
import { WorkspaceTree } from "@/components/inspector/WorkspaceTree";
import { ChangesPanel } from "@/components/inspector/ChangesPanel";
import { LocalPage } from "@/components/inspector/LocalPage";
import { OpenFilesPanel } from "@/components/inspector/OpenFilesPanel";
import { MarksPanel } from "@/components/inspector/MarksPanel";
import { MenuButton, NameForm } from "@/components/inspector/FolderList";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import { TabStrip } from "@/components/shell/TabStrip";
import { SlideMark } from "@/components/ui/SlideMark";
import { CenterIcon } from "@/components/ui/CenterIcon";
import { PaneActions, PaneActionsHost } from "@/components/shell/PaneActions";
import { fetchSessionDetail, promoteToMainline } from "@/api/sessions";
import { copyText } from "@/lib/clipboard";
import { revealPath } from "@/lib/native";
import { paneMemory, usePaneMemory } from "@/lib/paneMemory";
import { downloadMarkdown, markdownFileName, sessionTranscriptToMarkdown } from "@/lib/sessionMarkdown";
import { useFindTarget } from "@/lib/find";
import { conversationState } from "@/lib/listActivity";
import { ConversationState } from "@/components/conversation/ConversationState";

const RAIL_META: Record<RailKey, { title: string; icon: string; adv?: boolean }> = {
  chats: { title: t("Related conversations"), icon: "ph-chats" },
  changes: { title: t("Changes"), icon: "ph-pencil-simple-line" },
  workspace: { title: t("Files"), icon: "ph-folder" },
  open: { title: t("Open files"), icon: "ph-files" },
  marks: { title: t("Bookmarks"), icon: "ph-bookmarks-simple" },
  records: { title: t("Records"), icon: "ph-scroll", adv: true },
  provenance: { title: t("Provenance"), icon: "ph-tree-structure", adv: true },
};

const PRIMARY: RailKey[] = ["chats", "changes", "workspace", "open", "marks"];
const ADVANCED: RailKey[] = ["records", "provenance"];

export function InspectorPanel() {
  const app = useApp();
  const conv = useConversationContext();
  const shell = useShell();
  const main = useMainView();
  const related = useRelatedList();
  const advanced = app.viewMode === "researcher";
  const open = shell.rightPanel !== null;
  const active = shell.rightPanel;
  const railRef = useRef<HTMLDivElement>(null);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);

  const attentionCount = related.visible.filter((row) => {
    const state = conversationState(row.runStatus, main.sessionAlerts[row.session.sessionId]);
    return state === "approval" || state === "failed";
  }).length;
  const relatedRunning = related.visible.some((row) => conversationState(row.runStatus) === "running");

  // The open files name the view; their count sits beside the name.
  const title = active === "open"
    ? RAIL_META.open.title
    : (shell.target && targetTitle(shell.target)) ?? (active ? RAIL_META[active].title : "");

  // Scroll memory per (conversation, rail, sub): saved on scroll, restored
  // when that view mounts again. Content (file text, lists) arrives after
  // the mount and grows the scroll height, so the restore retries while the
  // content changes instead of on a fixed frame budget: DOM mutations cover
  // React renders, a ResizeObserver on the content covers height-only
  // changes (images loading). Both stop once the position lands; scrolling
  // updates the saved value, so a restore during active reading is a no-op.
  const bodyRef = useRef<HTMLDivElement>(null);
  // An open target keeps its own scroll whatever the center shows; a list's
  // scroll is the center conversation's, and so is the scroll of a file that
  // is not on show (it stays mounted).
  const scrollKey = active === "open"
    ? `open:${shell.activeFile}:scroll`
    : shell.target
      ? `${active}:${targetKey(shell.target)}:scroll`
      : `${conv.sessionId}:${active}::scroll`;
  useLayoutEffect(() => {
    const el = bodyRef.current;
    const saved = paneMemory.get<number>(scrollKey) ?? 0;
    if (!el) return;
    // Since every preview mode scrolls inside its card (2026-09-28), the
    // element that actually scrolls is the solo preview's card when one is
    // open, of the open file on show, the pane itself for lists. One key
    // serves all.
    const scroller = () =>
      el.querySelector<HTMLElement>(
        ":scope > .preview > .change-preview-body, :scope > .open-files > .open-file-reader:not([hidden]) > .preview > .change-preview-body",
      ) ?? el;
    scroller().scrollTop = saved;
    if (!saved) return;
    let resize: ResizeObserver | null = null;
    let lastSet = scroller().scrollTop;
    const restore = () => {
      const s = scroller();
      // Someone else moved the view (the user, a Ctrl+F jump): their
      // position wins, stop restoring.
      if (s.scrollTop !== lastSet) {
        mutations.disconnect();
        resize?.disconnect();
        return;
      }
      s.scrollTop = saved;
      lastSet = s.scrollTop;
      if (Math.abs(s.scrollTop - saved) <= 1) {
        mutations.disconnect();
        resize?.disconnect();
        return;
      }
      // The content element is replaced as views swap; follow it. The card
      // keeps a fixed height while its content grows, so the content child
      // is the height signal, not the card.
      resize?.disconnect();
      const content = (s === el ? el.firstElementChild : s.firstElementChild) ?? null;
      if (content) {
        resize = new ResizeObserver(restore);
        resize.observe(content);
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
      <PaneActionsHost.Provider value={actionsHost}>
      <div className="rpanel">
        {active ? (
          <div className={`head${shell.target || active === "open" ? " sub" : ""}`}>
            {/* Collapse sits on the inner edge: on a narrow window the outer
                edge is the first thing to go off-screen. */}
            <button
              className="rp-close"
              onClick={shell.closeRight}
              data-tip={t("Collapse")}
            >
              <i className="ph ph-sidebar-simple" style={{ transform: "scaleX(-1)" }} />
            </button>
            <button className="back" onClick={shell.closeTarget} data-tip={t("Back")}>
              <i className="ph ph-arrow-left" />
            </button>
            <span>{title}</span>
            {active === "open" ? <span className="rp-count">{shell.openedFiles.length}</span> : null}
            {/* What the thing on show can do (to the center, its menu), then the pane's own width. */}
            <span className="rp-actions" ref={setActionsHost} />
            <button
              className="rp-full"
              onClick={() => shell.layout.setRightFull(!shell.layout.geometry.rightFull)}
              data-tip={shell.layout.geometry.rightFull ? t("Restore") : t("Full width")}
            >
              <i className={`ph ${shell.layout.geometry.rightFull ? "ph-arrows-in-line-horizontal" : "ph-arrows-out-line-horizontal"}`} />
            </button>
          </div>
        ) : null}
        <div
          className={`body${active === "open" ? " with-tabs" : ""}`}
          ref={bodyRef}
          onScrollCapture={(event) => {
            // Memory follows whichever element actually scrolls: the pane
            // for lists, the solo preview's card for file views. Inner
            // scrollers (the edit textarea) are not recorded.
            const t = event.target;
            if (
              t instanceof HTMLElement &&
              (t === event.currentTarget || t.classList.contains("change-preview-body"))
            )
              paneMemory.set(scrollKey, t.scrollTop);
          }}
        >
          {active === "chats" ? <RelatedConversations list={related} /> : null}
          {active === "changes" ? <ChangesPanel /> : null}
          {active === "workspace" ? shell.target?.kind === "page" ? <LocalPage /> : <WorkspaceTree /> : null}
          {active === "open" ? <OpenFilesPanel /> : null}
          {active === "marks" ? <MarksPanel /> : null}
          {active === "records" ? (
            <RecordsPanel
              sessionId={conv.sessionId}
              sessionReady={conv.sessionReady}
              tabActive
            />
          ) : null}
          {active === "provenance" ? (
            <ProvenancePanel
              sessionId={conv.sessionId}
              sessionReady={conv.sessionReady}
              discovery={app.discovery}
              tabActive
            />
          ) : null}
        </div>
      </div>
      <div
        className="rail"
        ref={railRef}
        // Double-clicking the collapsed strip's empty space opens the pane.
        onDoubleClick={(event) => {
          if (!open && !(event.target as HTMLElement).closest("button")) shell.reopenRight();
        }}
      >
        {PRIMARY.map((key) => (
          <button
            key={key}
            className={active === key ? "on" : ""}
            data-tip={key === "chats" && attentionCount
              ? attentionCount === 1 ? t("1 conversation needs your attention")
                : t("{count} conversations need your attention", { count: attentionCount })
              : RAIL_META[key].title}
            onClick={() => shell.toggleRail(key)}
          >
            <i className={`ph ${RAIL_META[key].icon}${key === "chats" && relatedRunning ? " activity-shimmer" : ""}`} />
            {key === "chats" && attentionCount > 0 ? <span className="attention-count">{attentionCount}</span> : null}
            {key === "open" && shell.openedFiles.length > 0 ? <span className="attention-count">{shell.openedFiles.length}</span> : null}
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
        <SlideMark within={railRef} at={active} />
      </div>
      </PaneActionsHost.Provider>
    </aside>
  );
}

// Kept above the pane so the collapsed entry and open list share filters and rows.
function useRelatedList() {
  const app = useApp();
  const conv = useConversationContext();
  const memoryKey = `${conv.sessionId}:related`;
  const [scope, setScope] = usePaneMemory<RelatedScope>(`${memoryKey}:scope`, "conversation");
  const [kinds, setKinds] = usePaneMemory<Set<RelatedKind>>(`${memoryKey}:kinds`, () => new Set(RELATED_KINDS));
  const [query, setQuery] = usePaneMemory(`${memoryKey}:query`, "");
  const [sort, setSort] = usePaneMemory<RelatedSort>(`${memoryKey}:sort`, "activity");
  const [onlyRunning, setOnlyRunning] = usePaneMemory(`${memoryKey}:running`, false);
  const rows = useMemo(
    () => (conv.sessionId ? relatedRowsFor(conv.sessionId, app.sessions, scope) : []),
    [app.sessions, conv.sessionId, scope],
  );
  const visible = useMemo(() => {
    const title = (s: (typeof app.sessions)[number]) => sessionTitle(s, app.sessionDisplayNames, app.sessions);
    const matched = filterRelatedRows(rows, { kinds, query, titleOf: title }).filter((row) =>
      !onlyRunning || row.kind === null || row.runStatus === "running" || row.runStatus === "awaiting-approval");
    return query.trim() ? matched : sortRelatedRows(matched, sort, title);
  }, [rows, kinds, query, sort, onlyRunning, app.sessionDisplayNames, app.sessions]);
  return { rows, visible, scope, setScope, kinds, setKinds, query, setQuery, sort, setSort, onlyRunning, setOnlyRunning };
}

function RelatedConversations({ list }: { list: ReturnType<typeof useRelatedList> }) {
  const app = useApp();
  const conv = useConversationContext();
  const main = useMainView();
  const shell = useShell();
  const menu = useContextMenu();
  const activeChildId = shell.openConversationId;
  useEffect(() => {
    if (activeChildId) main.markSessionRead(activeChildId);
  }, [activeChildId, main.sessionAlerts, main.markSessionRead]);
  const [controlsOpen, setControlsOpen] = useState(false);
  // Renamed in place: the desktop app has no window.prompt.
  const [renaming, setRenaming] = useState<{ sessionId: string; name: string } | null>(null);

  // Filter state outlives the pane (proto E; pane memory per conversation).
  const memoryKey = `${conv.sessionId}:related`;
  const { rows, visible, scope, setScope, kinds, setKinds, query, setQuery, sort, setSort, onlyRunning, setOnlyRunning } = list;
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = usePaneMemory(`${memoryKey}:searchOpen`, false);
  const [closedKinds, setClosedKinds] = usePaneMemory<Set<RelatedKind>>(`${memoryKey}:closed`, () => new Set());
  const filterRowRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useFindTarget(filterRowRef, {
    focus: () => {
      setSearchOpen(true);
      window.setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 0);
    },
  });

  const titleOf = (s: (typeof app.sessions)[number]) =>
    sessionTitle(s, app.sessionDisplayNames, app.sessions);
  const sortLabels: Record<RelatedSort, string> = {
    activity: t("Activity"), created: t("Created"), name: t("Name"),
  };
  const sortMenuLabels: Record<RelatedSort, string> = {
    activity: t("Recent activity"), created: t("Creation order"), name: t("Name"),
  };
  const sortTips: Record<RelatedSort, string> = {
    activity: t("Sort by recent activity"),
    created: t("Sort by creation order"),
    name: t("Sort by name"),
  };
  const countOf = (kind: RelatedKind) => rows.filter((row) => row.kind === kind).length;
  const presentKinds = RELATED_KINDS.filter((kind) => countOf(kind) > 0);
  const chain = visible.filter((row) => row.kind === null);
  const ownFolder = app.sessions.find((s) => s.sessionId === conv.sessionId)?.workspacePrimaryDir ?? null;

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
      ? t("Type")
      : presentKinds.filter((kind) => kinds.has(kind)).map(relatedKindLabel).join(" · ") || t("No types");

  // parentRow ("Where this branch started — go back anytime") is intentionally
  // gone. Branch/edit comparisons open the child in this Related rail via
  // branch_created (not center compare). Center session is chosen only from
  // the left list.
  const openRow = (row: RelatedRow) => {
    shell.openApp();
    shell.openTarget({ kind: "conversation", sessionId: row.session.sessionId });
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
      onConfirm: () => main.deleteSession(child.sessionId),
    });
    const removeFamily = () => app.requestConfirm({
      message: t("Delete all {count} conversations in this family?", {
        count: String(familyCount),
      }),
      confirmLabel: t("Delete entire family"),
      onConfirm: () => main.deleteSessionFamily(child.sessionId),
    });
    const exportMarkdown = () => void fetchSessionDetail(child.sessionId)
      .then((detail) => downloadMarkdown(
        markdownFileName(title),
        sessionTranscriptToMarkdown(title, detail.transcript ?? []),
      ))
      .catch((error) => window.alert(error instanceof Error ? error.message : String(error)));
    return [
      ...(!isListMember(child) ? [{
        label: t("Show in conversation list"), icon: "ph-list-plus", onSelect: () => void main.setRelatedSessionListed(child.sessionId, true),
      }] : child.forkedFrom && child.forkedFrom.purpose !== "fork" ? [{
        label: t("Hide from conversation list"), icon: "ph-list-minus", onSelect: () => void main.setRelatedSessionListed(child.sessionId, false),
      }] : []),
      ...(canTakeMainline(child, app.sessions) ? [{
        label: t("Make this the main conversation"), icon: "ph-crown-simple", onSelect: () => void promoteToMainline(child.sessionId)
          .then(() => app.refreshSessions())
          .catch((error) => window.alert(error instanceof Error ? error.message : String(error))),
      }] : []),
      { label: t("Rename"), icon: "ph-pencil-simple", onSelect: () => setRenaming({
        sessionId: child.sessionId,
        name: app.sessionDisplayNames[child.sessionId]?.alias || title,
      }) },
      { label: t("Duplicate"), icon: "ph-copy", onSelect: () => main.duplicateSession(child.sessionId) },
      { label: t("Delete"), icon: "ph-trash", danger: true, onSelect: remove },
      { label: t("Delete entire family"), icon: "ph-tree-structure", danger: true, onSelect: removeFamily },
      { label: t("Export Markdown"), icon: "ph-download-simple", separator: true, onSelect: exportMarkdown },
      { label: t("Copy Session ID"), icon: "ph-identification-card", onSelect: () => void copyText(child.sessionId) },
      { label: t("Copy session folder path"), icon: "ph-copy", onSelect: copyFolder },
      { label: t("Open session folder"), icon: "ph-folder-open", onSelect: openFolder },
    ];
  };

  const activeChild = activeChildId ? app.sessions.find((item) => item.sessionId === activeChildId) : undefined;
  // Adding a subagent to the list lives in its menu now; say so the first
  // time one that is not in the list is on show (owner 2026-11-27).
  useEffect(() => {
    if (!activeChild || isListMember(activeChild)) return;
    try {
      if (window.localStorage.getItem("alt-hint-list-add")) return;
      window.localStorage.setItem("alt-hint-list-add", "1");
    } catch { return; }
    conv.notify({ kind: "text", text: t("This conversation is not in your list. Add it from ⋯ at the top right.") });
  }, [activeChild?.sessionId]);
  const childActions = activeChild ? (
    <PaneActions>
      <button
        type="button"
        className="rp-act rp-center"
        aria-label={t("Show in the center")}
        data-tip={t("Show in the center")}
        onClick={() => { main.toCenter({ kind: "conversation", sessionId: activeChild.sessionId }); shell.closeTarget(); }}
      >
        <CenterIcon />
      </button>
      <button
        type="button"
        className="rp-act"
        aria-label={t("More actions")}
        aria-haspopup="menu"
        data-tip={t("More actions")}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          menu.openAt(rect.right - 220, rect.bottom + 4, sessionMenuItems(activeChild), event.currentTarget);
        }}
      >
        <i className="ph ph-dots-three" aria-hidden="true" />
      </button>
    </PaneActions>
  ) : null;

  const openMenuFromKey = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    child: RelatedRow["session"],
  ) => {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    menu.openAt(rect.left + 18, rect.bottom, sessionMenuItems(child), event.currentTarget);
  };

  const switcher =
    visible.length > 0 || activeChildId ? (
      <div className="child-switch-row">
      <TabStrip className="child-switch" activeKey={activeChildId}>
        {visible.map((row) => (
          <button
            key={row.session.sessionId}
            data-tab-key={row.session.sessionId}
            {...draggableSession(row.session.sessionId, titleOf(row.session))}
            className={row.session.sessionId === activeChildId ? "on" : ""}
            data-tip={row.kind ? `${t({ subagent: "Subagent", fork: "Branch", side: "BTW", advisor: "Advisor" }[row.kind])} · ${titleOf(row.session)}` : titleOf(row.session)}
            onContextMenu={(event) => menu.open(event, sessionMenuItems(row.session))}
            onKeyDown={(event) => openMenuFromKey(event, row.session)}
            onClick={() => {
              shell.openApp();
              if (row.session.sessionId === activeChildId) shell.closeTarget();
              else openRow(row);
            }}
          >
            <i className={`ph ${row.icon}`} />
            <span className={conversationState(row.runStatus) === "running" ? "activity-shimmer" : undefined}>
              {titleOf(row.session)}</span>
            <ConversationState state={conversationState(row.runStatus, main.sessionAlerts[row.session.sessionId])} />
          </button>
        ))}
      </TabStrip>
      {activeChildId ? <button type="button" className="flat" aria-label={t("Sort and filter")}
        data-tip={t("Sort and filter")} aria-expanded={controlsOpen}
        onClick={() => setControlsOpen((open) => !open)}>
        <i className={`ph ph-caret-${controlsOpen ? "up" : "down"}`} aria-hidden="true" />
      </button> : null}
      </div>
    ) : null;

  if (rows.length === 0 && !activeChildId) {
    return (
      <div className="rp-empty">
        <div>{t("No related conversations.")}</div>
        <div className="related-empty-actions">
          {conv.sessionId ? (
            <>
              <button onClick={() => main.forkCurrentSession("fork")}>
                {t("Create branch")}
              </button>
              <button onClick={() => main.forkCurrentSession("side")}>
                {t("Start BTW")}
              </button>
            </>
          ) : null}
          <button onClick={() => main.askAboutAlt()}>
            {t("Ask Alt")}
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
      case "subagent":
        return row.role
          ? t("Subagent · {role} · {count} messages", { role: row.role, count })
          : t("Subagent · {count} messages", { count });
      case "fork":
        return t("Branch · {count} messages", { count });
      case "advisor":
        return t("Advisor · {count} messages", { count });
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
        <span className={conversationState(row.runStatus) === "running" ? "activity-shimmer" : undefined}>
          {titleOf(row.session)}</span>
        <ConversationState state={conversationState(row.runStatus, main.sessionAlerts[row.session.sessionId])} />
      </div>
      <div className="d">{detailOf(row)}</div>
      {row.session.workspacePrimaryDir && row.session.workspacePrimaryDir !== ownFolder ? (
        <div className="d fline">
          <i className="ph ph-folder" /> {t("In {folder}", { folder: folderLabel(row.session.workspacePrimaryDir) })}
        </div>
      ) : null}
    </button>
  );

  return (
    <div
      className={activeChildId ? "related-open" : undefined}
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.key !== "Escape" || event.nativeEvent.isComposing) return;
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (target?.closest(".child-conv")) return;
        if (target?.closest("input, textarea, select") && !target.closest(".fsearch")) return;
        if (!searchOpen && !(activeChildId && controlsOpen && target?.closest(".child-switch-row, .frow, .fsearch"))) return;
        event.preventDefault();
        event.stopPropagation();
        if (searchOpen) closeSearch();
        else setControlsOpen(false);
      }}
    >
      {switcher}
      {renaming ? (
        <NameForm
          key={renaming.sessionId}
          label={t("Conversation name")}
          initial={renaming.name}
          onSubmit={(name) => main.renameSession(renaming.sessionId, name).then((saved) => {
            if (saved) setRenaming(null);
            return saved;
          })}
          onCancel={() => setRenaming(null)}
        />
      ) : null}
      {!activeChildId || controlsOpen ? <>
      <div className="frow" ref={filterRowRef}>
        <MenuButton
          icon="ph-sort-ascending"
          label={sortLabels[sort]}
          tip={sortTips[sort]}
          choices={(Object.keys(sortLabels) as RelatedSort[]).map((key) => ({
            label: sortMenuLabels[key], on: sort === key, onSelect: () => setSort(key),
          }))}
        />
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
            data-tip={t("Filter by type")}
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
          data-tip={t("Include the whole conversation family")}
          onClick={() => setScope((prev) => (prev === "family" ? "conversation" : "family"))}
        >
          {scope === "family" ? <i className="ph ph-check" /> : null}
          {t("Family")}
        </button>
        <button
          type="button"
          className={`fcard${onlyRunning ? " on" : ""}`}
          aria-pressed={onlyRunning}
          data-tip={t("Show only running conversations")}
          onClick={() => setOnlyRunning((prev) => !prev)}
        >
          {onlyRunning ? <i className="ph ph-check" /> : null}
          {t("Running")}
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
            ref={searchInputRef}
            autoFocus
            placeholder={t("Search…")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      ) : null}
      </> : null}
      {childActions}
      {activeChildId ? <ChildConversation key={activeChildId} sessionId={activeChildId} /> : <>
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
      {visible.length > 0 ? (
        <button
          type="button"
          className="wb-note wb-note-action"
          onClick={() => shell.openSettings("agents")}
        >
          {t("Subagents can be configured in Settings.")}
        </button>
      ) : null}
      </>}
      {menu.element}
    </div>
  );
}
