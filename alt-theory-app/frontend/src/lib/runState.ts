import type { PendingChanges } from "@/api/types";
import type { ConnStatus } from "@/components/ui/StatusBadge";
import type { WsConnStatus } from "@/hooks/useWebSocket";
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
  /** The socket's own state (set by the socket only). */
  socket: WsConnStatus;
  /** The server's run fact (snapshot / run events), or the optimistic send. */
  running: boolean;
  /** A request of this client in flight (open, fork, compact, asset switch). */
  busy: boolean;
  phaseLabel: string;
  toolStatus: string;
  pending: PendingChanges;
}): RunStateView {
  const labels = runPhaseLabels();
  const phase: ConnStatus =
    input.socket === "open"
      ? input.running || input.busy
        ? "running"
        : "idle"
      : input.socket === "closed"
        ? "disconnected"
        : input.socket;
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
