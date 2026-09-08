import assert from "node:assert/strict";
import test from "node:test";
import { buildTranscriptFromEntries } from "./session-store.js";

// Pi filters an aborted/error assistant from the model's context as a whole
// message (verified against the installed transform in
// pi-stop-filter-contract.test.ts). The projection therefore marks every
// visible row of that message with its stop reason — rows share the entryId,
// the UI groups them into one range. A length cut is not a drop: one line on
// the attempt's last text, nothing else claimed.
test("aborted/error mark every row of the attempt; length marks its last text; empty attempts leave nothing", () => {
  const entry = (id: string, stopReason: string | undefined, content: unknown[]) => ({
    type: "message",
    id,
    timestamp: "2026-09-03T00:00:00.000Z",
    message: { role: "assistant", content, stopReason },
  });
  const text = (value: string) => ({ type: "text", text: value });
  const toolCall = (name: string) => ({
    type: "toolCall",
    name,
    id: `call-${name}`,
    arguments: {},
  });
  const user = (id: string, value: string) => ({
    type: "message",
    id,
    message: { role: "user", content: value },
  });
  const transcript = buildTranscriptFromEntries([
    user("u1", "go"),
    entry("a1", "aborted", [text("partial a1")]),
    user("u2", "again"),
    // one failed message split into three visible rows: all of it is filtered
    entry("a2", "error", [text("partial a2"), toolCall("read"), text("after read")]),
    entry("a3", "error", [text("")]), // nothing visible: no rows at all
    entry("a4", "error", [{ type: "thinking", thinking: "only thought" }]), // thinking-only row is still claimed
    entry("a5", "length", [text("long a5")]), // kept, just cut off
    entry("a6", "stop", [text("done a6")]),
    user("u3", "once more"),
    entry("a7", "error", [text("partial a7")]),
  ]);
  assert.deepEqual(
    transcript.map(({ role, text, stopReason, entryId }) => ({ role, text, stopReason, entryId })),
    [
      { role: "user", text: "go", stopReason: undefined, entryId: "u1" },
      { role: "assistant", text: "partial a1", stopReason: "aborted", entryId: "a1" },
      { role: "user", text: "again", stopReason: undefined, entryId: "u2" },
      { role: "assistant", text: "partial a2", stopReason: "error", entryId: "a2" },
      { role: "tool", text: "read", stopReason: "error", entryId: "a2" },
      { role: "assistant", text: "after read", stopReason: "error", entryId: "a2" },
      { role: "assistant", text: "", stopReason: "error", entryId: "a4" },
      { role: "assistant", text: "long a5", stopReason: "length", entryId: "a5" },
      { role: "assistant", text: "done a6", stopReason: undefined, entryId: "a6" },
      { role: "user", text: "once more", stopReason: undefined, entryId: "u3" },
      { role: "assistant", text: "partial a7", stopReason: "error", entryId: "a7" },
    ],
  );
});
