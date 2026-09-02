import assert from "node:assert/strict";
import { test } from "node:test";
import { formatEnvelopeForContext, parseAgentMailFragment } from "./agent-mail.js";
import { describeChildOutcome } from "./child-outcome.js";

test("a user stop tells the lead so and forbids a restart; the status word is never idle", () => {
  const stopped = describeChildOutcome({ status: "interrupted", interruptionCause: "user_abort" });
  assert.equal(stopped?.event, "interrupted");
  assert.equal(stopped?.cause, "user_abort");
  assert.match(stopped!.body, /The user stopped this subagent/);
  assert.match(stopped!.body, /Do not restart or continue it unless the user asks/);
  assert.equal(stopped?.statusWord, "interrupted (stopped by the user)");

  assert.equal(
    describeChildOutcome({ status: "interrupted", interruptionCause: "lead_abort" })?.statusWord,
    "interrupted (by you)",
  );
  assert.match(
    describeChildOutcome({ status: "interrupted", interruptionCause: "process_exit" })!.body,
    /The app closed/,
  );
  // Legacy persisted spelling still reads as interrupted, not idle.
  assert.equal(describeChildOutcome({ status: "aborted" })?.statusWord, "interrupted");
  assert.equal(describeChildOutcome({ status: "accepted" }), null);
});

test("completed and failed carry the answer or the error", () => {
  assert.equal(
    describeChildOutcome({ status: "completed" }, { answer: "  done  " })?.body,
    "done",
  );
  assert.equal(
    describeChildOutcome({ status: "completed" }, { answer: "" })?.statusWord,
    "finished",
  );
  const failed = describeChildOutcome({ status: "failed" }, { error: "fetch failed" });
  assert.equal(failed?.body, "The subagent's turn failed: fetch failed");
  assert.equal(failed?.statusWord, "failed");
});

test("the cause travels in the mail envelope and round-trips through the context tag", () => {
  const envelope = {
    at: "2026-09-02T00:00:00.000Z",
    from: "child",
    to: "lead",
    kind: "lifecycle" as const,
    event: "interrupted" as const,
    cause: "user_abort" as const,
    body: "The user stopped this subagent.",
    delivered: true,
  };
  const fragment = formatEnvelopeForContext(envelope, "researcher");
  assert.match(fragment, /event="interrupted" cause="user_abort"/);
  assert.deepEqual(parseAgentMailFragment(fragment), {
    fromLabel: "researcher",
    event: "interrupted",
    cause: "user_abort",
    body: "The user stopped this subagent.",
  });
  assert.equal(
    parseAgentMailFragment(formatEnvelopeForContext({ ...envelope, cause: null }, "r"))?.cause,
    null,
  );
});
