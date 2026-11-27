import { fetchMarks, saveMarks, type TextMark } from "@/api/sessions";
import { collectText } from "@/lib/find";

/**
 * Reader marks on conversation text (owner 2026-10-13): five highlight
 * colors (red added 2026-11-26) plus underline and strikethrough, drawn as
 * blocks in a layer over the text (no DOM wrapping). Not the CSS Custom
 * Highlight API (2026-11-27): the browser repaints every highlighted passage
 * on any change anywhere on the page, which with software rendering made
 * scrolling and streaming slow; blocks repaint only where they are.
 * Any conversation pane can host marks: rows carry `data-mark-row`, the
 * pane registers itself with its session id. Stored per session beside the
 * history (backend session-marks.ts), anchored by row id + quoted text.
 */

export type { TextMark };
export type MarkKind = TextMark["kind"];
export const COLOR_KINDS = ["hl-1", "hl-2", "hl-3", "hl-4", "hl-5"] as const;
export const isColorMark = (kind: MarkKind) => (COLOR_KINDS as readonly string[]).includes(kind);
/** Colors replace each other; underline and strikethrough stack on them. */
const group = (kind: MarkKind) => (isColorMark(kind) ? "color" : kind);

// ---- anchoring (pure) -----------------------------------------------------

type Anchor = Pick<TextMark, "quote" | "prefix" | "suffix">;
const CONTEXT = 32;

/** The quote for [start, end) of `text`, whitespace-trimmed; null if blank. */
export function anchorAt(text: string, start: number, end: number): Anchor | null {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (start >= end) return null;
  return {
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
  };
}

/** Where the quote sits in `text`: the occurrence whose surroundings match
 *  the stored context best. */
export function locate(text: string, anchor: Anchor): [number, number] | null {
  let best = -1;
  let bestScore = -1;
  const full = anchor.prefix.length + anchor.suffix.length;
  for (let i = text.indexOf(anchor.quote); i >= 0; i = text.indexOf(anchor.quote, i + 1)) {
    let before = 0;
    while (before < anchor.prefix.length && text[i - 1 - before] === anchor.prefix[anchor.prefix.length - 1 - before]) before++;
    const after0 = i + anchor.quote.length;
    let after = 0;
    while (after < anchor.suffix.length && text[after0 + after] === anchor.suffix[after]) after++;
    if (before + after > bestScore) {
      best = i;
      bestScore = before + after;
      if (bestScore === full) break;
    }
  }
  return best < 0 ? null : [best, best + anchor.quote.length];
}

// ---- row text (DOM) -------------------------------------------------------

interface RowText {
  nodes: (Text | null)[];
  texts: string[];
  text: string;
}

function rowText(row: HTMLElement): RowText {
  const { nodes, texts } = collectText(row);
  return { nodes, texts, text: texts.join("") };
}

/** A DOM point as an offset into the row's text. */
function offsetOf(row: RowText, container: Node, offset: number): number {
  const probe = document.createRange();
  probe.setStart(container, offset);
  let pos = 0;
  for (let i = 0; i < row.nodes.length; i++) {
    const node = row.nodes[i];
    if (node === container) return pos + offset;
    if (node && probe.comparePoint(node, 0) > 0) return pos;
    pos += row.texts[i].length;
  }
  return pos;
}

/** Screen boxes of the text in [start, end), one per text node piece; text
 *  only, so a fully covered element's own box never counts. */
function textRects(row: RowText, start: number, end: number): DOMRect[] {
  const out: DOMRect[] = [];
  const range = document.createRange();
  let pos = 0;
  for (let i = 0; i < row.nodes.length; i++) {
    const node = row.nodes[i];
    const len = row.texts[i].length;
    if (node && start < pos + len && pos < end) {
      range.setStart(node, Math.max(0, start - pos));
      range.setEnd(node, Math.min(len, end - pos));
      out.push(...range.getClientRects());
    }
    pos += len;
  }
  return out;
}

export interface Box { left: number; top: number; right: number; bottom: number }

