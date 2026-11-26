import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useConversationContext } from "@/context/ConversationContext";
import { useMainView } from "@/context/MainView";
import { useApp } from "@/context/AppProvider";
import { fetchMarkedItems, type MarkedItem, type MarkedScope } from "@/api/sessions";
import { useBookmarks } from "@/lib/bookmarks";
import { marksOf, subscribeMarks } from "@/lib/marks";
import { requestRowJump } from "@/lib/rowJump";
import { usePaneMemory } from "@/lib/paneMemory";
import { sessionTitle } from "@/lib/sessionList";
import { arrangeMarked, type MarkedArrangement } from "@/lib/markedItems";
import { MenuButton } from "@/components/inspector/FolderList";
import { createNoteFile, putSessionFileContent } from "@/api/session-files";
import { useShell } from "@/context/ShellContext";
import { conversationLabel, markedNote } from "@/lib/markedNote";
import { fileNameDate } from "@/lib/format";
import { currentLang, t } from "@/i18n";

/**
 * The collection (owner 2026-11-26): a right-pane tab listing the user's
 * bookmarks and marks, so they can be re-read and dragged to the composer or
 * a note beside the conversation. This conversation is always in; the scope
 * extends to its family, project or every conversation. One conversation reads
 * best as one stream in conversation order; once extended, grouped by source.
 */
