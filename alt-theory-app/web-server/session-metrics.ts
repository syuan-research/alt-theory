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
  const stats = session.getSessionStats();
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
