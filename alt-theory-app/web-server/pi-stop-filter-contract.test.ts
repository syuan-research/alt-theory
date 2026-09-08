import assert from "node:assert/strict";
import test from "node:test";
import { transformMessages } from "@earendil-works/pi-ai/api/transform-messages";

// Dependency contract against the installed Pi provider transform (the same
// function every provider path calls before a request): an assistant message
// with stopReason aborted or error is dropped from the outgoing context as a
// whole — regardless of retry, position, or what follows. Length and
// completed messages are never dropped, so the UI must never claim them.
// Production code must not import Pi here; this file only pins the rule the
// transcript projection and stop lines are built on.
const model = {
  api: "openai-responses",
  provider: "openai",
  id: "contract-model",
  input: ["text"],
};
const text = (value: string) => ({ type: "text", text: value });
const user = { role: "user", content: [text("hi")], timestamp: 1 };
const assistant = (stopReason: string, label: string) => ({
  role: "assistant",
  content: [text(label)],
  ...model,
  model: model.id,
  stopReason,
  timestamp: 2,
  usage: {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
});

function providerSees(messages: unknown[], label: string): boolean {
  const outgoing = transformMessages(messages as never, model as never) as {
    role: string;
    content: { type: string; text?: string }[];
  }[];
  return outgoing.some((message) =>
    (message.content ?? []).some(
      (part) => part.type === "text" && part.text === label,
    ),
  );
}

test("aborted/error assistants are dropped whole; length and completed ones stay", () => {
  for (const [reason, followedByAssistant, expectSeen] of [
    ["aborted", false, false],
    ["aborted", true, false],
    ["error", false, false],
    ["error", true, false], // a retried-and-replaced attempt is just as invisible
    ["length", false, true],
    ["length", true, true],
    ["stop", false, true],
  ] as const) {
    const label = `${reason}-${followedByAssistant ? "then-assistant" : "final"}`;
    const messages = [
      user,
      assistant(reason, label),
      ...(followedByAssistant ? [assistant("stop", "later")] : []),
    ];
    assert.equal(providerSees(messages, label), expectSeen, label);
  }
});

test("a completed tool step survives a later failed assistant", () => {
  const messages = [
    user,
    { ...assistant("toolUse", "step text"), content: [text("step text"), { type: "toolCall", name: "read", id: "c1", arguments: {} }] },
    { role: "toolResult", toolCallId: "c1", toolName: "read", content: [text("file body")], timestamp: 3 },
    assistant("error", "failed tail"),
  ];
  assert.equal(providerSees(messages, "step text"), true);
  assert.equal(providerSees(messages, "file body"), true);
  assert.equal(providerSees(messages, "failed tail"), false);
});
