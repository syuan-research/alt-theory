import { useEffect, useRef, type RefObject } from "react";

/**
 * Ctrl+F (WP 2026-09-24): find acts on what the user last touched. Three
 * separate facts, three homes — position truth stays in the shell, content
 * memory in paneMemory, and this module only holds *attention* (which column
 * the user last touched) plus a registry of the find targets that are
 * mounted right now. The dispatcher never re-derives from shell state what a
 * pane shows; the component that renders the content registers itself.
 */

// ---- matching (pure) ------------------------------------------------------

/** One match: [startSegment, startOffset, endSegment, endOffset), end exclusive. */
export type Span = [number, number, number, number];

/** Lowercase without changing length, so offsets map back to the source. */
function fold(text: string): string {
  const lower = text.toLowerCase();
  if (lower.length === text.length) return lower;
  let out = "";
  for (const ch of text) {
    const l = ch.toLowerCase();
    out += l.length === ch.length ? l : ch;
  }
  return out;
}

/** Case-insensitive literal matches of `query` across the joined segments. */
export function findSpans(segments: string[], query: string): Span[] {
  const needle = fold(query);
  if (!needle) return [];
  const starts: number[] = [];
  let total = 0;
  for (const segment of segments) {
    starts.push(total);
    total += segment.length;
  }
  const hay = fold(segments.join(""));
  const at = (pos: number): [number, number] => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return [lo, pos - starts[lo]];
  };
  const spans: Span[] = [];
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) {
    const [a, ao] = at(i);
    const [b, bo] = at(i + needle.length - 1);
    spans.push([a, ao, b, bo + 1]);
  }
  return spans;
}

// ---- DOM text -------------------------------------------------------------

/** Never searched: controls, editors, and anything a host marks as chrome. */
const SKIP = "button, textarea, input, select, script, style, [data-find-skip]";
/** A text run never continues across these (no "end of one para + next"). */
const BLOCK = "p, li, pre, td, th, h1, h2, h3, h4, h5, h6, blockquote, summary, dt, dd, tr, div";

function collectText(host: HTMLElement): { nodes: (Text | null)[]; texts: string[] } {
  const nodes: (Text | null)[] = [];
  const texts: string[] = [];
  let lastBlock: Element | null = null;
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !node.nodeValue || parent.closest(SKIP)) continue;
    // Collapsed thinking / tool detail stays searchable (the jump opens
    // it); anything hidden another way (mermaid's parked source) is not.
    if (!parent.closest("details:not([open])") && !parent.checkVisibility()) continue;
    const block = parent.closest(BLOCK);
    if (block !== lastBlock) {
      nodes.push(null);
      texts.push("\n");
      lastBlock = block;
    }
    nodes.push(node as Text);
    texts.push(node.nodeValue);
  }
  return { nodes, texts };
}

export function findRanges(host: HTMLElement, query: string): Range[] {
  const { nodes, texts } = collectText(host);
  return findSpans(texts, query).map(([a, ao, b, bo]) => {
    const range = document.createRange();
    range.setStart(nodes[a]!, ao);
    range.setEnd(nodes[b]!, bo);
    return range;
  });
}

/** The element that scrolls for `el` (itself included). `overflowing`
 *  skips boxes with nothing to scroll vertically: a code block with
 *  overflow-x: auto computes overflow-y: auto too. */
export function scrollerOf(el: Element | null, overflowing = false): HTMLElement | null {
  for (let node = el; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (
      (overflow === "auto" || overflow === "scroll") &&
      (!overflowing || node.scrollHeight > node.clientHeight)
    ) {
      return node as HTMLElement;
    }
  }
  return null;
}

/** Open any collapsed block around the match and scroll only its own
 *  scroller (scrollIntoView would also shift overflow:hidden ancestors). */
