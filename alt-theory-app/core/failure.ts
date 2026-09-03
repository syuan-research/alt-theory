/**
 * Failure envelope (v1.5 round 1, review card 2).
 *
 * One shape for every failure the app reports — run_failed, a refused WS
 * request, an extension notice — and the one classifier the fallback rule
 * table matches on. Text patterns live here only; every other module asks
 * for the kind. `message` is the producer's own text, kept for diagnosis;
 * the client renders the kind in plain words and shows this text beside it.
 */

export type FailureKind =
  | "network"
  | "auth"
  | "rate-limit"
  | "provider"
  | "busy"
  | "aborted"
  /** The thing the request named is gone — a queued text Pi already delivered. */
  | "not_found"
  | "unknown";

export interface Failure {
  /** What was being done: "run", or the WS request type that was refused. */
  operation: string;
  kind: FailureKind;
  /** The producer's original text (provider, Pi, or Alt's own validation). */
  message: string;
  retryable: boolean;
}

const KIND_PATTERNS: Array<[FailureKind, RegExp]> = [
  ["network", /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket hang up|UND_ERR|network (error|is unavailable)/i],
  ["auth", /\b401\b|\b403\b|invalid api key|incorrect api key|authentication|unauthori[sz]ed|no api key|oauth refresh failed/i],
  ["rate-limit", /\b429\b|rate.?limit|too many requests|quota/i],
  ["provider", /\b5\d\d\b|overloaded|internal server error|bad gateway|service unavailable/i],
];

const RETRYABLE = new Set<FailureKind>(["network", "rate-limit", "provider"]);

/** Classify producer text. Interruption is never read from text (see run finalizers). */
export function failureKind(message: string): FailureKind {
  return KIND_PATTERNS.find(([, pattern]) => pattern.test(message))?.[0] ?? "unknown";
}

export function isFailure(value: unknown): value is Failure {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Failure).kind === "string" &&
    typeof (value as Failure).operation === "string" &&
    typeof (value as Failure).message === "string"
  );
}

export function describeFailure(error: unknown, operation: string): Failure {
  if (isFailure(error)) return error;
  const message =
    error instanceof Error ? error.message : error ? String(error) : "Unknown error";
  const kind: FailureKind =
    error instanceof Error && error.name === "AbortError"
      ? "aborted"
      : (error as { code?: string } | null)?.code === "session_busy"
        ? "busy"
        : failureKind(message);
  return { operation, kind, message, retryable: RETRYABLE.has(kind) };
}
