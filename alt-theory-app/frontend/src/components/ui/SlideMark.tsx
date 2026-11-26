import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * The selected item's background, drawn once per list so it can slide to
 * the next selection (owner 2026-11-26) — whether the user clicked it or
 * something else switched it. It follows the list's `.on` child; the list
 * needs `position: relative` and its `.on` child a transparent background.
 */
export function SlideMark({ within, at }: { within: RefObject<HTMLElement | null>; at: string | null }) {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const host = within.current;
    if (!host) return;
    const place = () => {
      const el = host.querySelector<HTMLElement>(":scope > .on");
      setBox(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(host);
    return () => observer.disconnect();
  }, [within, at]);
  // The first placement lands without travelling in from the corner.
  useLayoutEffect(() => {
    if (box && !ready) requestAnimationFrame(() => setReady(true));
  }, [box, ready]);
  if (!box) return null;
  return (
    <span
      className={`slide-mark${ready ? " ready" : ""}`}
      aria-hidden="true"
      style={{ transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h }}
    />
  );
}