export function revealRange(range: Range): void {
  const start = range.startContainer.parentElement;
  for (let d = start?.closest("details:not([open])"); d; d = d.parentElement?.closest("details:not([open])")) {
    (d as HTMLDetailsElement).open = true;
  }
  const scroller = scrollerOf(start, true);
  if (!scroller) return;
  const r = range.getBoundingClientRect();
  const s = scroller.getBoundingClientRect();
  if (r.top < s.top || r.bottom > s.bottom) scroller.scrollTop += r.top - s.top - s.height / 3;
}

// ---- targets --------------------------------------------------------------

/** Two kinds (owner 2026-09-24): inside an opened conversation or file,
 *  full-text find in the floating bar (`{}`); in a pane that lists things
 *  to open (conversations, files, changes), its own filter box (`focus`). */
export type FindSpec = { focus?: () => void };
export type FindTarget = FindSpec & { el: HTMLElement };

interface Entry {
  ref: RefObject<HTMLElement | null>;
  spec: RefObject<FindSpec | null>;
}
const targets = new Set<Entry>();

/** Register the element as this pane's find target while `spec` is non-null. */
export function useFindTarget(ref: RefObject<HTMLElement | null>, spec: FindSpec | null): void {
  const specRef = useRef(spec);
  specRef.current = spec;
  const on = spec !== null;
  useEffect(() => {
    if (!on) return;
    const entry = { ref, spec: specRef };
    targets.add(entry);
    return () => {
      targets.delete(entry);
    };
  }, [on, ref]);
}

function live(entry: Entry): FindTarget | null {
  const el = entry.ref.current;
  const spec = entry.spec.current;
  return el && spec && el.isConnected && el.checkVisibility() ? { ...spec, el } : null;
}

/** Still a registered, visible target (the bar closes when this goes false). */
export function isFindTarget(el: HTMLElement): boolean {
  for (const entry of targets) {
    if (entry.ref.current === el && live(entry)) return true;
  }
  return false;
}

// ---- attention ------------------------------------------------------------

type Column = "left" | "center" | "right";
const COLUMN_ROOT: Record<Column, string> = {
  left: "aside.left",
  center: "main.center",
  right: "aside.right",
};
let attention: Column = "center";

function columnOf(target: EventTarget | null): Column | null {
  if (!(target instanceof Element)) return null;
  // A conversation row opens its content in the center, so touching it
  // means the center (owner ruling 2026-09-24).
  const hit = target.closest("[data-find-attention], aside.left, main.center, aside.right");
  if (!hit) return null;
  const marked = (hit as HTMLElement).dataset.findAttention as Column | undefined;
  if (marked) return marked;
  return hit.matches("aside.left") ? "left" : hit.matches("main.center") ? "center" : "right";
}

/** Only user-made events count: programmatic scroll (stick-to-bottom,
 *  scroll restore) and autofocus (approval dock, restored draft) would
 *  otherwise move attention on their own. Modified keys are skipped so the
 *  Ctrl+F press itself never re-targets. */
export function trackAttention(): () => void {
  const note = (event: Event) => {
    const column = columnOf(event.target);
    if (column) attention = column;
  };
  const key = (event: KeyboardEvent) => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey) note(event);
  };
  document.addEventListener("pointerdown", note, true);
  document.addEventListener("keydown", key, true);
  document.addEventListener("wheel", note, { capture: true, passive: true });
  return () => {
    document.removeEventListener("pointerdown", note, true);
    document.removeEventListener("keydown", key, true);
    document.removeEventListener("wheel", note, true);
  };
}

/** What Ctrl+F acts on now; null = swallow the key. */
export function resolveFindTarget(): FindTarget | null {
  // Login / import / confirm dialogs cover still-mounted, visible columns.
  if (document.querySelector('[aria-modal="true"]')) return null;
  const column = document.querySelector(COLUMN_ROOT[attention]);
  if (!column) return null;
  let found: FindTarget | null = null;
  for (const entry of targets) {
    const target = live(entry);
    if (target && column.contains(target.el)) found = target;
  }
  return found;
}
