/**
 * Caps introduced by the memory/performance plan (2026-09-26). A new resident
 * or transported structure registers its bound here; older constants stay
 * where they are.
 */

/** A tool result row keeps this many leading and trailing characters of the
 *  result; the full text stays in the Pi history. */
export const TOOL_RESULT_HEAD = 32 * 1024;
export const TOOL_RESULT_TAIL = 32 * 1024;

/** Live conversation runtimes (perf plan WP 2.1): an unwatched, idle runtime
 *  is released after RUNTIME_IDLE_MS; above RUNTIME_HIGH_WATER live ones the
 *  longest-idle releasable ones go down to RUNTIME_TARGET, each after at
 *  least RUNTIME_LRU_MIN_IDLE_MS. The sweep runs every RUNTIME_SWEEP_MS. */
export const RUNTIME_IDLE_MS = 15 * 60_000;
export const RUNTIME_HIGH_WATER = 12;
export const RUNTIME_TARGET = 6;
export const RUNTIME_LRU_MIN_IDLE_MS = 60_000;
export const RUNTIME_SWEEP_MS = 60_000;

/** A conversation opens with at least this many rows of its tail (moved up
 *  to a user row, three user rows at least); older rows come in pages of at
 *  most TRANSCRIPT_PAGE_MAX (perf plan WP 2.2). */
export const TRANSCRIPT_TAIL_ROWS = 60;
export const TRANSCRIPT_PAGE_MAX = 200;
