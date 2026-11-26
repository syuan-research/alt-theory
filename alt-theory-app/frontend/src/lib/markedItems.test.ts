import assert from "node:assert/strict";
import { test } from "node:test";
import type { MarkedItem } from "@/api/sessions";
import { arrangeMarked } from "./markedItems.ts";

const item = (sessionId: string, order: number, timestamp: string, text: string, note?: string): MarkedItem =>
  ({ sessionId, row: `${sessionId}:${order}`, order, timestamp, role: "assistant", kind: "bookmark", text, note });

const items = [
  item("b", 3, "2026-11-02", "coding scheme"),
  item("a", 5, "2026-11-03", "second round"),
  item("a", -1, "2026-11-01", "an old branch"),
  item("a", 1, "2026-11-01T01", "themes", "start here"),
];
const activity = (id: string) => ({ a: "2026-11-03", b: "2026-11-20" })[id] ?? "";

test("by time: one stream in message time, conversation order within one; off-branch last", () => {
  const [stream] = arrangeMarked(items, "time", "a", "", activity);
  assert.equal(stream.sessionId, null);
  assert.deepEqual(stream.items.map((i) => i.text), ["themes", "coding scheme", "second round", "an old branch"]);
});

test("by source: this conversation first, then the most recently active; a query filters text and notes", () => {
  const groups = arrangeMarked(items, "source", "a", "", activity);
  assert.deepEqual(groups.map((g) => [g.sessionId, g.items.map((i) => i.text)]), [
    ["a", ["themes", "second round", "an old branch"]],
    ["b", ["coding scheme"]],
  ]);
  assert.deepEqual(arrangeMarked(items, "source", "a", "START", activity).map((g) => g.items.map((i) => i.text)), [["themes"]]);
  assert.deepEqual(arrangeMarked(items, "time", "a", "nothing", activity), []);
});
