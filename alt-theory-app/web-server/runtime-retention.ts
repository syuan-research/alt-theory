/**
 * When an open conversation's runtime may be released (perf plan WP 2.1).
 * The one reclaim rule: SessionService builds a view per live instance, this
 * module decides, the service disposes. Nothing else judges "can this go".
 */
import {
  RUNTIME_HIGH_WATER,
  RUNTIME_IDLE_MS,
  RUNTIME_LRU_MIN_IDLE_MS,
  RUNTIME_SWEEP_MS,
  RUNTIME_TARGET,
} from "./limits.js";

export interface RuntimeView {
  sessionId: string;
  /** Windows following the conversation. */
  listeners: number;
  /** RunState idle (no turn, compaction or queued continuation). */
  idle: boolean;
  /** In-flight settle / replacement / auto-title (SessionService.withHold). */
  hold: number;
  pendingApprovals: number;
  /** Waiting for a subagent concurrency slot: its start needs the runtime. */
  queuedSubagent: boolean;
  /** A running or queued subagent child: its completion wakes this lead. */
  activeChildren: boolean;
  /** Last time it became unwatched and idle (open, last detach, settle). */
  idleSince: number;
  /** Pi has written its history file; before that a reopen has nothing to open. */
  onDisk: boolean;
}

/** Nothing depends on the runtime staying in memory right now. */
export function releasable(view: RuntimeView): boolean {
  return (
    view.listeners === 0 &&
    view.idle &&
    view.hold === 0 &&
    view.pendingApprovals === 0 &&
    !view.queuedSubagent &&
    !view.activeChildren &&
    view.onDisk
  );
}

/**
 * The runtimes to reclaim now: every releasable one idle for RUNTIME_IDLE_MS,
 * then — while more than RUNTIME_HIGH_WATER stay live — the longest-idle
 * releasable ones down to RUNTIME_TARGET. Busy runtimes are never picked,
 * however many there are; one just opened gets a minute before the LRU
 * may take it (a fork or arm about to start its run).
 */
export function pickReclaims(views: RuntimeView[], now: number): string[] {
  const candidates = views
    .filter(releasable)
    .sort((a, b) => a.idleSince - b.idleSince);
  const picked = new Set(
    candidates
      .filter((view) => now - view.idleSince >= RUNTIME_IDLE_MS)
      .map((view) => view.sessionId),
  );
  let live = views.length - picked.size;
  if (live > RUNTIME_HIGH_WATER) {
    for (const view of candidates) {
      if (live <= RUNTIME_TARGET) break;
      if (picked.has(view.sessionId) || now - view.idleSince < RUNTIME_LRU_MIN_IDLE_MS) continue;
      picked.add(view.sessionId);
      live--;
    }
  }
  return [...picked];
}

/** Runs `reclaim` every RUNTIME_SWEEP_MS; returns the stop. */
export function sweepIdleRuntimes(reclaim: () => void): () => void {
  const timer = setInterval(() => {
    try {
      reclaim();
    } catch (error) {
      console.error("Runtime reclaim sweep failed:", error);
    }
  }, RUNTIME_SWEEP_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
