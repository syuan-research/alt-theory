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

export function runStateView(input: {
  connStatus: ConnStatus;
  running: boolean;
  phaseLabel: string;
  toolStatus: string;
  pending: PendingChanges;
}): RunStateView {
  const phase: ConnStatus =
    input.running && input.connStatus === "idle" ? "running" : input.connStatus;
  const label = {
    connecting: t("Connecting"),
    disconnected: t("Disconnected"),
    error: t("Error"),
    running: input.phaseLabel || input.toolStatus || t("Running"),
    idle: input.toolStatus || t("Ready"),
  }[phase];
  return {
    phase,
    label,
    detail: phase === "running" ? input.phaseLabel : "",
    pending: input.pending,
  };
}
