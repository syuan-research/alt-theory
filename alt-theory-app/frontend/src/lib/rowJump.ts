/**
 * A request to show one row of a conversation in the center (the collection
 * pane, owner 2026-11-26). The center's message list takes it once that
 * conversation is on show, loading earlier rows down to it when needed.
 */
let pending: { sessionId: string; row: string } | null = null;
const listeners = new Set<() => void>();

export function requestRowJump(sessionId: string, row: string): void {
  pending = { sessionId, row };
  listeners.forEach((listener) => listener());
}

export function pendingRowJump(): { sessionId: string; row: string } | null {
  return pending;
}

export function clearRowJump(): void {
  pending = null;
}

export function subscribeRowJump(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