export function MarksPanel() {
  const conv = useConversationContext();
  const sessionId = conv.sessionId;
  const app = useApp();
  const main = useMainView();
  const shell = useShell();
  const [writing, setWriting] = useState(false);
  const [scope, setScope] = usePaneMemory<MarkedScope>("marks:scope", "this");
  // null = the default for the scope: by time in one conversation, by source once extended.
  const [chosen, setChosen] = usePaneMemory<MarkedArrangement | null>("marks:arrange", null);
  const [query, setQuery] = usePaneMemory("marks:query", "");
  const [searchOpen, setSearchOpen] = useState(Boolean(query));
  const [items, setItems] = useState<MarkedItem[] | null>(null);
  const [error, setError] = useState("");
  // Changes made here refresh the list.
  const bookmarks = useBookmarks(sessionId);
  const marks = useSyncExternalStore(subscribeMarks, () => marksOf(sessionId));

  useEffect(() => {
    if (!sessionId) return;
    let live = true;
    fetchMarkedItems(sessionId, scope)
      .then((next) => { if (live) { setItems(next); setError(""); } })
      .catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { live = false; };
  }, [sessionId, scope, bookmarks, marks]);

  const arrangement = chosen ?? (scope === "this" ? "time" : "source");
  const summaries = useMemo(() => new Map(app.sessions.map((summary) => [summary.sessionId, summary])), [app.sessions]);
  const titleOf = (id: string) => {
    const summary = summaries.get(id);
    return summary ? sessionTitle(summary, app.sessionDisplayNames, app.sessions) : id;
  };
  const groups = useMemo(
    () => arrangeMarked(items ?? [], arrangement, sessionId ?? "", query, (id) => summaries.get(id)?.updatedAt ?? ""),
    [items, arrangement, sessionId, query, summaries],
  );

  const jump = (target: string, row: string) => {
    if (target !== sessionId) main.openCatalogSession(target);
    requestRowJump(target, row);
  };
  const setExtent = (next: MarkedScope) => {
    setScope((prev) => (prev === next ? "this" : next));
    setChosen(null);
  };
  // Zotero's "note from annotations": the list as shown, written once to a new note.
  const makeNote = async () => {
    if (!sessionId || writing) return;
    setWriting(true);
    try {
      const date = fileNameDate(new Date(), currentLang());
      const labelOf = (id: string) => {
        const names = app.sessionDisplayNames[id];
        return conversationLabel(names?.alias ?? null, names?.snippet ?? titleOf(id));
      };
      const content = markedNote(groups, { date, scope, arrangement, labelOf });
      const note = await createNoteFile(sessionId, `${t("Bookmarks {date}", { date })}.md`);
      await putSessionFileContent(sessionId, { root: "working", path: note.path, content, expectedUpdatedAt: note.updatedAt ?? undefined, expectedFolderPath: note.folderPath });
      const rel = note.path.slice(note.path.indexOf("/") + 1);
      shell.openTarget({ kind: "file", sessionId, root: "working", path: note.path, absolutePath: `${note.folderPath}/${rel}` }, "rendered");
    } catch (reason) {
      window.alert(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWriting(false);
    }
  };
  const hasProject = Boolean(sessionId && summaries.get(sessionId)?.workspacePrimaryDir);
  const total = groups.reduce((n, group) => n + group.items.length, 0);

  if (!sessionId) return <div className="rp-empty">{t("Open a conversation to see its bookmarks and marks.")}</div>;
  return (
    <div className="marks-panel">
      <div className="frow">
        <MenuButton
          icon="ph-sort-ascending"
          label={arrangement === "time" ? t("By time") : t("By source")}
          choices={[
            { label: t("By time"), on: arrangement === "time", onSelect: () => setChosen("time") },
            { label: t("By source"), on: arrangement === "source", onSelect: () => setChosen("source") },
          ]}
        />
        <span className="flabel">{t("Extend to")}</span>
        {([["family", t("Family")], ...(hasProject ? [["project", t("Project")]] : []), ["all", t("All")]] as [MarkedScope, string][]).map(([key, label]) => (
          <button key={key} type="button" className={`fcard${scope === key ? " on" : ""}`} aria-pressed={scope === key} onClick={() => setExtent(key)}>
            {scope === key ? <i className="ph ph-check" /> : null}
            {label}
          </button>
        ))}
        <span className="fspacer" />
        <button
          type="button"
          className="fsearch-btn"
          data-tip={t("Make a note from these")}
          aria-label={t("Make a note from these")}
          disabled={writing || total === 0}
          onClick={() => void makeNote()}
        >
          <i className="ph ph-note-pencil" />
        </button>
        <button
          type="button"
          className={`fsearch-btn${searchOpen || query ? " on" : ""}`}
          data-tip={t("Search within these")}
          aria-label={t("Search within these")}
          onClick={() => { if (searchOpen) { setSearchOpen(false); setQuery(""); } else setSearchOpen(true); }}
        >
          <i className="ph ph-magnifying-glass" />
        </button>
      </div>
      {searchOpen ? (
        <div className="fsearch">
          <input autoFocus placeholder={t("Search…")} value={query} onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setSearchOpen(false); setQuery(""); } }} />
        </div>
      ) : null}
      {error ? <div className="rp-empty">{error}</div> : null}
      {!error && items && total === 0 ? (
        <div className="rp-empty">
          {query ? t("Nothing matches.") : t("No bookmarks or marks yet. Bookmark a message from its ⋯ menu; mark text by selecting it and right-clicking.")}
        </div>
      ) : null}
      {groups.map((group) => (
        <div key={group.sessionId ?? "all"}>
          {group.sessionId ? (
            <button type="button" className="sect-head marks-source" data-tip={t("Open conversation")} onClick={() => group.sessionId !== sessionId && main.openCatalogSession(group.sessionId!)}>
              <i className="ph ph-chat-text" />
              <span className="marks-source-title">{titleOf(group.sessionId)}</span>
              {group.sessionId === sessionId ? <span className="marks-here">{t("This conversation")}</span> : null}
              <span className="n">{group.items.length}</span>
            </button>
          ) : null}
          {group.items.map((item, index) => (
            <MarkedCard
              key={`${item.sessionId}:${item.kind}:${item.row}:${index}`}
              item={item}
              source={!group.sessionId && item.sessionId !== sessionId ? titleOf(item.sessionId) : null}
              onJump={jump}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const roleLabel = (role: MarkedItem["role"]) => role === "user" ? t("You") : role === "assistant" ? t("Alt") : t("Message");

function MarkedCard({ item, source, onJump }: {
  item: MarkedItem;
  /** The conversation's title when the list mixes conversations. */
  source: string | null;
  onJump: (sessionId: string, row: string) => void;
}) {
  const textRef = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 1);
  }, [item.text, open]);
  const reachable = item.order >= 0;
  const reference = `conversation:${item.sessionId}#${item.row}`;
  const dragText = [
    reference,
    item.kind === "bookmark" ? "" : `> ${item.text.replace(/\n/g, "\n> ")}`,
    item.note?.trim() ?? "",
  ].filter(Boolean).join("\n");
  const icon = item.kind === "bookmark" ? "ph-bookmark-simple" : item.kind === "under" ? "ph-text-underline" : item.kind === "strike" ? "ph-text-strikethrough" : null;
  return (
    <div
      className={`mk-item${reachable ? "" : " gone"}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", dragText);
        event.dataTransfer.effectAllowed = "copy";
      }}
      onClick={(event) => {
        if (!reachable || !window.getSelection()?.isCollapsed || (event.target as HTMLElement).closest("button")) return;
        onJump(item.sessionId, item.row);
      }}
      data-tip={reachable ? undefined : t("Not on this conversation's current branch")}
    >
      <div className="mk-meta">
        {icon ? <i className={`ph ${icon}`} aria-hidden="true" /> : <span className="mk-swatch" style={{ background: `var(--${item.kind})` }} aria-hidden="true" />}
        <span>{roleLabel(item.role)}{item.thinking ? ` · ${t("Thinking")}` : ""}</span>
        {source ? <span className="mk-source">{source}</span> : null}
      </div>
      <div ref={textRef} className={`mk-text mk-${item.kind}${open ? " open" : ""}`}>
        {item.kind === "bookmark" ? item.text || t("(no text)") : <span>{item.text}</span>}
      </div>
      {long || open ? (
        <button type="button" className="mk-more" onClick={() => setOpen((value) => !value)}>
          {open ? t("Collapse") : t("Expand")}
        </button>
      ) : null}
      {item.note?.trim() ? <div className="mk-note">{item.note}</div> : null}
      {item.at && item.at.row !== item.row ? (
        <button type="button" className="mk-at" data-tip={t("The latest message when this was bookmarked")} onClick={() => onJump(item.sessionId, item.at!.row)}>
          <i className="ph ph-clock-counter-clockwise" aria-hidden="true" />
          <span>{item.at.text}</span>
        </button>
      ) : null}
    </div>
  );
}
