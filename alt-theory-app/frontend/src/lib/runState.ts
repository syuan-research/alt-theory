import type { PendingChanges } from "@/api/types";
import type { ConnStatus } from "@/components/ui/StatusBadge";
import { t } from "@/i18n";

/**
 * The one run-state projection for the render sites (v1.5, review card 1):
 * connection phase, the run's live detail, and the switches waiting for the
 * turn to end. Nothing else recombines isRunning / connStatus / phase label.
 */
export interface RunStateView {
  phase: ConnStatus;
  /** Short badge label. */
  label: string;
  /** Live detail while running ("Thinking…", a tool label); empty otherwise. */
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

export function runStateView(input: {
  connStatus: ConnStatus;
  running: boolean;
  phaseLabel: string;
  toolStatus: string;
  pending: PendingChanges;
}): RunStateView {
  const labels = runPhaseLabels();
  const phase: ConnStatus =
    input.running && input.connStatus === "idle" ? "running" : input.connStatus;
  const label = {
    connecting: labels.connecting,
    disconnected: labels.disconnected,
    error: labels.error,
    running: input.phaseLabel || input.toolStatus || labels.running,
    idle: input.toolStatus || labels.idle,
  }[phase];
  return {
    phase,
    label,
    detail: phase === "running" ? input.phaseLabel : "",
    pending: input.pending,
  };
}
