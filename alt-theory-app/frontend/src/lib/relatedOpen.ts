/**
 * When the right-panel sub leaves a related:* view (Back, close rail, switch
 * rail), sticky app.activeRelatedSessionId must clear so re-selecting the same
 * child re-opens. Do not clear on open (null → related:id).
 */
export function shouldClearRelatedOnSubChange(
  prevKey: string | null | undefined,
  nextKey: string | null | undefined,
): boolean {
  const wasRelated = Boolean(prevKey?.startsWith("related:"));
  const isRelated = Boolean(nextKey?.startsWith("related:"));
  return wasRelated && !isRelated;
}

/**
 * Whether a related_session_created birth takes over the right rail. A
 * spawned subagent only claims an empty rail — never the conversation the
 * user is reading (its Related row is the feedback). btw/helper creation is
 * user-initiated and always takes the rail.
 */
export function shouldAutoOpenRelated(
  purpose: string,
  activeRelatedSessionId: string | null,
): boolean {
  if (purpose !== "subagent") return true;
  return activeRelatedSessionId === null;
}
