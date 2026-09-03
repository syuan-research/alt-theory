import assert from "node:assert/strict";
import test from "node:test";
import { buildTranscriptFromEntries } from "./session-store.js";

test("a stopped or failed reply carries Pi's stopReason on its last row; a finished one carries none", () => {
  const entry = (id: string, stopReason: string, text = `partial ${id}`) => ({
    type: "message",
    id,
    timestamp: "2026-09-03T00:00:00.000Z",
    message: { role: "assistant", content: [{ type: "text", text }], stopReason },
  });
  const transcript = buildTranscriptFromEntries([
    { type: "message", id: "u1", message: { role: "user", content: "go" } },
    entry("a1", "aborted"),
    entry("a2", "error"),
    entry("a3", "stop"),
    entry("a4", "aborted", ""),
  ]);
  assert.deepEqual(
    transcript.map(({ role, text, stopReason, marker }) => ({ role, text, stopReason, marker })),
    [
      { role: "user", text: "go", stopReason: undefined, marker: undefined },
      { role: "assistant", text: "partial a1", stopReason: "aborted", marker: undefined },
      { role: "assistant", text: "partial a2", stopReason: "error", marker: undefined },
      { role: "assistant", text: "partial a3", stopReason: undefined, marker: undefined },
      // An empty stopped reply still leaves a row so the line has a place.
      { role: "assistant", text: "", stopReason: "aborted", marker: undefined },
    ],
  );
});
