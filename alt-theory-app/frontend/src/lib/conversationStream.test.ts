import assert from "node:assert/strict";
import { test } from "node:test";
import type { StreamPart } from "@/api/types";
import { handleConversationStreamMessage } from "./conversationStream.ts";

// A retry phase only licenses a lost-content line when the server says the
// dropped attempt produced text; otherwise the parts above are just as
// likely completed steps, and claiming a loss would point at nothing.
function run(parts: StreamPart[], droppedPartialText?: boolean) {
  let updated = parts;
  let phaseLabel = "";
  handleConversationStreamMessage(
    {
      type: "run_phase",
      payload: {
        phase: "retrying",
        retry: { attempt: 2, maxAttempts: 3, delayMs: 10, droppedPartialText },
      },
    },
    {
      activeTools: { current: {} },
      setParts: (update) => {
        updated = update(updated);
      },
      setPhaseLabel: (label) => {
        phaseLabel = label;
      },
    },
  );
  return { updated, phaseLabel };
}

test("a retry that dropped text appends the attempt line; one without text claims nothing", () => {
  const completed: StreamPart[] = [
    { kind: "text", text: "Completed step" },
    { kind: "tool", tool: { callId: "t1", toolName: "read", status: "finished", success: true } },
  ];

  const dropped = run([...completed, { kind: "text", text: "partial reply" }], true);
  assert.equal(dropped.updated.length, 4);
  const last = dropped.updated.at(-1);
  assert.equal(last?.kind, "notice");
  assert.match(last?.kind === "notice" ? last.text : "", /previous attempt/);
  assert.match(dropped.phaseLabel, /2\/3/);

  // thinking-only attempt, or the turn had only completed steps: no line
  const textless = run(completed, false);
  assert.equal(textless.updated.length, completed.length);
  const unknown = run(completed, undefined);
  assert.equal(unknown.updated.length, completed.length);
  assert.match(textless.phaseLabel, /2\/3/);
});
