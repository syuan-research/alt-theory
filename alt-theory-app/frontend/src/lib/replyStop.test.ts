import assert from "node:assert/strict";
import { test } from "node:test";
import { replyStopLine } from "./replyStop.ts";

test("the stop line says what stopped the text and whether the model still sees it", () => {
  assert.equal(replyStopLine("aborted", true), "Stopped here. The model can see this part.");
  assert.equal(replyStopLine("error", true), "Failed here. The model can see this part.");
  assert.equal(replyStopLine("error", false), "Failed here. This part was not sent to the model.");
  assert.equal(
    replyStopLine("length", false),
    "Cut off here: the reply was too long. This part was not sent to the model.",
  );
  assert.equal(replyStopLine(undefined, undefined), null);
});
