import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { resolve } from "path";
import { writeJsonAtomic } from "../core/data-dir.js";
import type { SessionMetrics } from "./websocket-protocol.js";

export interface SessionCounters {
  turnCount: number;
  toolCallCount: number;
  messageCount: number;
}

export function buildSessionMetrics(
  session: Pick<AgentSession, "getSessionStats">,
  counters: SessionCounters
): SessionMetrics {
  let stats: ReturnType<AgentSession["getSessionStats"]>;
  try {
    stats = session.getSessionStats();
  } catch {
    // Pi's totals throw on an assistant entry without `usage` (imported
    // sessions, stubbed turns). Metrics are a report, never a reason to fail
    // the run: unknown context, zero totals.
    return {
      ...counters,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      cost: 0,
      contextUsage: null,
    };
  }
  return {
    ...counters,
    tokens: stats.tokens,
    cost: stats.cost,
    contextUsage: stats.contextUsage ?? null,
  };
}

export function persistSessionMetrics(
  recordsDir: string,
  metrics: SessionMetrics
): string {
  const path = resolve(recordsDir, "session-metrics.json");
  writeJsonAtomic(path, metrics);
  return path;
}
