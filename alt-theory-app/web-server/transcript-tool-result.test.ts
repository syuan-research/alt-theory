import assert from "node:assert/strict";
import test from "node:test";
import { SMART_DENIAL_PREFIX } from "../core/security-extension.js";
import { TOOL_RESULT_HEAD, TOOL_RESULT_TAIL } from "./limits.js";
import { buildTranscriptFromEntries } from "./session-store.js";

const call = (id: string, callId: string) => ({
  type: "message",
  id,
  message: { role: "assistant", content: [{ type: "toolCall", name: "bash", id: callId, arguments: { command: "ls" } }] },
});
const result = (id: string, callId: string, text: string, isError = false) => ({
  type: "message",
  id,
  message: { role: "toolResult", toolName: "bash", toolCallId: callId, isError, content: [{ type: "text", text }] },
});

test("a tool result row keeps a bounded head and tail and says it was cut", () => {
  const long = `START${"x".repeat(TOOL_RESULT_HEAD + TOOL_RESULT_TAIL)}END`;
  const [row] = buildTranscriptFromEntries([call("a1", "c1"), result("r1", "c1", long)]);
  assert.equal(row.truncated, true);
  assert.ok(row.text.startsWith("START") && row.text.endsWith("END"));
  assert.ok(row.text.length < TOOL_RESULT_HEAD + TOOL_RESULT_TAIL + 100);
  const [short] = buildTranscriptFromEntries([call("a1", "c1"), result("r1", "c1", "a.txt")]);
  assert.equal(short.text, "a.txt");
  assert.equal(short.truncated, undefined);
});

test("a smart-approval denial is read from the blocked result into the row's approval", () => {
  const [row] = buildTranscriptFromEntries([
    call("a1", "c1"),
    result("r1", "c1", `${SMART_DENIAL_PREFIX}deletes data outside the project`, true),
  ]);
  assert.deepEqual(row.approval, { by: "smart", outcome: "deny", reason: "deletes data outside the project", model: "" });
  const [plainError] = buildTranscriptFromEntries([call("a1", "c1"), result("r1", "c1", "command failed", true)]);
  assert.equal(plainError.approval, undefined);
});
