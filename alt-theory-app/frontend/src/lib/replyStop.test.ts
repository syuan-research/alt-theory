import assert from "node:assert/strict";
import { test } from "node:test";
import { replyStopLine, retryDroppedLine } from "./replyStop.ts";

test("the stop line says what happened and whether the model can see the output", () => {
  assert.equal(replyStopLine("aborted"), "Stopped. The model can't see this output.");
  assert.equal(replyStopLine("error"), "The reply failed. The model can't see this output.");
  // a length cut keeps the text in context — no drop claim, ever
  assert.equal(
    replyStopLine("length"),
    "Cut off here: the reply was too long. The model can see this part.",
  );
  assert.equal(replyStopLine(undefined), null);
  assert.equal(
    retryDroppedLine(),
    "The previous attempt failed. The model can't see that output.",
  );
});
