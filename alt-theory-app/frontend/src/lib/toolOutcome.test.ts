import assert from "node:assert/strict";
import { test } from "node:test";
import { toolOutcome } from "./toolOutcome.ts";

test("a tool row is running, finished, failed, or pending when it has no result", () => {
  assert.equal(toolOutcome({ running: true }), "running");
  assert.equal(toolOutcome({ success: true }), "finished");
  assert.equal(toolOutcome({ success: false }), "failed");
  assert.equal(toolOutcome({}), "pending");
});
