/**
 * The conversation list's activity, as pushed (WP-4): a picture on
 * (re)connect, then one change at a time. Pure, so the list, its alerts and
 * the running count read one source.
 */
import type { ListActivity, ServerMessage } from "../api/types";

export type ActivityMessage = Extract<ServerMessage, { type: "activity_snapshot" | "session_activity" }>;

/** A conversation's list activity moved: what it was, what it is. */
export interface ActivityChange {
  sessionId: string;
  before: ListActivity;
  now: ListActivity;
}

/** A mark a list row keeps until its conversation is opened. */
export type ListAlert = "done" | "failed" | "approval";

/**
 * The marks these changes leave (the open conversation's own changes leave
 * none): a turn that ended from running is done, a failure is failed, a
 * wait for approval is approval.
 */
export function alertsFor(changes: ActivityChange[], openId: string | null): Record<string, ListAlert> {
  const raised: Record<string, ListAlert> = {};
  for (const { sessionId, before, now } of changes) {
    if (sessionId === openId) continue;
    if (before === "running" && now === "idle") raised[sessionId] = "done";
    else if (now === "failed") raised[sessionId] = "failed";
    else if (now === "awaiting-approval") raised[sessionId] = "approval";
  }
  return raised;
}

/** Non-idle conversations only; null until the first picture arrives. */
export type ActivityMap = Record<string, ListActivity> | null;

/**
 * The next picture and what moved. The first picture is the baseline (no
 * changes); a later one (a reconnect) reports what moved while away.
 */
export function stepActivity(
  previous: ActivityMap,
  message: ActivityMessage,
): { next: Record<string, ListActivity>; changes: ActivityChange[] } {
  let next: Record<string, ListActivity>;
  if (message.type === "activity_snapshot") {
    next = message.payload.activity;
  } else {
    const { sessionId, status } = message.payload;
    next = { ...previous };
    if (status === "idle") delete next[sessionId];
    else next[sessionId] = status;
  }
  if (!previous) return { next, changes: [] };
  const ids = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const changes = [...ids].flatMap((sessionId) => {
    const before = previous[sessionId] ?? "idle";
    const now = next[sessionId] ?? "idle";
    return before === now ? [] : [{ sessionId, before, now }];
  });
  return { next, changes };
}
