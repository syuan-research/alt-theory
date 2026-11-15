import assert from "node:assert/strict";
import { test } from "node:test";
import type { TranscriptMessage } from "../api/types";
import { selectRows, viewToLines, viewToMarkdown } from "./sessionView.ts";

const rows: TranscriptMessage[] = [
  { rowId: "u1:0", role: "user", text: "Read the notes", timestamp: null },
  { rowId: "a1:0", role: "assistant", text: "", thinking: "plan first", timestamp: null },
  {
    rowId: "a1:1", role: "tool", toolType: "call", toolName: "bash", toolCallId: "c1", success: true,
    toolDetail: { kind: "command", body: "ls notes\necho done" }, text: "a.md\nb.md", timestamp: null,
  },
  { rowId: "a2:0", role: "assistant", text: "Two files: a.md and b.md", timestamp: null },
  { rowId: "m1:0", role: "system", marker: "agent-team", text: "sa1 · completed: done", timestamp: null },
  { rowId: "u2:0", role: "user", text: "Summarize a.md", timestamp: null },
];

test("a kind filter strips the parts it leaves out and drops rows left empty", () => {
  const view = selectRows(rows, { kinds: ["user", "assistant", "tool"] });
  assert.deepEqual(view.rows.map((row) => row.rowId), ["u1:0", "a1:1", "a2:0", "u2:0"]);
  assert.equal(view.rows[1].text, "", "tool result left out");
  assert.equal(view.total, 4);
});

test("ranges: last N, around a row, a row-id span, a missing id", () => {
  assert.deepEqual(selectRows(rows, { range: { last: 2 } }).rows.map((row) => row.rowId), ["m1:0", "u2:0"]);
  const around = selectRows(rows, { range: { around: "a1:1", before: 1, after: 1 } });
  assert.deepEqual(around.rows.map((row) => row.rowId), ["a1:0", "a1:1", "a2:0"]);
  assert.equal(around.start, 1);
  // An anchor the kind filter removed lands on the next kept row.
  const filtered = selectRows(rows, { kinds: ["user", "tool"], range: { around: "a1:0", before: 0, after: 0 } });
  assert.deepEqual(filtered.rows.map((row) => row.rowId), ["a1:1"]);
  assert.deepEqual(selectRows(rows, { range: { from: "a2:0", to: "m1:0" } }).rows.map((row) => row.rowId), ["a2:0", "m1:0"]);
  // first N counts the rows kept, not the rows the kind filter removed.
  assert.deepEqual(selectRows(rows, { kinds: ["user", "assistant"], range: { first: 2 } }).rows.map((row) => row.rowId), ["u1:0", "a2:0"]);
  const missing = selectRows(rows, { range: { around: "nope:0", before: 2, after: 2 } });
  assert.equal(missing.missing, "nope:0");
  assert.equal(missing.rows.length, 0);
});

test("caps cut per kind and say how much was left out", () => {
  const view = selectRows(rows, { range: { last: 3 }, maxChars: { assistant: 3 } });
  assert.equal(view.rows[0].text, "Two… [21 more characters]");
  assert.equal(view.clipped, true);
});

test("model lines name the tool, its command and its result", () => {
  const lines = viewToLines(selectRows(rows, { range: { from: "a1:0", to: "a1:1" } }).rows, { rowIds: true });
  assert.deepEqual(lines, ["[a1:0] thinking: plan first", "[a1:1] tool bash: ls notes → a.md\nb.md"]);
});

test("check_agent's short answer is the last non-empty answer text", () => {
  const last = selectRows(rows.slice(0, 3), { range: { last: 1 }, kinds: ["assistant"] }).rows[0];
  assert.equal(last, undefined, "a thinking-only row is not an answer");
  assert.equal(selectRows(rows, { range: { last: 1 }, kinds: ["assistant"] }).rows[0].text, "Two files: a.md and b.md");
});

test("Markdown with row ids carries each row's id for reading back", () => {
  const markdown = viewToMarkdown("Notes", selectRows(rows, { kinds: ["user", "assistant", "tool"] }).rows, {
    labels: { conversation: "Conversation", user: "User", assistant: "Assistant", thinking: "Thinking", answer: "Answer", tool: "Tool" },
    toolLine: (row) => row.toolName ?? "tool",
    rowIds: true,
  });
  assert.match(markdown, /## User `u1:0`\n\nRead the notes/);
  assert.match(markdown, /> \*\*Tool:\*\* bash `a1:1`/);
});
