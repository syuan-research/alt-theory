import { useSyncExternalStore } from "react";

type Locate = { id: string; nonce: number } | null;
let current: Locate = null;
const listeners = new Set<() => void>();

/** "Find in list": the list's own search view, narrowed to one conversation. */
export function locateInList(id: string): void {
  current = { id, nonce: Date.now() };
  for (const listener of listeners) listener();
}

export function clearLocate(): void {
  if (current === null) return;
  current = null;
  for (const listener of listeners) listener();
}

export function useListLocate(): Locate {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => current);
}

const FLASH = "list-flash";
const FAMILY = "list-flash-family";

const rowOf = (id: string) =>
  document.querySelector<HTMLElement>(`.sessions [data-session-id="${CSS.escape(id)}"]`);

function scrollerOf(row: HTMLElement): HTMLElement | null {
  for (let node = row.parentElement; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

/**
 * Scroll the list to a conversation and light it and its family up. Returns
 * what undoes it; with `false` the list keeps its scroll position.
 */
export function showInList(id: string, familyId?: string): ((restoreScroll?: boolean) => void) | null {
  const row = rowOf(id);
  const family = familyId && familyId !== id ? rowOf(familyId) : null;
  const target = row ?? family;
  if (!target) return null;
  const scrollers = new Set<HTMLElement>();
  for (const element of [row, family]) {
    const scroller = element ? scrollerOf(element) : null;
    if (scroller) scrollers.add(scroller);
  }
  const before = [...scrollers].map((scroller) => [scroller, scroller.scrollTop] as const);
  target.scrollIntoView({ block: "center" });
  family?.classList.add(FAMILY);
  row?.classList.add(FLASH);
  return (restoreScroll = true) => {
    row?.classList.remove(FLASH);
    family?.classList.remove(FAMILY);
    if (restoreScroll) for (const [scroller, top] of before) scroller.scrollTop = top;
  };
}
