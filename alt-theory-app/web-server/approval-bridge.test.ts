import assert from "node:assert/strict";
import test from "node:test";
import { ApprovalBridge, type AltDialogOptions, type ApprovalResolution } from "./approval-bridge.js";

test("a dialog's caller learns how it ended: answered, timed out, or cancelled", async () => {
  const announced: ApprovalResolution[] = [];
  const bridge = new ApprovalBridge({
    onRequest: () => {},
    onResolve: (_id, resolution) => announced.push(resolution),
    onNotify: () => {},
  });
  const select = (timeout?: number) => {
    let ending: ApprovalResolution | undefined;
    const options: AltDialogOptions = { timeout, onResolution: (resolution) => (ending = resolution) };
    const choice = bridge.uiContext.select("t", ["Allow once", "Deny"], options);
    return { choice, ending: () => ending };
  };

  const answered = select();
  bridge.respond(bridge.listPending()[0].approvalId, { choice: "Deny" });
  assert.equal(await answered.choice, "Deny");
  assert.equal(answered.ending(), "responded");

  const unanswered = select(5);
  assert.equal(await unanswered.choice, undefined);
  assert.equal(unanswered.ending(), "timeout");

  const disposed = select();
  bridge.disposeAll();
  assert.equal(await disposed.choice, undefined);
  assert.equal(disposed.ending(), "cancelled");
  // Each ending is announced to the clients exactly once.
  assert.deepEqual(announced, ["responded", "timeout", "cancelled"]);
});
