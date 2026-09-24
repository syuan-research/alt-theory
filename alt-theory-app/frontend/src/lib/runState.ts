import type { PendingChanges } from "@/api/types";
import type { ConnStatus } from "@/components/ui/StatusBadge";
import { t } from "@/i18n";
import {
  busyRequests,
  isBusy,
  isRunning,
  pendingChanges,
  type ConversationState,
  type NoticeBody,
  type PendingRequest,
  type TurnActivity,
} from "@/lib/conversation";
import { failureText } from "@/lib/failure";
import { toolLabel } from "@/lib/tools";

/**
 * The one run-state projection for the render sites (v1.5, review card 1):
 * connection phase, the run's live detail, and the switches waiting for the
 * turn to end. The label tables for a conversation's state live here, next to
 * it; lib/conversation.ts keeps the facts.
 */
export interface RunStateView {
  phase: ConnStatus;
  /** Short badge label. */
  label: string;
  /** Live detail while running or waiting ("Thinking…", a tool, "Opening…"). */
  detail: string;
  pending: PendingChanges;
}

/** The one label set for run-state surfaces (queued / stopping included). */
export function runPhaseLabels() {
  return {
    connecting: t("Connecting"),
    disconnected: t("Disconnected"),
    error: t("Error"),
    running: t("Running"),
    idle: t("Ready"),
    stopping: t("Stopping…"),
    queued: t("Queued — the agent sees it at its next step"),
  };
}

/** What the in-flight turn is doing, in words. */
export function activityLabel(activity: TurnActivity): string {
  if (!activity) return "";
  if (activity.kind === "tool") {
    const { tool } = activity;
    const label = toolLabel(tool.toolName, tool.path, tool.detail, "running");
    return tool.progressText ? `${label} — ${tool.progressText}` : label;
  }
  if (activity.phase === "retrying" && activity.retry) {
    return t("Connection issue — retrying ({attempt}/{maxAttempts})…", {
      attempt: activity.retry.attempt,
      maxAttempts: activity.retry.maxAttempts,
    });
  }
  return {
    connecting: t("Connecting…"),
    processing: t("Processing…"),
    thinking: t("Thinking…"),
    tool: t("Using a tool…"),
    compacting: t("Compacting conversation…"),
    retrying: t("Connection issue — retrying…"),
    "awaiting-user": t("Waiting for your approval…"),
    idle: "",
    error: "",
  }[activity.phase];
}

/** What a request in flight is waiting for, in words ("" = no label). */
export function requestLabel(request: PendingRequest): string {
  const { message } = request;
  switch (message.type) {
    case "open_session":
      return request.restore ? t("Restoring conversation…") : t("Opening conversation…");
    case "fork_session":
      return message.payload.sourceSessionId
        ? t("Making a copy of this conversation…")
        : t("Branching conversation…");
    case "create_related_session":
      return message.payload.purpose === "helper"
        ? t("Starting a fresh helper…")
        : t("Starting a related conversation…");
    case "create_helper_session":
      return t("Starting a fresh helper…");
    case "prepare_branch_revision":
      return t("Preparing comparison…");
    case "switch_role_preset":
    case "switch_soul":
    case "switch_instruction":
      return t("Switching role preset…");
    case "compact":
      return t("Compacting conversation…");
    case "abort":
      return runPhaseLabels().stopping;
    case "prompt":
    case "invoke_skill":
    case "continue_latest":
    case "retry_latest":
    case "revise_latest":
    case "branch_revision":
    case "new_session":
      return t("Connecting…");
    default:
      return "";
  }
}

export function runStateView(state: ConversationState): RunStateView {
  const labels = runPhaseLabels();
  const running = isRunning(state);
  const phase: ConnStatus =
    state.socket === "open"
      ? running || isBusy(state)
        ? "running"
        : "idle"
      : state.socket === "closed"
        ? "disconnected"
        : state.socket;
  // The latest request speaks first (a Stop over its running turn), then
  // the turn's own activity.
  const waiting = busyRequests(state).map(requestLabel).filter(Boolean).at(-1) ?? "";
  const detail = phase === "running" ? waiting || activityLabel(state.turn.activity) : "";
  return {
    phase,
    label: {
      connecting: labels.connecting,
      disconnected: t("Reconnecting..."),
      error: labels.error,
      running: detail || labels.running,
      idle: labels.idle,
    }[phase],
    detail,
    pending: pendingChanges(state),
  };
}

/** A conversation notice in words. */
export function noticeText(body: NoticeBody): string {
  switch (body.kind) {
    case "text":
      return body.text;
    case "run-failed":
      if (body.failure.kind === "auth-refresh") return failureText(body.failure);
      return `${body.interrupted ? t("Run interrupted: ") : t("Run failed: ")}${failureText(body.failure)}`;
    case "refused":
      return body.code === "auth_required" ? t("Please sign in to continue.") : failureText(body.failure);
    case "extension":
      return body.failure ? failureText(body.failure) : body.message;
    case "unsent":
      return t("That message may not have reached Alt, so it is back in the box.");
  }
}

/** Warning-styled notices (the others read as plain information). */
export function noticeWarns(body: NoticeBody): boolean {
  switch (body.kind) {
    case "text":
      return Boolean(body.warn);
    case "run-failed":
      return !body.interrupted;
    case "extension":
      return body.level !== "info";
    case "refused":
    case "unsent":
      return true;
  }
}
