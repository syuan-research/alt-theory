/**
 * Thinking-level resolver (v1.5 round 1, review card 3).
 *
 * The one rule for "which thinking level does this session run at": a level
 * the user chose is kept, or reported as clamped when the model cannot run
 * it; with no choice the model's midpoint level is used. Every model change
 * (open, switch, both fallback chains, subagent spawn) and the chip render
 * the answer of this function; nothing else computes a level.
 */
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

export type ThinkingSource = "user" | "model-default" | "clamped";

export interface ResolvedThinking {
  /** Level the session runs at. */
  level: ThinkingLevel;
  source: ThinkingSource;
  /** The user's choice when it differs from `level` (source = clamped) or equals it (source = user). */
  chosen?: ThinkingLevel;
}

/** Pi's ordering (pi-ai EXTENDED_THINKING_LEVELS). */
export const THINKING_LEVEL_ORDER: readonly ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

/** Midpoint of the model's non-off levels (lower middle on an even count); "medium" when unknown. */
export function defaultThinkingLevel(
  available: readonly ThinkingLevel[],
): ThinkingLevel {
  const enabled = available.filter((level) => level !== "off");
  return enabled[Math.floor((enabled.length - 1) / 2)] ?? "medium";
}

/**
 * Same rule as pi-ai `clampThinkingLevel`: the level itself when supported,
 * else the nearest higher supported level, else the nearest lower one.
 */
export function clampThinkingLevel(
  available: readonly ThinkingLevel[],
  level: ThinkingLevel,
): ThinkingLevel {
  if (available.includes(level)) return level;
  const from = THINKING_LEVEL_ORDER.indexOf(level);
  const supported = (candidate: ThinkingLevel) => available.includes(candidate);
  return (
    THINKING_LEVEL_ORDER.slice(from + 1).find(supported) ??
    THINKING_LEVEL_ORDER.slice(0, Math.max(from, 0)).reverse().find(supported) ??
    available[0] ??
    "off"
  );
}

/**
 * `chosen` present = the user (UI, preset, or deployment config) picked it.
 * An empty `available` list means the model's levels are unknown; the choice
 * is then kept as is and Pi's own clamp reports later via thinking_level_changed.
 */
export function resolveThinkingLevel(
  available: readonly ThinkingLevel[],
  chosen?: ThinkingLevel,
): ResolvedThinking {
  if (chosen === undefined) {
    return { level: defaultThinkingLevel(available), source: "model-default" };
  }
  if (available.length === 0 || available.includes(chosen)) {
    return { level: chosen, source: "user", chosen };
  }
  return { level: clampThinkingLevel(available, chosen), source: "clamped", chosen };
}
