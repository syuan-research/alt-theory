import { useEffect, type RefObject } from "react";

/** Grow a textarea to its content height (CSS max-height still caps it). */
export function autosizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * Keep a composer textarea sized to its text: on every change, and when its
 * width changes (a pane opening mid-animation wraps the text differently).
 */
export function useAutosizeTextarea(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useEffect(() => {
    autosizeTextarea(ref.current);
  }, [ref, value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      autosizeTextarea(el);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}