/** One box per line: pieces that share a line merge, empty ones drop. */
export function lineBoxes(rects: readonly Box[]): Box[] {
  const lines: Box[] = [];
  for (const r of rects) {
    if (r.right - r.left < 0.5 || r.bottom - r.top < 0.5) continue;
    const line = lines.find((l) => Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top) > 0.5 * Math.min(l.bottom - l.top, r.bottom - r.top));
    if (!line) lines.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    else Object.assign(line, { left: Math.min(line.left, r.left), top: Math.min(line.top, r.top), right: Math.max(line.right, r.right), bottom: Math.max(line.bottom, r.bottom) });
  }
  return lines;
}

function rangeOf(row: RowText, start: number, end: number): Range | null {
  const range = document.createRange();
  let pos = 0;
  let started = false;
  for (let i = 0; i < row.nodes.length; i++) {
    const node = row.nodes[i];
    const len = row.texts[i].length;
    if (node && !started && start < pos + len) {
      range.setStart(node, Math.max(0, start - pos));
      started = true;
    }
    if (node && started && end <= pos + len) {
      range.setEnd(node, Math.max(0, end - pos));
      return range;
    }
    pos += len;
  }
  return null;
}

// ---- store ----------------------------------------------------------------

const cache = new Map<string, TextMark[]>();
const loading = new Map<string, Promise<TextMark[]>>();
const listeners = new Set<() => void>();
const NO_MARKS: TextMark[] = [];

/** For a reader of the marks list (the scrub rail): the session's marks as loaded. */
export function marksOf(sessionId: string | null): TextMark[] {
  return (sessionId && cache.get(sessionId)) || NO_MARKS;
}
export function subscribeMarks(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function load(sessionId: string): Promise<TextMark[]> {
  const cached = cache.get(sessionId);
  if (cached) return Promise.resolve(cached);
  let pending = loading.get(sessionId);
  if (!pending) {
    pending = fetchMarks(sessionId)
      .then((marks) => {
        cache.set(sessionId, marks);
        schedulePaint();
        listeners.forEach((listener) => listener());
        return marks;
      })
      .finally(() => loading.delete(sessionId));
    loading.set(sessionId, pending);
  }
  return pending;
}

const saving = new Map<string, Promise<void>>();

async function update(sessionId: string, change: (marks: TextMark[]) => TextMark[]): Promise<void> {
  cache.set(sessionId, change(await load(sessionId)));
  schedulePaint();
  listeners.forEach((listener) => listener());
  // One save at a time per session, each sending the latest list, so a
  // slow earlier save can never land after a later one and drop a mark.
  const next = (saving.get(sessionId) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => saveMarks(sessionId, cache.get(sessionId) ?? []));
  saving.set(sessionId, next);
  await next;
}

// ---- hosts + painting -----------------------------------------------------

const hosts = new Set<{ el: HTMLElement; sessionId: string }>();
let frame = 0;

function rowEl(host: HTMLElement, row: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`[data-mark-row="${CSS.escape(row)}"]`);
}

/** Every mark of the host's session that is on screen, with its range. */
function located(host: HTMLElement, sessionId: string): { mark: TextMark; range: Range; span: [number, number]; row: RowText }[] {
  const out: { mark: TextMark; range: Range; span: [number, number]; row: RowText }[] = [];
  const rows = new Map<string, RowText | null>();
  for (const mark of cache.get(sessionId) ?? []) {
    if (!rows.has(mark.row)) {
      const el = rowEl(host, mark.row);
      rows.set(mark.row, el ? rowText(el) : null);
    }
    const row = rows.get(mark.row);
    const span = row && locate(row.text, mark);
    const range = span && rangeOf(row, span[0], span[1]);
    if (span && range) out.push({ mark, range, span, row });
  }
  return out;
}

const LAYER = "mark-layer";
const dotMarks = new WeakMap<Element, TextMark>();
/** The mark a note dot stands for. */
export const markOfNoteDot = (el: Element): TextMark | undefined => dotMarks.get(el);

/** The marks as blocks, and a small dot after each mark that has a note
 *  (owner 2026-11-26), in a zero-height layer at the top of the pane so they
 *  scroll with the text. Strike and underline go first so a color multiplies
 *  over them. */
