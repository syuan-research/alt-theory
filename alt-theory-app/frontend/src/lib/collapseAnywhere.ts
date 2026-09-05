/** Click-anywhere collapse: ignore a drag that looks like text selection. */
export const COLLAPSE_DRAG_THRESHOLD_PX = 4;

export function shouldToggleCollapseOnClick(input: {
  selectionCollapsed: boolean;
  down: { x: number; y: number } | null;
  up: { x: number; y: number };
  thresholdPx?: number;
}): boolean {
  if (!input.selectionCollapsed || !input.down) return false;
  const threshold = input.thresholdPx ?? COLLAPSE_DRAG_THRESHOLD_PX;
  const dx = input.up.x - input.down.x;
  const dy = input.up.y - input.down.y;
  return dx * dx + dy * dy <= threshold * threshold;
}
