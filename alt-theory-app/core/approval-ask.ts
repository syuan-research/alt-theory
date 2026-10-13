/**
 * Putting an action to its approver: smart approval's reviewer, else the
 * user's dialog (plan §17, 2026-10-13). One per conversation, shared by the
 * security extension (commands, files) and messages to other conversations
 * (session-service), so the denial brake, the timeout count, and the
 * verdict on the tool row behave the same for both.
 *
 * Each caller keeps what is its own: when to ask, what a grant means, the
 * dialog's options, and the audit of the user's answer.
 */

import type { ExtensionUIDialogOptions } from "@earendil-works/pi-coding-agent";
import type { ReviewRequest, ReviewVerdict } from "./approval-reviewer.js";

/** A blocked call's result is only this text plus the reason; the
 *  conversation projection reads the verdict back from it. */
export const SMART_DENIAL_PREFIX = "Smart approval denied this action: ";

/** An unattended approval fails closed after this long instead of hanging. */
export const APPROVAL_TIMEOUT_MS = 5 * 60_000;

/** Consecutive reviewer denials in one run before the agent is told to stop (ruling K). */
const DENIAL_BRAKE = 3;

/**
 * What the agent reads when an approval went unanswered: the first time it
 * may try again later; from the second time in a row it treats the user as
 * away (owner 2026-10-12, plan §11).
 */
export function approvalTimeoutText(count: number): string {
  return count <= 1
    ? "the approval timed out; the user may be away. You can try again later."
    : "the approval timed out again; treat the user as away: continue with work that needs no approval, or stop and wait for the user.";
}

/** The reviewer's verdict as a tool row shows it (tool result details). */
export interface ApprovalRecord {
  by: "smart";
  outcome: "allow" | "deny";
  reason: string;
  model: string;
}

/** One reviewer audit line (the conversation's security-audit.jsonl). */
export interface ReviewAudit {
  toolName: string;
  toolCallId: string;
  action: "reviewer-allowed" | "reviewer-denied";
  rule: string;
  detail: string;
  /** Characters of material the reviewer was sent (for sizing its budget later). */
  reviewChars?: number;
}

export type ReviewAction = (
  request: ReviewRequest,
  context: { toolCallId: string; priorDenials: number; signal?: AbortSignal },
) => Promise<ReviewVerdict>;

export type Select = (
  title: string,
  options: string[],
  dialog: ExtensionUIDialogOptions,
) => Promise<string | undefined>;

export interface Approver {
  /** Smart approval can answer: a reviewer is attached. */
  readonly canReview: boolean;
  /** A new run: denials and unanswered approvals count from zero. */
  startRun(): void;
  /**
   * The reviewer's answer. `cacheKey` repeats an allow for the same key
   * without asking again (omit it: always asked). A deny's text carries the
   * brake line once several in a row were denied.
   */
  review(
    request: ReviewRequest & { rule: string; toolCallId: string; signal?: AbortSignal; cacheKey?: string },
  ): Promise<{ outcome: "allow" } | { outcome: "deny"; text: string } | { outcome: "unavailable"; reason: string }>;
  /**
   * The user's dialog, bounded and abortable. `answered` is the choice
   * (undefined: dismissed); `timedOut` is the text the agent reads.
   */
  ask(
    select: Select,
    title: string,
    options: string[],
    signal?: AbortSignal,
  ): Promise<{ answered: string | undefined } | { stopped: true } | { timedOut: string }>;
  /** The verdict to show on this call's tool row, once. */
  takeRecord(toolCallId: string): ApprovalRecord | undefined;
}

export function createApprover(options: {
  reviewAction?: ReviewAction;
  audit?: (entry: ReviewAudit) => void;
}): Approver {
  const { reviewAction, audit } = options;
  // Smart approval: what the reviewer allowed in this conversation, by the
  // caller's key; never across conversations, never on disk.
  const allowed = new Map<string, ApprovalRecord>();
  // Verdicts waiting for their tool result, so the row can show them.
  const records = new Map<string, ApprovalRecord>();
  let denials = 0;
  let timeouts = 0;

  return {
    canReview: reviewAction !== undefined,
    startRun() {
      denials = 0;
      timeouts = 0;
      // A call stopped before it ran leaves its verdict behind.
      records.clear();
    },
    async review({ rule, toolCallId, signal, cacheKey, ...request }) {
      const cached = cacheKey === undefined ? undefined : allowed.get(cacheKey);
      if (cached) {
        records.set(toolCallId, cached);
        return { outcome: "allow" };
      }
      if (!reviewAction) return { outcome: "unavailable", reason: "no reviewer is attached" };
      const answer = await reviewAction(request, { toolCallId, priorDenials: denials, signal });
      if (answer.outcome === "unavailable") return answer;
      const record: ApprovalRecord = { by: "smart", outcome: answer.outcome, reason: answer.reason, model: answer.model };
      records.set(toolCallId, record);
      audit?.({
        toolName: request.toolName,
        toolCallId,
        action: answer.outcome === "allow" ? "reviewer-allowed" : "reviewer-denied",
        rule,
        detail: `${request.title} — ${answer.model}: ${answer.reason}`,
        ...(answer.reviewChars !== undefined ? { reviewChars: answer.reviewChars } : {}),
      });
      if (answer.outcome === "allow") {
        denials = 0;
        if (cacheKey !== undefined) allowed.set(cacheKey, record);
        return { outcome: "allow" };
      }
      denials++;
      const brake =
        denials >= DENIAL_BRAKE
          ? " Several actions in a row were denied: stop trying other ways around this and ask the user in the conversation."
          : "";
      return { outcome: "deny", text: `${SMART_DENIAL_PREFIX}${answer.reason}${brake}` };
    },
    async ask(select, title, choices, signal) {
      let ending: string | undefined;
      const choice = await select(title, choices, {
        signal,
        timeout: APPROVAL_TIMEOUT_MS,
        onResolution: (resolution: string) => {
          ending = resolution;
        },
      } as ExtensionUIDialogOptions);
      if (choice !== undefined) {
        timeouts = 0;
        return { answered: choice };
      }
      if (signal?.aborted) return { stopped: true };
      // A dialog cancelled because the runtime was replaced reads as a
      // timeout too (owner 2026-10-12, plan §11).
      if (ending === "timeout" || ending === "cancelled") return { timedOut: approvalTimeoutText(++timeouts) };
      timeouts = 0;
      return { answered: undefined };
    },
    takeRecord(toolCallId) {
      const record = records.get(toolCallId);
      records.delete(toolCallId);
      return record;
    },
  };
}
