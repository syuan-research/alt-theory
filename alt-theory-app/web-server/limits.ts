/**
 * Caps introduced by the memory/performance plan (2026-09-26). A new resident
 * or transported structure registers its bound here; older constants stay
 * where they are.
 */

/** A tool result row keeps this many leading and trailing characters of the
 *  result; the full text stays in the Pi history. */
export const TOOL_RESULT_HEAD = 32 * 1024;
export const TOOL_RESULT_TAIL = 32 * 1024;
