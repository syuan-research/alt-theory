import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServerMessage, SessionSnapshot } from "@/api/types";
import { initialConversationState, reduce, type ConversationInput } from "./conversation.ts";
import { runPhaseLabels, runStateView } from "./runState.ts";

const snapshot = (patch: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  sessionId: "s1",
  status: "idle",
  currentDomain: "ep-core",
  rolePresetSlug: null,
  soulSlug: null,
  messageCount: 0,
  ...patch,
});
const server = (message: ServerMessage): ConversationInput => ({ type: "server", message });
const opened = (patch: Partial<SessionSnapshot> = {}) =>
  [
    { type: "socket", status: "open" },
    server({ type: "session_opened", payload: snapshot(patch) }),
  ] as ConversationInput[];
const run = (inputs: ConversationInput[]) => inputs.reduce(reduce, initialConversationState());

test("running shows the live detail; idle shows Ready; a deferred switch is carried, not an error", () => {
  const running = runStateView(
    run([
      ...opened({ status: "running", pending: { mode: "work" } }),
      server({ type: "run_phase", payload: { phase: "thinking" } }),
    ]),
  );
  assert.equal(running.phase, "running");
  assert.equal(running.label, "Thinking…");
  assert.equal(running.detail, "Thinking…");
  assert.deepEqual(running.pending, { mode: "work" });

  const idle = runStateView(run(opened()));
  assert.equal(idle.phase, "idle");
  assert.equal(idle.label, "Ready");
  assert.equal(idle.detail, "");
});

test("a request in flight reads as running with its label; the socket state wins over both", () => {
  const opening = runStateView(
    run([
      ...opened(),
      { type: "request", request: { id: "r1", from: "s1", message: { type: "open_session", payload: { sessionId: "s2" } } } },
    ]),
  );
  assert.equal(opening.phase, "running");
  assert.equal(opening.label, "Opening conversation…");
  const closed = run([...opened({ status: "running" }), { type: "socket", status: "closed" }]);
  assert.equal(runStateView(closed).phase, "disconnected");
  assert.equal(runStateView(initialConversationState()).phase, "connecting");
});

test("Stop reads as stopping over its running turn", () => {
  const stopping = runStateView(
    run([
      ...opened({ status: "running" }),
      server({ type: "run_phase", payload: { phase: "thinking" } }),
      { type: "request", request: { id: "r1", from: "s1", message: { type: "abort" } } },
    ]),
  );
  assert.equal(stopping.label, runPhaseLabels().stopping);
  assert.equal(runPhaseLabels().queued, "Queued — the agent sees it at its next step");
});
