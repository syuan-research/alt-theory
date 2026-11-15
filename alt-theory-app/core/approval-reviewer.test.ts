import assert from "node:assert/strict";
import test from "node:test";
import { parseReviewReply } from "./approval-reviewer.js";

test("the verdict parse is strict", () => {
  assert.deepEqual(parseReviewReply('{"outcome":"allow","reason":"fine"}'), { outcome: "allow", reason: "fine" });
  assert.deepEqual(parseReviewReply('Sure.\n```json\n{"outcome":"deny","reason":"deletes data"}\n```'), {
    outcome: "deny",
    reason: "deletes data",
  });
  assert.equal(parseReviewReply('{"outcome":"deny"}'), null, "a denial needs a reason");
  assert.equal(parseReviewReply('{"outcome":"escalate","reason":"?"}'), null);
  assert.equal(parseReviewReply("allow"), null);
});
