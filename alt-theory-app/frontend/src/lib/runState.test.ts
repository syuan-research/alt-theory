import assert from "node:assert/strict";
import { test } from "node:test";
import { runPhaseLabels, runStateView } from "./runState.ts";

const base = { socket: "open" as const, busy: false, phaseLabel: "", toolStatus: "", pending: {} };

test("running shows the live detail; idle shows Ready; a deferred switch is carried, not an error", () => {
  const running = runStateView({ ...base, running: true, phaseLabel: "Thinking…", pending: { mode: "work" } });
  assert.equal(running.phase, "running");
  assert.equal(running.label, "Thinking…");
  assert.equal(running.detail, "Thinking…");
  assert.deepEqual(running.pending, { mode: "work" });

  const idle = runStateView({ ...base, running: false });
  assert.equal(idle.phase, "idle");
  assert.equal(idle.label, "Ready");
  assert.equal(idle.detail, "");
});

test("a request in flight reads as running with its label; the socket state wins over both", () => {
  const opening = runStateView({ ...base, running: false, busy: true, toolStatus: "Opening…" });
  assert.equal(opening.phase, "running");
  assert.equal(opening.label, "Opening…");
  assert.equal(runStateView({ ...base, socket: "closed", running: true }).phase, "disconnected");
  assert.equal(runStateView({ ...base, socket: "connecting", running: false }).phase, "connecting");
  assert.equal(runStateView({ ...base, socket: "error", running: false, busy: true }).phase, "error");
});

test("stopping and queued come from the run-state label set", () => {
  const labels = runPhaseLabels();
  const stopping = runStateView({ ...base, running: true, phaseLabel: labels.stopping });
  assert.equal(stopping.label, "Stopping…");
  assert.equal(stopping.detail, "Stopping…");
  assert.equal(labels.queued, "Queued — the agent sees it at its next step");
});