function drawMarks(host: HTMLElement, items: ReturnType<typeof located>): void {
  let layer = host.querySelector<HTMLElement>(`:scope > .${LAYER}`);
  if (!items.length) { layer?.remove(); return; }
  if (!layer) {
    layer = document.createElement("div");
    layer.className = LAYER;
    host.prepend(layer);
  }
  const base = layer.getBoundingClientRect();
  const order = (kind: MarkKind) => (kind === "strike" ? 0 : kind === "under" ? 1 : 2);
  const blocks: { kind: MarkKind; x: number; y: number; w: number; h: number }[] = [];
  const dots: { mark: TextMark; x: number; y: number }[] = [];
  for (const { mark, span, row } of [...items].sort((a, b) => order(a.mark.kind) - order(b.mark.kind))) {
    const lines = lineBoxes(textRects(row, span[0], span[1]));
    for (const l of lines) blocks.push({ kind: mark.kind, x: Math.round(l.left - base.left), y: Math.round(l.top - base.top), w: Math.round(l.right - l.left), h: Math.round(l.bottom - l.top) });
    const end = lines[lines.length - 1];
    if (mark.note && end) dots.push({ mark, x: Math.round(end.right - base.left), y: Math.round(end.top - base.top) });
  }
  const key = blocks.map((b) => `${b.kind},${b.x},${b.y},${b.w},${b.h}`).join("|") + "#" + dots.map(({ mark, x, y }) => `${x},${y},${mark.kind},${mark.note}`).join("|");
  if (layer.dataset.key === key) return;
  layer.dataset.key = key;
  layer.replaceChildren(
    ...blocks.map(({ kind, x, y, w, h }) => {
      const block = document.createElement("div");
      block.className = `mark-block mark-${kind}`;
      block.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
      return block;
    }),
    ...dots.map(({ mark, x, y }) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "mark-note-dot";
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      dot.style.setProperty("--c", isColorMark(mark.kind) ? `var(--${mark.kind})` : "var(--text-3)");
      dot.dataset.tip = mark.note!.length > 240 ? `${mark.note!.slice(0, 240)}…` : mark.note!;
      dot.setAttribute("aria-label", mark.note!);
      dotMarks.set(dot, mark);
      return dot;
    }),
  );
}

function paint(): void {
  frame = 0;
  for (const { el, sessionId } of hosts) if (el.isConnected) drawMarks(el, located(el, sessionId));
}

function schedulePaint(): void {
  if (!frame && typeof requestAnimationFrame !== "undefined") frame = requestAnimationFrame(paint);
}

/** Paint this pane's marks and keep them painted as its rows re-render. */
export function registerMarksHost(el: HTMLElement, sessionId: string): () => void {
  const host = { el, sessionId };
  hosts.add(host);
  void load(sessionId).catch(() => undefined);
  // ponytail: re-measures the whole set on any DOM change, one frame at most,
  // and writes nothing when no block moved; scope to the changed row if the
  // measuring shows up. The layer's own changes are not a reason to repaint.
  const observer = new MutationObserver((records) => {
    if (records.some((record) => !(record.target instanceof Element ? record.target : record.target.parentElement)?.closest(`.${LAYER}`))) schedulePaint();
  });
  // `open`: a fold above a mark moves the text without changing children.
  observer.observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["open"] });
  // Text reflows when the pane's width changes, and moves when an image above loads.
  const resize = new ResizeObserver(schedulePaint);
  resize.observe(el);
  el.addEventListener("load", schedulePaint, true);
  schedulePaint();
  return () => {
    observer.disconnect();
    resize.disconnect();
    el.removeEventListener("load", schedulePaint, true);
    el.querySelector(`:scope > .${LAYER}`)?.remove();
    hosts.delete(host);
    schedulePaint();
  };
}

// ---- actions --------------------------------------------------------------

const intersects = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

/** The markable rows a selection touches. */
export function rowsInRange(host: HTMLElement, range: Range): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>("[data-mark-row]")].filter((el) => range.intersectsNode(el));
}

