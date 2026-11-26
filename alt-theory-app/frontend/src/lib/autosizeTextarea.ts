import { useEffect, type RefObject } from "react";

/**
 * Grow a textarea to its content height (CSS max-height still caps it).
 * Measuring collapses it to one line for a moment; its parent keeps its
 * height meanwhile, so the transcript above never grows and shrinks back —
 * that clamped a bottom-pinned transcript and made the streaming answer jump
 * on every keystroke of a multi-line draft (owner 2026-11-26, IME on Windows).
 */
export function autosizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  const parent = el.parentElement;
  const held = parent?.style.minHeight ?? "";
  if (parent) parent.style.minHeight = `${parent.offsetHeight}px`;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
  if (parent) parent.style.minHeight = held;
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
