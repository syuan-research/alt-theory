import {
  Children,
  useEffect,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

/** How much of the neighbouring chip stays visible at an edge when there is more. */
const PEEK = 28;

/** The chip whose `data-tab-key` is `key`, wherever it sits in the strip. */
function chipForKey(strip: HTMLElement, key: string): HTMLElement | null {
  for (const chip of strip.querySelectorAll<HTMLElement>("[data-tab-key]")) {
    if (chip.dataset.tabKey === key) return chip;
  }
  return null;
}

/** Scroll so the chip is whole in view, with a peek of each neighbour that exists. */
function revealChip(strip: HTMLElement, chip: HTMLElement) {
  const max = strip.scrollWidth - strip.clientWidth;
  if (max <= 0) return;
  const style = getComputedStyle(strip);
  const edge = strip.getBoundingClientRect();
  const left = edge.left + parseFloat(style.paddingLeft);
  const right = edge.right - parseFloat(style.paddingRight);
  const box = chip.getBoundingClientRect();
  const item = chip.parentElement && chip.parentElement !== strip ? chip.parentElement : chip;
  const before = item.previousElementSibling ? PEEK : 0;
  const after = item.nextElementSibling ? PEEK : 0;
  let next = strip.scrollLeft;
  if (box.width + before + after > right - left) {
    // The chip alone fills the strip: show it whole, from its start.
    if (box.left < left || box.right > right) next += box.left - left;
  } else {
    if (box.right + after > right) next += box.right + after - right;
    if (box.left - before < left) next += box.left - before - left;
  }
  strip.scrollLeft = Math.max(0, Math.min(max, next));
}

/**
 * One strip of chips that scrolls sideways: the Related strip and the open
 * files' tabs. It never shows a scrollbar, so its height never changes. It
 * scrolls by wheel, trackpad and the arrow keys, and a partly visible chip at
 * an edge says there is more. Each direct child is one item whose chip carries
 * `data-tab-key`; a chip's looks are `.child-switch button` (index.css).
 */
export function TabStrip({ activeKey, onFocusKey, onKeyDown, children, ...rest }: {
  /** Kept whole in view when it changes, when chips come or go, and when the strip resizes. */
  activeKey?: string | null;
  /** A chip took the focus through the arrow keys. */
  onFocusKey?: (key: string) => void;
} & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const focusKey = useRef(onFocusKey);
  focusKey.current = onFocusKey;
  const count = Children.count(children);

  // Wheel → horizontal: trackpads and mice emit vertical deltas, and a strip
  // without a scrollbar offers no thumb to drag.
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
  }, []);

  useLayoutEffect(() => {
    const strip = ref.current;
    if (!strip || !activeKey) return;
    const reveal = () => {
      const chip = chipForKey(strip, activeKey);
      if (chip) revealChip(strip, chip);
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [activeKey, count]);

  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    const strip = ref.current;
    if (!strip) return;
    const chips = [...strip.querySelectorAll<HTMLElement>("[data-tab-key]")];
    const from = chips.findIndex((chip) => chip.contains(document.activeElement));
    if (from < 0) return;
    event.preventDefault();
    const to = chips[(from + (event.key === "ArrowRight" ? 1 : -1) + chips.length) % chips.length];
    to.focus({ preventScroll: true });
    revealChip(strip, to);
    if (to.dataset.tabKey !== undefined) focusKey.current?.(to.dataset.tabKey);
  };

  return (
    <div ref={ref} {...rest} onKeyDown={onKey}>
      {children}
    </div>
  );
}