export async function addMark(host: HTMLElement, sessionId: string, range: Range, kind: MarkKind): Promise<void> {
  const additions: { mark: TextMark; span: [number, number] }[] = [];
  for (const el of rowsInRange(host, range)) {
    const row = rowText(el);
    const start = el.contains(range.startContainer) ? offsetOf(row, range.startContainer, range.startOffset) : 0;
    const end = el.contains(range.endContainer) ? offsetOf(row, range.endContainer, range.endOffset) : row.text.length;
    const anchor = anchorAt(row.text, start, end);
    if (!anchor) continue;
    const span = locate(row.text, anchor)!;
    additions.push({ mark: { row: el.dataset.markRow!, kind, ...anchor }, span });
  }
  if (!additions.length) return;
  await load(sessionId);
  const onScreen = located(host, sessionId);
  // ponytail: an overlapping mark of the same group is replaced whole, not split.
  const replaced = new Set(
    onScreen
      .filter(({ mark, span }) =>
        additions.some((a) => a.mark.row === mark.row && group(a.mark.kind) === group(mark.kind) && intersects(a.span, span)),
      )
      .map(({ mark }) => mark),
  );
  // A note on a replaced mark moves to the new one instead of being lost.
  const note = [...replaced].find((mark) => mark.note)?.note;
  if (note) additions[0].mark.note = note;
  await update(sessionId, (marks) => [...marks.filter((mark) => !replaced.has(mark)), ...additions.map((a) => a.mark)]);
}

/** Marks under a viewport point (a right-click with no selection). */
export function marksAt(host: HTMLElement, sessionId: string, x: number, y: number): TextMark[] {
  const caret = document.caretRangeFromPoint?.(x, y);
  const node = caret?.startContainer;
  const el = (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>("[data-mark-row]");
  if (!caret || !el || !host.contains(el)) return [];
  const pos = offsetOf(rowText(el), caret.startContainer, caret.startOffset);
  return located(host, sessionId)
    .filter(({ mark, span }) => mark.row === el.dataset.markRow && span[0] <= pos && pos < span[1])
    .map(({ mark }) => mark);
}

export function removeMarks(sessionId: string, gone: TextMark[]): Promise<void> {
  return update(sessionId, (marks) => marks.filter((mark) => !gone.includes(mark)));
}

export function recolorMark(sessionId: string, target: TextMark, kind: MarkKind): Promise<void> {
  return replaceMark(sessionId, target, { ...target, kind });
}

/** Swap one mark for its edited copy (recolor, note). */
export function replaceMark(sessionId: string, target: TextMark, next: TextMark): Promise<void> {
  return update(sessionId, (marks) => marks.map((mark) => (mark === target ? next : mark)));
}

/** The mark with its note set; a blank note removes it. */
export function withNote(mark: TextMark, note: string): TextMark {
  const { note: _old, ...rest } = mark;
  return note.trim() ? { ...rest, note } : rest;
}

/** Where a mark ends on screen, for opening its note card there. */
export function markEndRect(host: HTMLElement, sessionId: string, target: TextMark): DOMRect | null {
  const hit = located(host, sessionId).find(({ mark }) => mark === target);
  const rects = hit?.range.getClientRects();
  return rects?.length ? rects[rects.length - 1] : null;
}


// ---- the scrub rail -------------------------------------------------------

/** What the scrub rail shows for one turn (owner 2026-11-26): a dot when
 *  something in it is bookmarked, and its marks' colors along the tick
 *  (underline and strikethrough as one neutral color). */
export interface RailMark {
  bookmark: boolean;
  colors: string[];
}

export function railMarksOf(
  turns: readonly { rowId: string; replies?: string[] }[],
  bookmarkRows: readonly string[],
  marks: readonly TextMark[],
): Map<string, RailMark> {
  const turnOf = new Map<string, string>();
  for (const turn of turns) {
    turnOf.set(turn.rowId, turn.rowId);
    for (const row of turn.replies ?? []) turnOf.set(row, turn.rowId);
  }
  const out = new Map<string, RailMark>();
  const at = (row: string) => {
    const turn = turnOf.get(row.replace(/#thinking$/, ""));
    if (!turn) return null;
    if (!out.has(turn)) out.set(turn, { bookmark: false, colors: [] });
    return out.get(turn)!;
  };
  for (const row of bookmarkRows) {
    const mark = at(row);
    if (mark) mark.bookmark = true;
  }
  for (const mark of marks) {
    const rail = at(mark.row);
    const color = isColorMark(mark.kind) ? `var(--${mark.kind})` : "var(--text-3)";
    if (rail && !rail.colors.includes(color)) rail.colors.push(color);
  }
  return out;
}
