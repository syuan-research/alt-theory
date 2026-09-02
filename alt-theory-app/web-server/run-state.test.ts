import assert from "node:assert/strict";
import { test } from "node:test";
import { RunState } from "./run-state.js";

test("a switch while idle applies now", async () => {
  const state = new RunState();
  let applied = 0;
  const result = await state.applyOrDefer({ mode: "work" }, () => {
    applied++;
  });
  assert.equal(result, "applied");
  assert.equal(applied, 1);
  assert.deepEqual(state.pendingChanges(), {});
});

test("a switch while running is deferred and drains at settle", async () => {
  const state = new RunState();
  state.begin();
  assert.equal(state.state(), "running");
  let applied = 0;
  assert.equal(
    await state.applyOrDefer({ mode: "work" }, () => {
      applied++;
    }),
    "deferred",
  );
  assert.equal(
    await state.applyOrDefer(
      { model: { provider: "p", modelId: "m", thinkingLevel: "low" } },
      () => {
        applied++;
      },
    ),
    "deferred",
  );
  // A later change to the same key replaces the earlier one.
  await state.applyOrDefer({ mode: "understand" }, () => {
    applied++;
  });
  assert.equal(applied, 0);
  assert.deepEqual(state.pendingChanges(), {
    mode: "understand",
    model: { provider: "p", modelId: "m", thinkingLevel: "low" },
  });
  const drained = state.settle();
  assert.equal(state.state(), "idle");
  assert.deepEqual(drained, {
    mode: "understand",
    model: { provider: "p", modelId: "m", thinkingLevel: "low" },
  });
  assert.deepEqual(state.pendingChanges(), {});
});

test("stop settles too: pending applies at the stop", async () => {
  const state = new RunState();
  state.begin();
  await state.applyOrDefer({ fullAccess: true }, () => {});
  state.stopping();
  assert.equal(state.state(), "stopping");
  assert.deepEqual(state.settle(), { fullAccess: true });
  assert.equal(state.state(), "idle");
});

test("queued messages show as the queued phase only while running", () => {
  const state = new RunState();
  state.queue = { steering: ["next"], followUp: [] };
  assert.equal(state.state(), "idle");
  state.begin();
  assert.equal(state.state(), "queued");
  state.queue = { steering: [], followUp: [] };
  assert.equal(state.state(), "running");
});
