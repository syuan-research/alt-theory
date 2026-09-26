/**
 * The transcript window (perf plan WP 2.2): a conversation opens with its
 * tail, older rows come in pages, and a finished turn replaces rows from its
 * own start. The server cuts, the client splices; both use this one module
 * (pure, relative imports — the backend imports it as-is).
 */
import type { TranscriptMessage, TranscriptUserRow } from "../api/types";

/** A row id that names the same row in every projection of the history
 *  (`${entryId}:${ordinal}`): positional (`row-N`), in-flight (`live-user`),
 *  steered and local bubble ids never serve as a cursor. */
export function isStableRowId(rowId: string | undefined): rowId is string {
  return Boolean(rowId && /^[^:]+:\d+$/.test(rowId) && !rowId.startsWith("row-") && !rowId.startsWith("steered:") && !rowId.startsWith("local:"));
}

/** What the scrub rail shows for a user row. */
export function userRowPreview(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function userRowsOf(messages: readonly TranscriptMessage[]): TranscriptUserRow[] {
  return messages.flatMap((message, index) =>
    message.role === "user" ? [{ rowId: message.rowId ?? `row-${index}`, preview: userRowPreview(message.text) }] : [],
  );
}

/**
 * Where the tail starts: at least `rows` rows, moved up to a user row, with
 * at least `minUsers` user rows — a send whose answer was lost is judged by
 * the last three user rows (ADR 0008), so the tail must hold them.
 */
export function tailStart(messages: readonly TranscriptMessage[], rows: number, minUsers = 3): number {
  let start = Math.max(0, messages.length - rows);
  let users = 0;
  for (let index = messages.length - 1; index >= start; index -= 1) {
    if (messages[index].role === "user") users += 1;
  }
  while (start > 0 && (messages[start].role !== "user" || users < minUsers)) {
    start -= 1;
    if (messages[start].role === "user") users += 1;
  }
  return start;
}

/** The opening window: the tail, whether older rows exist, and every user row. */
export function transcriptWindow(messages: readonly TranscriptMessage[], rows: number) {
  const start = tailStart(messages, rows);
  return { messages: messages.slice(start), hasMore: start > 0, userRows: userRowsOf(messages) };
}

/** Up to `limit` rows before the stable row `before` — or all from the row
 *  `from` ("start" = the first) — started at a user row; null when `before`
 *  (or `from`) is not a stable row above it in this transcript. */
export function pageBefore(messages: readonly TranscriptMessage[], before: string, limit: number, from?: string) {
  if (!isStableRowId(before)) return null;
  const end = messages.findIndex((message) => message.rowId === before);
  if (end < 0) return null;
  let start = Math.max(0, end - limit);
  if (from !== undefined) {
    start = from === "start" ? 0 : isStableRowId(from) ? messages.findIndex((message) => message.rowId === from) : -1;
    if (start < 0 || start > end) return null;
  }
  while (start > 0 && messages[start].role !== "user") start -= 1;
  return { before, messages: messages.slice(start, end), hasMore: start > 0 };
}

/**
 * A finished turn's rows: from the row of the user entry Pi wrote for it (a
 * user row, or the agent-team line of a wake turn) to the end, and the row
 * just before them (null = the conversation's start). Without that row (the
 * prompt never landed) nothing new is shown and the cut is the end.
 */
export function turnRows(messages: readonly TranscriptMessage[], userEntryId: string | null) {
  let start = userEntryId ? messages.findIndex((message) => message.entryId === userEntryId) : -1;
  if (start < 0) start = messages.length;
  return { rows: messages.slice(start), after: start > 0 ? (messages[start - 1].rowId ?? null) : null };
}

// ---------------------------------------------------------------- client

export interface WindowState {
  messages: TranscriptMessage[];
  /** Rows older than the window exist on the server. */
  hasMore: boolean;
  /** User rows above the window (the rail draws them; loaded ones come from the rows). */
  olderUserRows: TranscriptUserRow[];
  /** The window no longer lines up with the server: fetch the tail again. */
  stale: boolean;
}

export function openedWindow(payload: { messages: TranscriptMessage[]; hasMore: boolean; userRows: TranscriptUserRow[] }): WindowState {
  const loaded = new Set(payload.messages.map((message) => message.rowId));
  return {
    messages: payload.messages,
    hasMore: payload.hasMore,
    olderUserRows: payload.userRows.filter((row) => !loaded.has(row.rowId)),
    stale: false,
  };
}

/** A page above the window; ignored unless it ends where the window starts. */
export function prependPage(state: WindowState, page: { before: string; messages: TranscriptMessage[]; hasMore: boolean }): WindowState {
  if (firstStableRowId(state.messages) !== page.before) return windowOf(state);
  const loaded = new Set(page.messages.map((message) => message.rowId));
  return {
    stale: state.stale,
    messages: [...page.messages, ...state.messages.slice(state.messages.findIndex((m) => m.rowId === page.before))],
    hasMore: page.hasMore,
    olderUserRows: state.olderUserRows.filter((row) => !loaded.has(row.rowId)),
  };
}

/** A turn ended: its rows replace everything after `after`. */
export function replaceFrom(state: WindowState, after: string | null, rows: TranscriptMessage[]): WindowState {
  if (after === null) return { messages: rows, hasMore: false, olderUserRows: [], stale: false };
  const index = state.messages.findIndex((message) => message.rowId === after);
  if (index < 0) return { ...windowOf(state), stale: true };
  return { ...windowOf(state), messages: [...state.messages.slice(0, index + 1), ...rows] };
}

/** Only the window's own fields (callers pass a whole conversation state). */
function windowOf({ messages, hasMore, olderUserRows, stale }: WindowState): WindowState {
  return { messages, hasMore, olderUserRows, stale };
}

/** The cursor for the next page up: the first row that is a stable id. */
export function firstStableRowId(messages: readonly TranscriptMessage[]): string | null {
  return messages.find((message) => isStableRowId(message.rowId))?.rowId ?? null;
}
