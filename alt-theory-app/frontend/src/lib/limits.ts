/**
 * Caps introduced by the memory/performance plan (2026-09-26). A new resident
 * client structure registers its bound here; older constants stay where they
 * are.
 */

/** Conversations whose loaded Changes diffs stay in memory for a remount. */
export const CHANGES_KEPT_MAX = 8;

/** Rows asked for per page when the transcript scrolls up (the server caps
 *  pages at 200); a page is asked for while one screen above is still loaded. */
export const TRANSCRIPT_PAGE_ROWS = 100;
