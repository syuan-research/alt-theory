import assert from "node:assert/strict";
import { test } from "node:test";
import { runPhaseLabels, runStateView } from "./runState.ts";

test("running shows the live detail; idle shows Ready; a deferred switch is carried, not an error", () => {
  const running = runStateView({
    connStatus: "running",
    running: true,
    phaseLabel: "Thinking…",
    toolStatus: "",
    pending: { mode: "work" },
  });
  assert.equal(running.phase, "running");
  assert.equal(running.label, "Thinking…");
  assert.equal(running.detail, "Thinking…");
  assert.deepEqual(running.pending, { mode: "work" });

  const idle = runStateView({
    connStatus: "idle",
    running: false,
    phaseLabel: "",
    toolStatus: "",
    pending: {},
  });
  assert.equal(idle.label, "Ready");
  assert.equal(idle.detail, "");

  // The engine may see a stream before the connection status catches up.
  assert.equal(
    runStateView({ connStatus: "idle", running: true, phaseLabel: "", toolStatus: "", pending: {} })
      .phase,
    "running",
  );
  assert.equal(
    runStateView({ connStatus: "running", running: true, phaseLabel: "", toolStatus: "Opening…", pending: {} })
      .label,
    "Opening…",
  );
});

test("stopping and queued come from the run-state label set", () => {
  const labels = runPhaseLabels();
  const stopping = runStateView({
    connStatus: "running",
    running: true,
    phaseLabel: labels.stopping,
    toolStatus: "",
    pending: {},
  });
  assert.equal(stopping.label, "Stopping…");
  assert.equal(stopping.detail, "Stopping…");
  assert.equal(labels.queued, "Queued — the agent sees it at its next step");
});
