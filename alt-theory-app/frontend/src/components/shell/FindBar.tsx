import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "@/i18n";
import { useHotkey } from "@/lib/hotkeys";
import {
  findRanges,
  isFindTarget,
  resolveFindTarget,
  revealRange,
  scrollerOf,
  trackAttention,
  type FindTarget,
} from "@/lib/find";

const HAS_HIGHLIGHT = typeof CSS !== "undefined" && "highlights" in CSS;

function paint(ranges: Range[], current: number): void {
  if (!HAS_HIGHLIGHT) return; // no Highlight API: jumping still works
  if (ranges.length) {
    const all = new Highlight();
    for (const range of ranges) all.add(range);
    CSS.highlights.set("find", all);
  } else CSS.highlights.delete("find");
  const range = ranges[current];
  if (range) CSS.highlights.set("find-current", new Highlight(range));
  else CSS.highlights.delete("find-current");
}

/**
 * The app's one Ctrl+F handler and its floating bar (WP 2026-09-24). The
 * bar is bound to one host element: it closes when the host unmounts, hides
 * or stops being a target (a preview switched to Edit); when the same host
 * swaps content (another conversation) the query stays and the count
 * refreshes without scrolling. Portaled to <body>, so touching the bar never
 * moves attention.
 */
export function FindBar() {
  const [host, setHost] = useState<FindTarget | null>(null);
  const [query, setQuery] = useState("");
  // What is searched: the input once typing pauses, never mid-composition
  // (each pinyin letter would otherwise search the whole pane).
  const [needle, setNeedle] = useState("");
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [more, setMore] = useState(false);
  const composing = useRef(false);
  const [, relayout] = useReducer((n: number) => n + 1, 0);
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const rangesRef = useRef<Range[]>([]);
  const moreRef = useRef(false);
  const indexRef = useRef(0);
  const hostRef = useRef(host);
  hostRef.current = host;
  const needleRef = useRef(needle);
  needleRef.current = needle;
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => trackAttention(), []);

  const show = useCallback((i: number, reveal: boolean) => {
    const list = rangesRef.current;
    const current = list.length ? ((i % list.length) + list.length) % list.length : 0;
    indexRef.current = current;
    setIndex(current);
    setCount(list.length);
    setMore(moreRef.current);
    paint(list, current);
    if (reveal && list[current]) revealRange(list[current]);
  }, []);

  const close = useCallback(() => {
    const back = returnFocus.current;
    returnFocus.current = null;
    const active = document.activeElement;
    // Return the pre-open focus when the user is still inside the bar — the
    // input, but also a step button that took the click focus.
    if (back instanceof HTMLElement && back.isConnected && (active === inputRef.current || !!barRef.current?.contains(active))) {
      back.focus();
    }
    rangesRef.current = [];
    moreRef.current = false;
    paint([], 0);
    setHost(null);
  }, []);

  const onFind = useCallback(() => {
    const target = resolveFindTarget();
    if (!target) return;
    if (target.focus) {
      if (hostRef.current) close();
      target.focus();
      return;
    }
    if (!hostRef.current) returnFocus.current = document.activeElement;
    if (hostRef.current?.el !== target.el) setHost(target);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [close]);
  useHotkey("find", onFind);

  // Escape closes the bar wherever focus now is: the step buttons take the
  // click focus, and clicking the content parks it on the body. Another
  // surface's editable keeps its own Escape meaning (the composer aborts a
  // running turn); a modal dialog wins.
  useEffect(() => {
    if (!host) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        !barRef.current?.contains(active) &&
        active.closest("input, textarea, select, [contenteditable]")
      ) {
        return;
      }
      event.preventDefault();
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [host, close]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!composing.current) setNeedle(query);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [query]);

  const search = useCallback((el: HTMLElement) => {
    const found = findRanges(el, needleRef.current);
    rangesRef.current = found.ranges;
    moreRef.current = found.more;
  }, []);

  // New query or new host: jump to the first match from the current view down.
  useEffect(() => {
    if (!host) return;
    search(host.el);
    const top = scrollerOf(host.el)?.getBoundingClientRect().top ?? 0;
    const first = rangesRef.current.findIndex((range) => range.getBoundingClientRect().bottom >= top);
    show(Math.max(0, first), true);
  }, [host, needle, search, show]);

  // Content changes (stream settles, mermaid draws, conversation switch):
  // recount quietly; a host that left or hid closes the bar. Debounced, so a
  // streaming reply recounts once it pauses.
  useEffect(() => {
    if (!host) return;
    let timer = 0;
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!isFindTarget(host.el)) {
          close();
          return;
        }
        search(host.el);
        show(Math.min(indexRef.current, rangesRef.current.length - 1), false);
      }, 150);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["hidden", "open", "class"],
    });
    const box = scrollerOf(host.el) ?? host.el;
    const resize = new ResizeObserver(() => relayout());
    resize.observe(box);
    return () => {
      observer.disconnect();
      resize.disconnect();
      window.clearTimeout(timer);
    };
  }, [host, close, search, show]);

  if (!host) return null;
  const rect = (scrollerOf(host.el) ?? host.el).getBoundingClientRect();
  return createPortal(
    <div
      ref={barRef}
      className="find-bar"
      role="search"
      style={{ top: rect.top + 8, right: Math.max(8, window.innerWidth - rect.right + 16) }}
    >
      <input
        ref={inputRef}
        value={query}
        placeholder={t("Find…")}
        aria-label={t("Find")}
        onChange={(event) => setQuery(event.target.value)}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          setNeedle(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            // Enter before the pause searches now (the effect jumps to the first).
            if (needleRef.current !== query) setNeedle(query);
            else show(indexRef.current + (event.shiftKey ? -1 : 1), true);
          }
        }}
      />
      <span className="n">{needle ? (count ? `${index + 1}/${count}${more ? "+" : ""}` : t("No results")) : ""}</span>
      <button
        type="button"
        aria-label={t("Previous match")}
        data-tip={t("Previous match")}
        disabled={!count}
        onClick={() => show(indexRef.current - 1, true)}
      >
        <i className="ph ph-caret-up" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={t("Next match")}
        data-tip={t("Next match")}
        disabled={!count}
        onClick={() => show(indexRef.current + 1, true)}
      >
        <i className="ph ph-caret-down" aria-hidden="true" />
      </button>
      <button type="button" aria-label={t("Close")} data-tip={t("Close")} onClick={close}>
        <i className="ph ph-x" aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}
