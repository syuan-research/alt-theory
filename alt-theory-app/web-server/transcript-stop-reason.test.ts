import assert from "node:assert/strict";
import test from "node:test";
import { buildTranscriptFromEntries } from "./session-store.js";

// The state table of 2026-09-05 (interrupted-state prototype ticket) as
// fixtures: the line belongs to the last text of the attempt; retried
// attempts were dropped from the model's context, final ones are kept.
test("stop lines sit on the attempt's last text and say kept or dropped; empty attempts leave nothing", () => {
  const entry = (id: string, stopReason: string, content: unknown[]) => ({
    type: "message",
    id,
    timestamp: "2026-09-03T00:00:00.000Z",
    message: { role: "assistant", content, stopReason },
  });
  const text = (value: string) => ({ type: "text", text: value });
  const user = (id: string, value: string) => ({
    type: "message",
    id,
    message: { role: "user", content: value },
  });
  const transcript = buildTranscriptFromEntries([
    user("u1", "go"),
    entry("a1", "aborted", [text("partial a1")]),
    user("u2", "again"),
    entry("a2", "error", [text("partial a2")]), // retried: dropped
    entry("a3", "error", [text("")]), // the pandoc case: nothing to say
    entry("a4", "error", [{ type: "thinking", thinking: "only thought" }]), // no text: no line
    entry("a5", "length", [text("long a5")]), // retried after compaction: dropped
    entry("a6", "stop", [text("done a6")]),
    user("u3", "once more"),
    entry("a7", "error", [text("partial a7")]), // final attempt: kept
  ]);
  assert.deepEqual(
    transcript.map(({ role, text, stopReason, stopKept }) => ({ role, text, stopReason, stopKept })),
    [
      { role: "user", text: "go", stopReason: undefined, stopKept: undefined },
      { role: "assistant", text: "partial a1", stopReason: "aborted", stopKept: true },
      { role: "user", text: "again", stopReason: undefined, stopKept: undefined },
      { role: "assistant", text: "partial a2", stopReason: "error", stopKept: false },
      { role: "assistant", text: "", stopReason: undefined, stopKept: undefined },
      { role: "assistant", text: "long a5", stopReason: "length", stopKept: false },
      { role: "assistant", text: "done a6", stopReason: undefined, stopKept: undefined },
      { role: "user", text: "once more", stopReason: undefined, stopKept: undefined },
      { role: "assistant", text: "partial a7", stopReason: "error", stopKept: true },
    ],
  );
});
