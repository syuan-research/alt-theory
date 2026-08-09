import { useLayoutEffect, useRef } from "react";

/**
 * Stick-to-bottom only when the user is already near the bottom, and only
 * when content *grows* (stream markdown makes scrollHeight jitter by a few
 * px; pinning every frame put the last line on the overflow clip edge).
 * One implementation for the center transcript and the right pane — the
 * right pane's old unconditional pin killed upward scroll and text
 * selection during streaming.
 */
export function useStickToBottom(deps: unknown[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  /** Last scrollHeight we pinned to — ignore transient shrink. */
  const pinnedRef = useRef(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !stickRef.current) return;
    const next = el.scrollHeight;
    if (next >= pinnedRef.current) {
      pinnedRef.current = next;
      el.scrollTop = next;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickRef.current = nearBottom;
    if (nearBottom) pinnedRef.current = el.scrollHeight;
  };

  return { containerRef, stickRef, pinnedRef, onScroll };
}
