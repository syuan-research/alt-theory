import type { SessionServiceEvent } from "./session-service.js";

/**
 * The in-flight turn, buffered for late joiners (v1.4.3): a socket that
 * attaches mid-run gets the persisted transcript plus this replay, instead
 * of a blank pane until the run lands on disk.
 */
export interface LiveRun {
  /** User-facing prompt text — internal skill wrappers/commands are omitted. */
  userText: string | null;
  events: SessionServiceEvent[];
}

const REPLAYED = new Set<SessionServiceEvent["type"]>([
  "assistant_delta",
  "thinking_delta",
  "tool_started",
  "tool_updated",
  "tool_finished",
  "run_phase",
  "user_steered",
]);

/**
 * Buffer one emitted event. Consecutive text/thinking deltas coalesce into
 * one event so a long answer replays as one part, not thousands of tokens.
 */
export function appendLiveRunEvent(
  liveRun: LiveRun,
  event: SessionServiceEvent,
): void {
  if (!REPLAYED.has(event.type)) return;
  const last = liveRun.events.at(-1);
  if (
    (event.type === "assistant_delta" || event.type === "thinking_delta") &&
    last?.type === event.type
  ) {
    last.payload.text += event.payload.text;
    return;
  }
  // Successive phase changes: only the latest matters on replay.
  if (event.type === "run_phase" && last?.type === "run_phase") {
    liveRun.events[liveRun.events.length - 1] = event;
    return;
  }
  liveRun.events.push(event);
}
