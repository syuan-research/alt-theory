import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeOrphanedToolCalls } from "./turn-continuity.js";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

const asst = (content: any[], stopReason = "stop"): AgentMessage =>
  ({
    role: "assistant",
    content,
    api: "anthropic-messages",
    provider: "anthropic",
    model: "m",
    usage: {} as any,
    stopReason,
    timestamp: 1,
  }) as any;

const toolResult = (toolCallId: string): AgentMessage =>
  ({
    role: "toolResult",
    toolCallId,
    toolName: "read",
    content: [{ type: "text", text: "ok" }],
    isError: false,
    timestamp: 1,
  }) as any;

test("keeps tool calls that have matching results", () => {
  const messages = [
    asst([{ type: "toolCall", id: "a", name: "read", arguments: {} }]),
    toolResult("a"),
  ];
  assert.equal(sanitizeOrphanedToolCalls(messages), messages);
});

test("drops orphaned tool calls from an errored partial message", () => {
  const messages = [
    asst([{ type: "toolCall", id: "a", name: "read", arguments: {} }]),
    toolResult("a"),
    asst(
      [
        { type: "text", text: "partial answer" },
        { type: "toolCall", id: "b", name: "read", arguments: {} },
      ],
      "error",
    ),
    { role: "user", content: [{ type: "text", text: "continue" }], timestamp: 1 } as any,
  ];
  const result = sanitizeOrphanedToolCalls(messages);
  const errored = result[2] as any;
  assert.deepEqual(errored.content, [{ type: "text", text: "partial answer" }]);
  assert.equal(result.length, 4);
});

test("drops an assistant message left empty after orphan removal", () => {
  const messages = [
    asst([{ type: "toolCall", id: "b", name: "read", arguments: {} }], "error"),
    { role: "user", content: [{ type: "text", text: "go on" }], timestamp: 1 } as any,
  ];
  const result = sanitizeOrphanedToolCalls(messages);
  assert.equal(result.length, 1);
  assert.equal((result[0] as any).role, "user");
});
