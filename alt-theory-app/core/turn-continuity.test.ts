import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMPACTION_AWARENESS_PREFIX,
  labelCompactionSummaries,
  sanitizeOrphanedToolCalls,
} from "./turn-continuity.js";
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

test("labels compacted context for model awareness without duplicating the label", () => {
  const summary = {
    role: "compactionSummary",
    summary: "## Goal\nContinue the work.",
    tokensBefore: 1200,
    timestamp: 1,
  } as AgentMessage;
  const labelled = labelCompactionSummaries([summary]);
  assert.equal(
    (labelled[0] as any).summary,
    `${COMPACTION_AWARENESS_PREFIX}\n\n## Goal\nContinue the work.`,
  );
  assert.equal(labelCompactionSummaries(labelled), labelled);
  const ordinary = [
    { role: "user", content: [{ type: "text", text: "normal turn" }], timestamp: 1 },
  ] as AgentMessage[];
  assert.equal(labelCompactionSummaries(ordinary), ordinary);
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

test("collapses consecutive assistant messages so roles alternate (reopen after break-point retry)", () => {
  const messages = [
    { role: "user", content: [{ type: "text", text: "q" }], timestamp: 1 } as any,
    asst([{ type: "toolCall", id: "a", name: "read", arguments: {} }]),
    toolResult("a"),
    asst([{ type: "text", text: "partial" }], "error"),
    asst([{ type: "text", text: "full answer" }], "stop"),
  ];
  const result = sanitizeOrphanedToolCalls(messages);
  const roles = result.map((m: any) => m.role);
  assert.deepEqual(roles, ["user", "assistant", "toolResult", "assistant"]);
  assert.equal((result[3] as any).content[0].text, "full answer");
  // A chain of two errored partials before the replacement also collapses.
  const chained = sanitizeOrphanedToolCalls([
    messages[0],
    asst([{ type: "text", text: "p1" }], "error"),
    asst([{ type: "text", text: "p2" }], "error"),
    asst([{ type: "text", text: "final" }], "stop"),
  ]);
  assert.deepEqual(
    chained.map((m: any) => m.role),
    ["user", "assistant"],
  );
  assert.equal((chained[1] as any).content[0].text, "final");
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
