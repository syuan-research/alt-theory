import type { MarkedItem } from "@/api/sessions";

export type MarkedArrangement = "time" | "source";

/** A run of the collection: one conversation's items (by source), or all of them (by time, sessionId null). */
export interface MarkedGroup {
  sessionId: string | null;
  items: MarkedItem[];
}

const inOrder = (a: MarkedItem, b: MarkedItem) =>
  (a.order < 0 ? 1 : 0) - (b.order < 0 ? 1 : 0) || a.order - b.order;

/**
 * By time: one stream in message time (conversation order within one
 * conversation). By source: a group per conversation, this one first, then
 * the most recently active; items in conversation order.
 */
export function arrangeMarked(
  items: readonly MarkedItem[],
  arrangement: MarkedArrangement,
  currentId: string,
  query: string,
  activityOf: (sessionId: string) => string,
): MarkedGroup[] {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const shown = terms.length
    ? items.filter((item) => {
      const haystack = `${item.text}\n${item.note ?? ""}`.toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    : [...items];
  if (arrangement === "time") {
    shown.sort((a, b) =>
      a.sessionId === b.sessionId
        ? inOrder(a, b)
        : (a.timestamp ?? "￿").localeCompare(b.timestamp ?? "￿"));
    return shown.length ? [{ sessionId: null, items: shown }] : [];
  }
  const bySession = new Map<string, MarkedItem[]>();
  for (const item of shown) bySession.set(item.sessionId, [...(bySession.get(item.sessionId) ?? []), item]);
  return [...bySession.entries()]
    .sort(([a], [b]) => (a === currentId ? -1 : b === currentId ? 1 : activityOf(b).localeCompare(activityOf(a))))
    .map(([sessionId, group]) => ({ sessionId, items: group.sort(inOrder) }));
}
