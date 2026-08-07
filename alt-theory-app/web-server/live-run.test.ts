import { test } from "node:test";
import assert from "node:assert/strict";
import { appendLiveRunEvent, type LiveRun } from "./live-run.js";
import type { SessionServiceEvent } from "./session-service.js";

const run = (): LiveRun => ({ userText: "go", events: [] });
const delta = (text: string): SessionServiceEvent => ({
  type: "assistant_delta",
  payload: { text },
});

test("consecutive text deltas coalesce into one replay part", () => {
  const live = run();
  appendLiveRunEvent(live, delta("Hel"));
  appendLiveRunEvent(live, delta("lo"));
  assert.equal(live.events.length, 1);
  assert.deepEqual(live.events[0], delta("Hello"));
});

test("a tool call splits the text; thinking and text never merge", () => {
  const live = run();
  appendLiveRunEvent(live, { type: "thinking_delta", payload: { text: "hm" } });
  appendLiveRunEvent(live, delta("A"));
  appendLiveRunEvent(live, {
    type: "tool_started",
    payload: { toolName: "read", callId: "c1" },
  });
  appendLiveRunEvent(live, delta("B"));
  assert.deepEqual(
    live.events.map((event) => event.type),
    ["thinking_delta", "assistant_delta", "tool_started", "assistant_delta"],
  );
});

test("only the latest of consecutive run phases is kept; other event types are not buffered", () => {
  const live = run();
  appendLiveRunEvent(live, { type: "run_phase", payload: { phase: "connecting" } });
  appendLiveRunEvent(live, { type: "run_phase", payload: { phase: "thinking" } });
  appendLiveRunEvent(live, {
    type: "extension_notice",
    payload: { message: "x", level: "info" },
  } as SessionServiceEvent);
  assert.deepEqual(live.events, [
    { type: "run_phase", payload: { phase: "thinking" } },
  ]);
});

test("a steered message is buffered in order for late joiners", () => {
  const live = run();
  appendLiveRunEvent(live, delta("working"));
  appendLiveRunEvent(live, { type: "user_steered", payload: { text: "also check X" } });
  appendLiveRunEvent(live, delta("…on it"));
  assert.deepEqual(
    live.events.map((event) => event.type),
    ["assistant_delta", "user_steered", "assistant_delta"],
  );
});
