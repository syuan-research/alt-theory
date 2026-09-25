/**
 * Caps introduced by the memory/performance plan (2026-09-26). A new resident
 * client structure registers its bound here; older constants stay where they
 * are.
 */

/** Conversations whose loaded Changes diffs stay in memory for a remount. */
export const CHANGES_KEPT_MAX = 8;
