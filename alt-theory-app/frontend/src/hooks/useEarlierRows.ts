import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { TranscriptMessage } from "@/api/types";
import type { FindSpec } from "@/lib/find";

/**
 * Older rows without a "load more" stop (perf plan WP 2.2): the next page is
 * asked for while a screen and a half is still loaded above the view, and
 * when it lands above, the row that was first stays where it was on screen.
 * The transcript's own `overflow-anchor: none` leaves that to us.
 *
 * Rows mark themselves with `data-row` (user rows: a window and every page
 * start with one).
 */
export function useEarlierRows(
  containerRef: RefObject<HTMLDivElement | null>,
  messages: readonly TranscriptMessage[],
  earlier: { hasEarlier: boolean; loadEarlier: (from?: string) => boolean },
): { onScroll: () => void; findSpec: FindSpec } {
  const latest = useRef(earlier);
  latest.current = earlier;
  // Ctrl+F finds in the loaded rows; its bar offers the rest (loads it all).
  const findSpec = useRef<FindSpec>({
    unloaded: {
      has: () => latest.current.hasEarlier,
      load: () => latest.current.loadEarlier("start"),
    },
  }).current;
  const anchor = useRef<{ rowId: string; top: number; scrollTop: number } | null>(null);
  const record = () => {
    const el = containerRef.current;
    const first = el?.querySelector<HTMLElement>("[data-row]");
    anchor.current = el && first ? { rowId: first.dataset.row!, top: first.offsetTop, scrollTop: el.scrollTop } : null;
  };

  useLayoutEffect(() => {
    const el = containerRef.current;
    const saved = anchor.current;
    // Rows landed above only when the first marked row is another one now.
    const first = el?.querySelector<HTMLElement>("[data-row]");
    if (el && saved && first && first.dataset.row !== saved.rowId) {
      const row = el.querySelector<HTMLElement>(`[data-row="${CSS.escape(saved.rowId)}"]`);
      if (row) el.scrollTop = saved.scrollTop + (row.offsetTop - saved.top);
    }
    record();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const nearTop = () => {
    const el = containerRef.current;
    return Boolean(el && el.scrollTop < el.clientHeight * 1.5);
  };
  // A short tail (or a page that did not fill the screen) asks for more.
  useEffect(() => {
    if (earlier.hasEarlier && nearTop()) earlier.loadEarlier();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, earlier.hasEarlier]);

  return {
    findSpec,
    onScroll: () => {
      record();
      if (earlier.hasEarlier && nearTop()) earlier.loadEarlier();
    },
  };
}
