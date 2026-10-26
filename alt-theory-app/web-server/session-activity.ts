import { closeSync, existsSync, openSync, readSync, statSync } from "fs";
import type { RunRecord } from "./run-records.js";

/** Ignore file mtimes and lifecycle/config writes: opening is not activity. */
export function lastSessionActivity(
  sessionFile: string | null,
  runs: RunRecord[],
  createdAt: string | null,
): string | null {
  let latest = Date.parse(createdAt ?? "") || 0;
  for (const run of runs) {
    latest = Math.max(latest, Date.parse(run.acceptedAt) || 0);
    // Crash recovery stamps its discovery time on open, not when work stopped.
    if (run.interruptionCause !== "process_exit") {
      latest = Math.max(latest, Date.parse(run.completedAt ?? "") || 0);
    }
  }
  if (sessionFile && existsSync(sessionFile)) {
    const fd = openSync(sessionFile, "r");
    try {
      // Usually only one tail block is needed, even for a large transcript.
      let position = statSync(sessionFile).size;
      let remainder = Buffer.alloc(0);
      let found = false;
      while (position > 0 && !found) {
        const size = Math.min(position, 64 * 1024);
        position -= size;
        const block = Buffer.alloc(size);
        readSync(fd, block, 0, size, position);
        const bytes = Buffer.concat([block, remainder]);
        const firstLineEnd = position > 0 ? bytes.indexOf(10) : -1;
        remainder = position > 0 ? bytes.subarray(0, firstLineEnd < 0 ? bytes.length : firstLineEnd + 1) : Buffer.alloc(0);
        const lines = (position > 0 ? bytes.subarray(remainder.length) : bytes).toString("utf8").split("\n");
        for (const line of lines.reverse()) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.type !== "message" || !["user", "assistant", "toolResult"].includes(entry.message?.role)) continue;
            const value = entry.timestamp ?? entry.message.timestamp;
            const time = typeof value === "number" ? value : Date.parse(value);
            if (!Number.isFinite(time)) continue;
            latest = Math.max(latest, time);
            found = true;
            break;
          } catch { /* An unfinished append must not break the conversation list. */ }
        }
      }
    } finally {
      closeSync(fd);
    }
  }
  return latest ? new Date(latest).toISOString() : null;
}
