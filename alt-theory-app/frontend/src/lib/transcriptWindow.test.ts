import assert from "node:assert/strict";
import { test } from "node:test";
import type { TranscriptMessage } from "@/api/types";
import {
  isStableRowId,
  openedWindow,
  pageBefore,
  prependPage,
  replaceFrom,
  tailStart,
  transcriptWindow,
  turnRows,
} from "./transcriptWindow.ts";

/** `turns` turns of user + assistant + tool, rows `u<n>:0`, `a<n>:0`, `a<n>:1`. */
function conversation(turns: number): TranscriptMessage[] {
  return Array.from({ length: turns }, (_, n) => [
    { role: "user" as const, text: `question ${n}`, timestamp: null, entryId: `u${n}`, rowId: `u${n}:0` },
    { role: "assistant" as const, text: `answer ${n}`, timestamp: null, entryId: `a${n}`, rowId: `a${n}:0` },
    { role: "tool" as const, text: "", timestamp: null, entryId: `a${n}`, rowId: `a${n}:1` },
  ]).flat();
}

test("the tail starts at a user row and holds at least three user rows", () => {
  const rows = conversation(50);
  const start = tailStart(rows, 10);
  assert.equal(rows[start].role, "user");
  assert.ok(rows.length - start >= 10);
  // Few rows asked for: still three user rows (the lost-send check reads them).
  const short = tailStart(rows, 2);
  assert.equal(rows.slice(short).filter((row) => row.role === "user").length, 3);
  const window = transcriptWindow(rows, 10);
  assert.equal(window.hasMore, true);
  assert.equal(window.userRows.length, 50);
  assert.deepEqual(transcriptWindow(conversation(2), 60).hasMore, false);
});

test("only entry-based row ids are cursors", () => {
  assert.equal(isStableRowId("u3:0"), true);
  for (const id of ["row-4:0", "live-user", "steered:3", "local:ab-1", undefined]) {
    assert.equal(isStableRowId(id), false, String(id));
  }
  assert.equal(pageBefore(conversation(3), "live-user", 10), null);
  assert.equal(pageBefore(conversation(3), "gone:0", 10), null);
});

test("pages walk up to the start, each starting at a user row, and splice without gaps or repeats", () => {
  const rows = conversation(40);
  let state = openedWindow(transcriptWindow(rows, 12));
  assert.equal(state.olderUserRows.length, 40 - state.messages.filter((row) => row.role === "user").length);
  while (state.hasMore) {
    const page = pageBefore(rows, state.messages[0].rowId!, 20)!;
    assert.equal(page.messages[0].role, "user");
    state = prependPage(state, page);
  }
  assert.deepEqual(state.messages, rows);
  assert.deepEqual(state.olderUserRows, []);
});

test("a page that no longer ends at the window's start is dropped", () => {
  const rows = conversation(20);
  const state = openedWindow(transcriptWindow(rows, 12));
  const stalePage = pageBefore(rows, "u1:0", 5)!;
  assert.deepEqual(prependPage(state, stalePage), state);
});

test("a turn's rows replace what follows its predecessor; unknown predecessor → fetch the tail", () => {
  const before = conversation(10);
  const state = openedWindow(transcriptWindow(before, 12));
  const after = conversation(11);
  const turn = turnRows(after, "u10");
  assert.equal(turn.after, "a9:1");
  const next = replaceFrom(state, turn.after, turn.rows);
  assert.deepEqual(next.messages, after.slice(after.length - next.messages.length));
  assert.equal(next.stale, false);
  assert.equal(replaceFrom(state, "elsewhere:0", turn.rows).stale, true);
  // The first turn of a conversation: nothing before it.
  assert.deepEqual(turnRows(conversation(1), "u0").after, null);
  // A prompt that never landed: nothing new, cut at the end.
  assert.deepEqual(turnRows(before, null), { rows: [], after: "a9:1" });
});

test("a jump loads everything from its row down to the window; \"start\" loads it all", () => {
  const rows = conversation(40);
  const state = openedWindow(transcriptWindow(rows, 12));
  const before = state.messages[0].rowId!;
  const jump = pageBefore(rows, before, 5, "u3:0")!;
  assert.equal(jump.messages[0].rowId, "u3:0");
  assert.equal(jump.hasMore, true);
  assert.deepEqual(prependPage(state, jump).messages, rows.slice(9));
  const all = pageBefore(rows, before, 5, "start")!;
  assert.equal(all.hasMore, false);
  assert.deepEqual(prependPage(state, all).messages, rows);
  // A row below the cursor, or not a stable row, is refused.
  assert.equal(pageBefore(rows, before, 5, rows.at(-1)!.rowId), null);
  assert.equal(pageBefore(rows, before, 5, "live-user"), null);
});

test("a wake turn (agent mail, shown as a system line) is cut at its own line", () => {
  const rows: TranscriptMessage[] = [
    ...conversation(3),
    { role: "system", marker: "agent-team", text: "Subagent 1 finished", timestamp: null, entryId: "m1", rowId: "m1:0" },
    { role: "assistant", text: "noted", timestamp: null, entryId: "a9", rowId: "a9:0" },
  ];
  assert.deepEqual(turnRows(rows, "m1"), { rows: rows.slice(-2), after: "a2:1" });
});
