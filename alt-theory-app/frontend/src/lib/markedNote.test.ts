import assert from "node:assert/strict";
import { test } from "node:test";
import type { MarkedItem } from "@/api/sessions";
import { conversationLabel, markedNote } from "./markedNote.ts";

const bookmark: MarkedItem = { sessionId: "s1", row: "r1:0", order: 1, timestamp: null, role: "assistant", kind: "bookmark", text: "Line one\n\n- item", note: "keep" };
const mark: MarkedItem = { sessionId: "s2", row: "r2:0", order: 3, timestamp: null, role: "user", kind: "hl-5", text: "alone", thinking: false };
const labels: Record<string, string> = { s1: "Garden intro", s2: "“Hi — I want to…”" };

test("by source: a heading per conversation, the whole node quoted, the note under it, rules between entries", () => {
  const note = markedNote([{ sessionId: "s1", items: [bookmark, { ...bookmark, row: "r1:2", note: "" }] }], { date: "26 Nov 2026", scope: "this", arrangement: "source", labelOf: (id) => labels[id] });
  assert.equal(note, [
    "# Bookmarks and marks · 26 Nov 2026",
    "",
    "Scope: This conversation · By source",
    "",
    "## Conversation: Garden intro",
    "",
    "🔖 **Alt** [↗](conversation:s1#r1:0)",
    "",
    "> Line one\n>\n> - item",
    "",
    "Note: keep",
    "",
    "---",
    "",
    "🔖 **Alt** [↗](conversation:s1#r1:2)",
    "",
    "> Line one\n>\n> - item",
    "",
  ].join("\n"));
});

test("a mixed stream names each entry's conversation; an unnamed conversation reads as a fragment", () => {
  const note = markedNote([{ sessionId: null, items: [bookmark, mark] }], { date: "d", scope: "all", arrangement: "time", labelOf: (id) => labels[id] });
  assert.ok(!note.includes("## Conversation"));
  assert.match(note, /🟥 \*\*You · “Hi — I want to…”\*\*: “alone” \[↗\]\(conversation:s2#r2:0\)/);
  assert.equal(conversationLabel("  ", "I'm writing the intro for our community garden paper. Can you", "a1b2c3d4e5f6a7b8"), "“I'm writing the intro fo…” · a1b2c3d4");
  assert.equal(conversationLabel("Named", "x", "a1b2c3d4e5f6a7b8"), "Named");
});
