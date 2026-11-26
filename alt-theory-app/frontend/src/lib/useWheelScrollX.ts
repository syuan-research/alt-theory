import { useEffect, type RefObject } from "react";

/**
 * Wheel → horizontal for a strip without a scrollbar: trackpads and mice
 * emit vertical deltas, and such a strip offers no thumb to drag. At either
 * end the wheel goes back to scrolling the page. `mounted` re-attaches the
 * listener when the strip comes and goes.
 */
export function useWheelScrollX(ref: RefObject<HTMLElement | null>, mounted: unknown = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 1) return;
      const dominantY = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
      if (!dominantY && event.deltaX === 0) return;
      const dx = dominantY ? event.deltaY : event.deltaX;
      if (dx === 0) return;
      const next = el.scrollLeft + dx;
      const max = el.scrollWidth - el.clientWidth;
      if (next <= 0 && el.scrollLeft <= 0) return;
      if (next >= max && el.scrollLeft >= max) return;
      event.preventDefault();
      el.scrollLeft = Math.max(0, Math.min(max, next));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref, mounted]);
}
