/**
 * Outer pane geometry (Owner 2026-11-01). One owner for every outer width:
 * - The right pane is a share of the center+right work area, so the two
 *   shrink together as the window narrows; switching what the right pane
 *   shows never changes its width.
 * - When center+right (measured with the left docked open) would be under
 *   WORK_FLOAT_AT, the left column docks as its icon strip and opens as a
 *   float over the work area. The right pane never moves the left column.
 * - The right share is not saved: every start opens at 40%; a drag lasts
 *   until the app restarts.
 * - "Right full": the right pane takes the work area, the center is hidden
 *   (still mounted) and the left column docks as its strip.
 */
export const LEFT_PANE = { key: "alt-theory-left-width", initial: 256, min: 200, max: 416, collapsed: 52 } as const;
export const RIGHT_PANE = { initial: 0.4, min: 240, max: 1200, collapsed: 48 } as const;
/** Drag floor for the center; window-driven squeezing may go below it. */
export const CENTER_MIN = 320;
export const WORK_FLOAT_AT = 700;
/** Leave the narrow phase only this far above the threshold. */
const NARROW_HYSTERESIS = 24;
const SHARE_MIN = 0.1;
const SHARE_MAX = 0.9;
export type LayoutSurface = "app" | "settings" | "review" | "files";

export interface PaneLayoutState {
  width: number;
  surface: LayoutSurface;
  rightOpen: boolean;
  /** Left px (saved), right share of the work area (session only). */
  leftWidth: number;
  rightShare: number;
  leftCollapsed: boolean;
  narrow: boolean;
  leftFloat: boolean;
  rightFull: boolean;
}

export type LayoutAction =
  | { type: "frame"; width?: number; surface: LayoutSurface; rightOpen: boolean }
  | { type: "left"; collapsed: boolean }
  | { type: "left-width"; width: number }
  | { type: "right-share"; share: number }
  | { type: "right-full"; on: boolean }
  /** What the center shows changed: drop the left float and right full. */
  | { type: "center" };

export function boundedLeft(width: number): number {
  return Number.isFinite(width) ? Math.min(LEFT_PANE.max, Math.max(LEFT_PANE.min, width)) : LEFT_PANE.initial;
}

export function boundedShare(share: number): number {
  return Number.isFinite(share) ? Math.min(SHARE_MAX, Math.max(SHARE_MIN, share)) : RIGHT_PANE.initial;
}

export function initialLayout(leftWidth: number, leftCollapsed: boolean): PaneLayoutState {
  return { width: 0, surface: "app", rightOpen: false, leftWidth: boundedLeft(leftWidth),
    rightShare: RIGHT_PANE.initial, leftCollapsed, narrow: false, leftFloat: false, rightFull: false };
}

const fullActive = (s: PaneLayoutState) => s.rightFull && s.rightOpen && s.surface === "app";
/** The left column docks as its strip; expanding it then floats. */
const leftDocksMini = (s: PaneLayoutState) => s.narrow || fullActive(s);

export function reduceLayout(state: PaneLayoutState, action: LayoutAction): PaneLayoutState {
  switch (action.type) {
    case "frame": {
      const width = action.width ?? state.width;
      if (!Number.isFinite(width) || width <= 0) return state;
      const rail = action.surface === "app" ? RIGHT_PANE.collapsed : 0;
      const work = width - state.leftWidth - rail;
      const narrow = state.narrow ? work < WORK_FLOAT_AT + NARROW_HYSTERESIS : work < WORK_FLOAT_AT;
      const next = { ...state, width, narrow, surface: action.surface, rightOpen: action.rightOpen };
      if (!action.rightOpen) next.rightFull = false;
      if (!leftDocksMini(next)) next.leftFloat = false;
      return next;
    }
    case "left":
      if (!action.collapsed && leftDocksMini(state)) return { ...state, leftFloat: true };
      if (action.collapsed && state.leftFloat) return { ...state, leftFloat: false };
      return { ...state, leftCollapsed: action.collapsed };
    case "left-width":
      return { ...state, leftWidth: boundedLeft(action.width) };
    case "right-share":
      return { ...state, rightShare: boundedShare(action.share) };
    case "right-full":
      return { ...state, rightFull: action.on, leftFloat: false };
    case "center":
      return state.leftFloat || state.rightFull ? { ...state, leftFloat: false, rightFull: false } : state;
  }
}

export function paneGeometry(state: PaneLayoutState) {
  const width = state.width;
  if (state.surface === "review") {
    return { left: 0, center: width, right: 0, rail: 0, leftMini: true, leftFloat: false, rightFull: false,
      work: width, leftMax: 0, rightMin: 0, rightMax: 0 };
  }
  const rail = state.surface === "app" ? RIGHT_PANE.collapsed : 0;
  const leftMini = leftDocksMini(state) || state.leftCollapsed;
  const left = leftMini ? LEFT_PANE.collapsed
    : Math.min(state.leftWidth, Math.max(LEFT_PANE.min, width - rail - CENTER_MIN));
  const work = Math.max(0, width - left - rail);
  const rightFull = fullActive(state);
  const open = state.surface === "app" && state.rightOpen;
  const right = !open ? 0 : rightFull ? work : Math.min(RIGHT_PANE.max, Math.round(work * state.rightShare));
  return {
    left, center: work - right, right, rail, leftMini, rightFull,
    leftFloat: state.leftFloat && leftDocksMini(state),
    work,
    // Dragging the left never pushes the work area into the narrow phase.
    leftMax: Math.max(LEFT_PANE.min, Math.min(LEFT_PANE.max, width - rail - WORK_FLOAT_AT)),
    rightMin: RIGHT_PANE.min,
    rightMax: Math.min(RIGHT_PANE.max, work - CENTER_MIN),
  };
}
