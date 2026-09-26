import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { TranscriptMessage } from "@/api/types";

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
  earlier: { hasEarlier: boolean; loadEarlier: () => boolean },
) {
  const anchor = useRef<{ rowId: string; top: number; scrollTop: number } | null>(null);
  const record = () => {
    const el = containerRef.current;
    const first = el?.querySelector<HTMLElement>("[data-row]");
    anchor.current = el && first ? { rowId: first.dataset.row!, top: first.offsetTop, scrollTop: el.scrollTop } : null;
  };

  useLayoutEffect(() => {
    const el = containerRef.current;
    const saved = anchor.current;
    if (el && saved && messages[0]?.rowId !== saved.rowId) {
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

  return () => {
    record();
    if (earlier.hasEarlier && nearTop()) earlier.loadEarlier();
  };
}
