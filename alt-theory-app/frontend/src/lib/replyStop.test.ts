import assert from "node:assert/strict";
import { test } from "node:test";
import { replyStopLine } from "./replyStop.ts";

test("a stopped or failed reply gets one line by stop reason; a finished one gets none", () => {
  assert.equal(replyStopLine("aborted"), "Stopped here. The model keeps this part.");
  assert.equal(replyStopLine("error"), "Failed here. The model does not keep this part.");
  assert.equal(replyStopLine(undefined), null);
});
