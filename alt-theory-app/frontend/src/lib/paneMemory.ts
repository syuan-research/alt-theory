import { useCallback, useReducer } from "react";

/**
 * View state that must outlive its component (Owner 2026-09-03): the right
 * pane unmounts on collapse, rail switch and child open, and every
 * `useState` inside it forgot the tree position, the open view mode, the
 * filters. This is `useState` backed by one app-lifetime map, keyed by the
 * caller (usually `${sessionId}:${surface}:${what}`), so a remount resumes
 * where the last one stopped. In memory only — nothing survives a restart.
 */
const memory = new Map<string, unknown>();

export function usePaneMemory<T>(
  key: string,
  initial: T | (() => T),
): [T, (next: T | ((prev: T) => T)) => void] {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  if (!memory.has(key)) {
    memory.set(key, typeof initial === "function" ? (initial as () => T)() : initial);
  }
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = memory.get(key) as T;
      const value = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
      if (Object.is(value, prev)) return;
      memory.set(key, value);
      rerender();
    },
    [key],
  );
  return [memory.get(key) as T, set];
}

/** Plain read/write for non-React callers (scroll handlers). */
export const paneMemory = {
  get: <T,>(key: string): T | undefined => memory.get(key) as T | undefined,
  set: (key: string, value: unknown): void => {
    memory.set(key, value);
  },
};
