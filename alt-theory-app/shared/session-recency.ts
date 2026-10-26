/** One activity timestamp for display and every activity-based session order. */
export function sessionActivityTime(session: { updatedAt?: string | null; createdAt?: string | null }): number {
  return Date.parse(session.updatedAt ?? session.createdAt ?? "") || 0;
}

export function compareSessionActivity(
  a: { sessionId: string; updatedAt?: string | null; createdAt?: string | null },
  b: { sessionId: string; updatedAt?: string | null; createdAt?: string | null },
): number {
  return sessionActivityTime(b) - sessionActivityTime(a) ||
    b.sessionId.localeCompare(a.sessionId, undefined, { numeric: true });
}
