/**
 * Child outcome (v1.5 round 1, review card 8).
 *
 * The one answer to "what is the lead told about this child": the lifecycle
 * mail body, the cause, and the status word check_agent / wait_for_agents /
 * list_agents report. Model-facing text: fixed English, never through t().
 */
import {
  runInterruptionCause,
  runOutcome,
  type InterruptionCause,
  type RunRecord,
} from "./run-records.js";

export interface ChildOutcome {
  event: "completed" | "failed" | "interrupted";
  cause: InterruptionCause | null;
  body: string;
  statusWord: string;
}

export function describeChildOutcome(
  run: Pick<RunRecord, "status" | "interruptionCause">,
  detail: { answer?: string | null; error?: string | null } = {},
): ChildOutcome | null {
  const outcome = runOutcome(run);
  if (!outcome) return null;
  if (outcome === "completed") {
    return {
      event: "completed",
      cause: null,
      body: detail.answer?.trim() || "(the subagent finished without a text answer)",
      statusWord: "finished",
    };
  }
  if (outcome === "failed") {
    return {
      event: "failed",
      cause: null,
      body: `The subagent's turn failed: ${detail.error?.trim() || "unknown error"}`,
      statusWord: "failed",
    };
  }
  const cause = runInterruptionCause(run) ?? "unknown";
  const interrupted = { event: "interrupted" as const, cause };
  // Owner ruling 2026-09-02: a user stop is final for the lead; other causes
  // stay factual and leave the child continuable.
  switch (cause) {
    case "user_abort":
      return {
        ...interrupted,
        body: "The user stopped this subagent. Do not restart or continue it unless the user asks.",
        statusWord: "interrupted (stopped by the user)",
      };
    case "lead_abort":
      return {
        ...interrupted,
        body: "You stopped this subagent with interrupt_agent. Its completed work is kept; message it with send_to_agent to continue.",
        statusWord: "interrupted (by you)",
      };
    case "process_exit":
      return {
        ...interrupted,
        body: "The app closed while this subagent was running. Its completed work is kept; message it with send_to_agent to continue.",
        statusWord: "interrupted (app closed)",
      };
    default:
      return {
        ...interrupted,
        body: "The subagent's turn was stopped. Its completed work is kept; it can continue from the break point.",
        statusWord: "interrupted",
      };
  }
}
