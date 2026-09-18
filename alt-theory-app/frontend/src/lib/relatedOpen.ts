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
