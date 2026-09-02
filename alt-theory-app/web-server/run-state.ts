/**
 * Run state (v1.5 round 1, review card 1).
 *
 * One phase per managed session and one place where "change this while a
 * turn runs" is decided: a change either applies now (idle) or is deferred
 * and drained by `settle()`, the only idle transition. Nothing here touches
 * Pi; the service owns the appliers, so this is testable on its own.
 */
import type { AltMode, RuntimeMode } from "../core/alt-theory-core.js";
import type { SessionModelOverride } from "./session-records.js";

export type RunPhase = "idle" | "running" | "stopping" | "queued";

/** Changes that wait for the turn to end. `undefined` = nothing pending. */
export interface PendingChanges {
  /** Per-conversation model (+ user-chosen thinking); null = app default. */
  model?: SessionModelOverride | null;
  mode?: AltMode;
  /** Only `true` is ever deferred; turning Full Access off applies live. */
  fullAccess?: boolean;
  runtime?: { mode: RuntimeMode; nativePiScanAltSkills: boolean };
}

export interface QueueSnapshot {
  steering: string[];
  followUp: string[];
}

export class RunState {
  private phase: "idle" | "running" | "stopping" = "idle";
  private pending: PendingChanges = {};
  /** Pi's prompt queue, mirrored from its queue_update events (card 11). */
  queue: QueueSnapshot = { steering: [], followUp: [] };

  state(): RunPhase {
    if (
      this.phase === "running" &&
      (this.queue.steering.length > 0 || this.queue.followUp.length > 0)
    ) {
      return "queued";
    }
    return this.phase;
  }

  isIdle(): boolean {
    return this.phase === "idle";
  }

  /** Caller has checked `isIdle()`; a run owns the session from here. */
  begin(): void {
    this.phase = "running";
  }

  stopping(): void {
    if (this.phase === "running") this.phase = "stopping";
  }

  pendingChanges(): PendingChanges {
    return { ...this.pending };
  }

  /**
   * Apply now when idle; otherwise remember the change for `settle()`.
   * A later change to the same key replaces the earlier pending one.
   */
  async applyOrDefer(
    changes: PendingChanges,
    applyNow: () => Promise<void> | void,
  ): Promise<"applied" | "deferred"> {
    if (this.phase === "idle") {
      await applyNow();
      return "applied";
    }
    Object.assign(this.pending, changes);
    return "deferred";
  }

  /** The only idle transition. Returns what was deferred, for the caller to apply. */
  settle(): PendingChanges {
    this.phase = "idle";
    const drained = this.pending;
    this.pending = {};
    return drained;
  }
}
