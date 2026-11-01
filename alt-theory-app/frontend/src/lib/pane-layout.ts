import type { Column } from "./attention";

export const LEFT_PANE = { key: "alt-theory-left-width", initial: 256, min: 200, max: 416, collapsed: 52 } as const;
export const RIGHT_PANE = { key: "alt-theory-right-width", initial: 480, min: 320, max: 1200, collapsed: 48 } as const;
export const CENTER_MIN = 400;
export const LEFT_COLLAPSE_AT = 800;
const RESTORE_MARGIN = 24;
export type LayoutSurface = "app" | "settings" | "review" | "files";
export type PaneSide = "left" | "right";

export interface PaneLayoutState {
  width: number;
  surface: LayoutSurface;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  savedLeftCollapsed: boolean;
  yielding: boolean;
  single: Column | null;
  halfPending: boolean;
}

export type LayoutAction =
  | { type: "frame"; width?: number; surface: LayoutSurface; rightOpen: boolean; attention: Column }
  | { type: "show"; column: Column }
  | { type: "left"; collapsed: boolean }
  | { type: "width"; side: PaneSide; width: number }
  | { type: "right-size"; size: "half" | number };

export function boundedWidth(side: PaneSide, width: number): number {
  const pane = side === "left" ? LEFT_PANE : RIGHT_PANE;
  return Number.isFinite(width) ? Math.min(pane.max, Math.max(pane.min, width)) : pane.initial;
}

export function initialLayout(leftWidth: number, rightWidth: number, leftCollapsed: boolean): PaneLayoutState {
  return { width: 0, surface: "app", rightOpen: false, leftWidth: boundedWidth("left", leftWidth),
    rightWidth: boundedWidth("right", rightWidth), leftCollapsed, savedLeftCollapsed: leftCollapsed,
    yielding: false, single: null, halfPending: false };
}

function railWidth(state: PaneLayoutState): number {
  return state.surface === "app" ? RIGHT_PANE.collapsed : 0;
}

function minimumWidth(state: PaneLayoutState): number {
  return (state.leftCollapsed ? LEFT_PANE.collapsed : LEFT_PANE.min) + CENTER_MIN
    + railWidth(state) + (state.surface === "app" && state.rightOpen ? RIGHT_PANE.min : 0);
}

function settle(state: PaneLayoutState, selected?: Column, recent: Column = "center"): PaneLayoutState {
  if (state.width <= 0) return selected ? { ...state, single: selected } : state;
  if (state.surface === "review") return { ...state, single: null };
  const minimum = minimumWidth(state);
  const restore = state.single ? RESTORE_MARGIN : 0;
  let single: Column | null = state.width < minimum + restore
    ? selected ?? state.single ?? recent : null;
  if (single === "right" && (state.surface !== "app" || !state.rightOpen)) single = "center";
  if (single === "left" && state.leftCollapsed) single = "center";
  let next = { ...state, single };
  if (state.halfPending && state.surface === "app") {
    const left = state.leftCollapsed ? LEFT_PANE.collapsed : Math.min(state.leftWidth,
      Math.max(LEFT_PANE.min, state.width - CENTER_MIN - RIGHT_PANE.min - RIGHT_PANE.collapsed));
    next = { ...next, rightWidth: boundedWidth("right", (state.width - left - RIGHT_PANE.collapsed) / 2), halfPending: false };
  }
  return next;
}

export function reduceLayout(state: PaneLayoutState, action: LayoutAction): PaneLayoutState {
  switch (action.type) {
    case "frame": {
      const width = action.width === undefined ? state.width : action.width;
      if (!Number.isFinite(width) || width <= 0) return state;
      let next = { ...state, width, surface: action.surface, rightOpen: action.rightOpen };
      const yielding = action.surface !== "review" && (width < LEFT_COLLAPSE_AT
        || width < LEFT_PANE.min + CENTER_MIN + railWidth(next)
          + (action.surface === "app" && action.rightOpen ? RIGHT_PANE.min : 0));
      if (yielding !== state.yielding) {
        next.leftCollapsed = yielding ? true : state.savedLeftCollapsed;
      }
      next.yielding = yielding;
      return settle(next, undefined, action.attention);
    }
    case "show": {
      let next = state;
      if (action.column === "left") next = { ...state, leftCollapsed: false };
      if (action.column === "right") next = { ...next, rightOpen: true };
      if (action.column !== "left" && (state.single || (state.width > 0 && minimumWidth(next) > state.width))) {
        next = { ...next, leftCollapsed: true };
      }
      return settle(next, action.column);
    }
    case "left":
      return settle({ ...state, leftCollapsed: action.collapsed, savedLeftCollapsed: action.collapsed },
        action.collapsed ? "center" : "left");
    case "width":
      return settle({ ...state, [action.side === "left" ? "leftWidth" : "rightWidth"]: boundedWidth(action.side, action.width),
        halfPending: action.side === "right" ? false : state.halfPending });
    case "right-size":
      return settle({ ...state, halfPending: action.size === "half",
        rightWidth: action.size === "half" ? state.rightWidth : boundedWidth("right", action.size) });
  }
}

export function paneGeometry(state: PaneLayoutState) {
  const width = state.width;
  const rail = Math.min(railWidth(state), width);
  if (state.surface === "review") {
    return { left: 0, right: 0, center: width, rail: 0, leftCollapsed: true, leftMax: 0, rightMax: 0 };
  }
  if (state.single) {
    const left = state.single === "left" ? Math.max(0, width - rail) : Math.min(LEFT_PANE.collapsed, Math.max(0, width - rail));
    const work = Math.max(0, width - left - rail);
    return { left, right: state.single === "right" ? work : 0,
      center: state.single === "center" ? work : 0, rail, leftCollapsed: state.single !== "left", leftMax: 0, rightMax: 0 };
  }
  const rightMinimum = state.surface === "app" && state.rightOpen ? RIGHT_PANE.min : 0;
  const leftLimit = Math.max(LEFT_PANE.min, width - CENTER_MIN - rail - rightMinimum);
  const left = state.leftCollapsed ? LEFT_PANE.collapsed : Math.min(state.leftWidth, leftLimit);
  const rightLimit = Math.max(0, width - left - rail - CENTER_MIN);
  const right = rightMinimum ? Math.min(state.rightWidth, rightLimit) : 0;
  return { left, right, rail, center: Math.max(0, width - left - rail - right), leftCollapsed: state.leftCollapsed,
    leftMax: Math.max(LEFT_PANE.min, Math.min(LEFT_PANE.max, width - CENTER_MIN - rail - right)),
    rightMax: Math.min(RIGHT_PANE.max, rightLimit) };
}
