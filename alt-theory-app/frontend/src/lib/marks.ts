import { fetchMarks, saveMarks, type TextMark } from "@/api/sessions";
import { collectText } from "@/lib/find";

/**
 * Reader marks on conversation text (owner 2026-10-13): four highlight
 * colors plus underline and strikethrough, painted with the CSS Custom
 * Highlight API like Ctrl+F (no DOM wrapping); Ctrl+F paints above them.
 * Any conversation pane can host marks: rows carry `data-mark-row`, the
 * pane registers itself with its session id. Stored per session beside the
 * history (backend session-marks.ts), anchored by row id + quoted text.
 */

export type { TextMark };
export type MarkKind = TextMark["kind"];
export const COLOR_KINDS = ["hl-1", "hl-2", "hl-3", "hl-4"] as const;
const KINDS: MarkKind[] = [...COLOR_KINDS, "under", "strike"];
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

function load(sessionId: string): Promise<TextMark[]> {
  const cached = cache.get(sessionId);
  if (cached) return Promise.resolve(cached);
  let pending = loading.get(sessionId);
  if (!pending) {
    pending = fetchMarks(sessionId)
      .then((marks) => {
        cache.set(sessionId, marks);
        schedulePaint();
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
  // One save at a time per session, each sending the latest list, so a
  // slow earlier save can never land after a later one and drop a mark.
  const next = (saving.get(sessionId) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => saveMarks(sessionId, cache.get(sessionId) ?? []));
  saving.set(sessionId, next);
  await next;
}

// ---- hosts + painting -----------------------------------------------------

const HAS_HIGHLIGHT = typeof CSS !== "undefined" && "highlights" in CSS;
const hosts = new Set<{ el: HTMLElement; sessionId: string }>();
let frame = 0;

function rowEl(host: HTMLElement, row: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`[data-mark-row="${CSS.escape(row)}"]`);
}

/** Every mark of the host's session that is on screen, with its range. */
function located(host: HTMLElement, sessionId: string): { mark: TextMark; range: Range; span: [number, number] }[] {
  const out: { mark: TextMark; range: Range; span: [number, number] }[] = [];
  const rows = new Map<string, RowText | null>();
  for (const mark of cache.get(sessionId) ?? []) {
    if (!rows.has(mark.row)) {
      const el = rowEl(host, mark.row);
      rows.set(mark.row, el ? rowText(el) : null);
    }
    const row = rows.get(mark.row);
    const span = row && locate(row.text, mark);
    const range = span && rangeOf(row, span[0], span[1]);
    if (span && range) out.push({ mark, range, span });
  }
  return out;
}

function paint(): void {
  frame = 0;
  if (!HAS_HIGHLIGHT) return;
  const byKind = new Map<MarkKind, Range[]>();
  for (const { el, sessionId } of hosts) {
    if (!el.isConnected) continue;
    for (const { mark, range } of located(el, sessionId)) {
      const ranges = byKind.get(mark.kind) ?? [];
      ranges.push(range);
      byKind.set(mark.kind, ranges);
    }
  }
  for (const kind of KINDS) {
    const ranges = byKind.get(kind);
    if (ranges) CSS.highlights.set(kind, new Highlight(...ranges));
    else CSS.highlights.delete(kind);
  }
}

function schedulePaint(): void {
  if (!frame && typeof requestAnimationFrame !== "undefined") frame = requestAnimationFrame(paint);
}

/** Paint this pane's marks and keep them painted as its rows re-render. */
export function registerMarksHost(el: HTMLElement, sessionId: string): () => void {
  const host = { el, sessionId };
  hosts.add(host);
  void load(sessionId).catch(() => undefined);
  // ponytail: repaints the whole set on any DOM change, one frame at most;
  // cheap while marked rows are few — scope to the changed row if it shows up.
  const observer = new MutationObserver(schedulePaint);
  observer.observe(el, { childList: true, subtree: true, characterData: true });
  schedulePaint();
  return () => {
    observer.disconnect();
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
  return update(sessionId, (marks) => marks.map((mark) => (mark === target ? { ...mark, kind } : mark)));
}

