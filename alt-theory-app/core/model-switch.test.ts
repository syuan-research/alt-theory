import assert from "node:assert/strict";
import test from "node:test";
import { stripLastErrorAssistantMessage } from "./model-switch.js";

test("stripLastErrorAssistantMessage strips a whole trailing assistant chain", () => {
  const messages = [
    { role: "user", content: [] },
    { role: "assistant", content: [], stopReason: "error" },
    { role: "assistant", content: [], stopReason: "error" },
  ];
  const session = {
    messages,
    state: { messages },
  } as any;
  stripLastErrorAssistantMessage(session);
  assert.equal(session.state.messages.length, 1);
  assert.equal(session.state.messages[0].role, "user");
});
