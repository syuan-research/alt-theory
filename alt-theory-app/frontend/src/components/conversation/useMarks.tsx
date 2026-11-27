import { useEffect, useReducer, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { t } from "@/i18n";
import { copyText } from "@/lib/clipboard";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import { NoteCard, noteCardAt } from "@/components/conversation/NoteCard";
import {
  addMark,
  isColorMark,
  markEndRect,
  markOfNoteDot,
  marksAt,
  recolorMark,
  registerMarksHost,
  removeMarks,
  replaceMark,
  rowsInRange,
  withNote,
  type MarkKind,
  type TextMark,
} from "@/lib/marks";

/** Menu order is the spectrum; the kind ids are storage and stay as they were. */
const SWATCHES: Array<[MarkKind, string]> = [
  ["hl-5", "Red"], ["hl-3", "Orange"], ["hl-1", "Yellow"], ["hl-2", "Green"], ["hl-4", "Blue"],
];

function swatches(onPick: (kind: MarkKind) => void, current?: MarkKind): ContextMenuItem {
  return {
    label: t("Highlight"),
    onSelect: () => undefined,
    swatches: SWATCHES.map(([kind, name]) => ({
      color: `var(--${kind})`,
      label: t(name),
      current: kind === current,
      onSelect: () => onPick(kind),
    })),
  };
}

/** Copy through the page's own copy path (links keep their markdown), with
 *  the selection put back first in case opening the menu dropped it. */
function copyRange(range: Range): void {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  if (!document.execCommand("copy")) void copyText(range.toString());
}

// The selection cue's first few appearances also say what it is for, until a mark is made.
const HINT_KEY = "alt-marks-hint";
const HINT_TIMES = 3;
const hintCount = () => { try { return Number(window.localStorage.getItem(HINT_KEY)) || 0; } catch { return HINT_TIMES; } };
const setHintCount = (n: number) => { try { window.localStorage.setItem(HINT_KEY, String(n)); } catch { /* a convenience only */ } };

/** The selection's last line box, where the cue sits. */
function lastRect(range: Range): DOMRect | null {
  const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
  return rects.length ? rects[rects.length - 1] : null;
}

const INTERACTIVE = "a, button, input, textarea, select, summary, [role=button], [contenteditable=true]";

/**
 * Reader marks for one conversation pane (center or side): registers the
 * pane so its rows' marks paint, and gives the menus — on a selection:
 * highlight colors, underline, strikethrough, copy; on a mark: recolor, note,
 * remove. A mark's menu opens on right-click or a plain left click (a drag
 * still selects, a double click still selects a word). After a selection a
 * small triangle at its end opens the same menu as a right-click. A mark's
 * note opens in the bookmark's note card; a noted mark shows a dot.
 */
export function useMarks(
  ref: RefObject<HTMLElement | null>,
  sessionId: string | null,
  onError: (reason: unknown) => void,
  onHint?: (text: string) => void,
) {
  const menu = useContextMenu();
  const [cue, setCue] = useState<Range | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const clickTimer = useRef(0);
  const [note, setNote] = useState<{ at: { left: number; top: number }; anchor: HTMLElement | null; kind: MarkKind } | null>(null);
  const [noteText, setNoteText] = useState("");
  const editing = useRef<TextMark | null>(null);
  const savedNote = useRef("");

  useEffect(() => {
    const el = ref.current;
    if (!el || !sessionId) return;
    return registerMarksHost(el, sessionId);
  }, [ref, sessionId]);

  // The cue goes when the selection does; it follows the text when the pane scrolls.
  useEffect(() => {
    if (!cue) return;
    const host = ref.current;
    const change = () => {
      const selection = window.getSelection();
      const now = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!now || now.collapsed || now.compareBoundaryPoints(Range.END_TO_END, cue) !== 0 || now.compareBoundaryPoints(Range.START_TO_START, cue) !== 0) setCue(null);
    };
    document.addEventListener("selectionchange", change);
    host?.addEventListener("scroll", redraw);
    return () => {
      document.removeEventListener("selectionchange", change);
      host?.removeEventListener("scroll", redraw);
    };
  }, [cue, ref]);

  const saveNote = (value: string) => {
    const previous = editing.current;
    if (!previous || !sessionId || value === savedNote.current) return;
    const next = withNote(previous, value);
    editing.current = next;
    savedNote.current = value;
    replaceMark(sessionId, previous, next).catch(onError);
  };
  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => saveNote(noteText), 650);
    return () => window.clearTimeout(timer);
  }, [note, noteText]);

  const openNote = (mark: TextMark, rect: { left: number; bottom: number }, anchor: HTMLElement | null) => {
    editing.current = mark;
    savedNote.current = mark.note ?? "";
    setNoteText(savedNote.current);
    setNote({ at: noteCardAt(rect), anchor, kind: mark.kind });
  };
  const closeNote = () => {
    saveNote(noteText);
    setNote(null);
  };

  const selectionItems = (host: HTMLElement, range: Range): ContextMenuItem[] => {
    const selection = window.getSelection();
    const mark = (kind: MarkKind) => {
      selection?.removeAllRanges();
      setHintCount(HINT_TIMES);
      addMark(host, sessionId!, range, kind).catch(onError);
    };
    const markable = rowsInRange(host, range).length > 0;
    return [
      ...(markable
        ? [
            swatches(mark),
            { label: t("Underline"), icon: "ph-text-underline", onSelect: () => mark("under") },
            { label: t("Strikethrough"), icon: "ph-text-strikethrough", onSelect: () => mark("strike") },
          ]
        : []),
      { label: t("Copy"), icon: "ph-copy", separator: markable, onSelect: () => copyRange(range) },
    ];
  };

  const markItems = (host: HTMLElement, hits: TextMark[], at: { left: number; bottom: number }): ContextMenuItem[] => {
    const color: TextMark | undefined = hits.find((hit) => isColorMark(hit.kind));
    const target = color ?? hits[0];
    return [
      ...(color ? [swatches((kind) => recolorMark(sessionId!, color, kind).catch(onError), color.kind)] : []),
      {
        label: target.note ? t("Edit note") : t("Add note"),
        icon: "ph-note-pencil",
        separator: Boolean(color),
        onSelect: () => {
          const row = host.querySelector<HTMLElement>(`[data-mark-row="${CSS.escape(target.row)}"]`);
          openNote(target, markEndRect(host, sessionId!, target) ?? at, row);
        },
      },
      { label: t("Remove mark"), icon: "ph-eraser", onSelect: () => removeMarks(sessionId!, hits).catch(onError) },
    ];
  };

  const onContextMenu = (event: ReactMouseEvent) => {
    const host = ref.current;
    if (event.defaultPrevented || !host || !sessionId) return; // a link's own menu
    const selection = window.getSelection();
    const range = selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0).cloneRange() : null;
    if (range && host.contains(range.commonAncestorContainer)) {
      setCue(null);
      menu.open(event, selectionItems(host, range));
      return;
    }
    const hits = marksAt(host, sessionId, event.clientX, event.clientY);
    if (!hits.length) return;
    menu.open(event, markItems(host, hits, { left: event.clientX, bottom: event.clientY }));
  };

  const onClick = (event: ReactMouseEvent) => {
    const host = ref.current;
    if (!host || !sessionId || event.button !== 0 || event.defaultPrevented) return;
    const target = event.target as Element;
    const dot = target.closest?.(".mark-note-dot");
    if (dot) {
      const mark = markOfNoteDot(dot);
      if (mark) openNote(mark, dot.getBoundingClientRect(), dot as HTMLElement);
      return;
    }
    window.clearTimeout(clickTimer.current);
    if (event.detail > 1 || target.closest?.(INTERACTIVE)) return;
    if (window.getSelection()?.isCollapsed === false) return;
    const hits = marksAt(host, sessionId, event.clientX, event.clientY);
    if (!hits.length) return;
    const { clientX: x, clientY: y } = event;
    const anchor = event.currentTarget;
    // Wait out a double click, which selects a word instead.
    clickTimer.current = window.setTimeout(() => {
      if (window.getSelection()?.isCollapsed === false) return;
      menu.openAt(x, y, markItems(host, hits, { left: x, bottom: y }), anchor);
    }, 220);
  };

  const onMouseUp = (event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    window.setTimeout(() => {
      const host = ref.current;
      const selection = window.getSelection();
      if (!host || !sessionId || !selection?.rangeCount || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      if (!host.contains(range.commonAncestorContainer) || !rowsInRange(host, range).length) return;
      setCue(range.cloneRange());
      const shown = hintCount();
      if (onHint && shown < HINT_TIMES) {
        setHintCount(shown + 1);
        onHint(t("Click the small triangle, or right-click, to highlight or underline the selection."));
      }
    }, 0);
  };

  const cueRect = cue ? lastRect(cue) : null;
  const element = <>
    {menu.element}
    {note ? (
      <NoteCard
        at={note.at}
        label={t("Note")}
        anchor={note.anchor}
        value={noteText}
        onChange={setNoteText}
        onClose={closeNote}
        head={<>
          {isColorMark(note.kind)
            ? <span className="note-swatch" style={{ background: `var(--${note.kind})` }} aria-hidden="true" />
            : <i className={`ph ${note.kind === "under" ? "ph-text-underline" : "ph-text-strikethrough"}`} aria-hidden="true" />}
          <span>{t("Note")}</span>
        </>}
      />
    ) : null}
    {cueRect && !menu.element && !note ? createPortal(
      <button
        type="button"
        className="selection-cue"
        style={{ left: cueRect.right - 7, top: cueRect.top - 13 }}
        aria-label={t("Mark the selection")}
        data-tip={t("Mark the selection")}
        onPointerDown={(event) => event.preventDefault()}
        onClick={(event) => {
          const host = ref.current;
          if (!host || !cue) return;
          const box = event.currentTarget.getBoundingClientRect();
          const range = cue;
          setCue(null);
          menu.openAt(box.left, box.bottom + 2, selectionItems(host, range), event.currentTarget);
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.6 14 13.4H2Z" /></svg>
      </button>,
      document.body,
    ) : null}
  </>;

  return { onContextMenu, onClick, onMouseUp, menu: element };
}
