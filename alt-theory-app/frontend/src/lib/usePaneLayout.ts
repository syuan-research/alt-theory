import { useCallback, useLayoutEffect, useReducer, useRef } from "react";
import { attention, type Column } from "./attention";
import { boundedWidth, initialLayout, LEFT_PANE, RIGHT_PANE, paneGeometry, reduceLayout,
  type LayoutSurface, type PaneSide } from "./pane-layout";

const LEFT_COLLAPSED_KEY = "alt-theory-left-collapsed";

function readWidth(side: PaneSide): number {
  const pane = side === "left" ? LEFT_PANE : RIGHT_PANE;
  try {
    const stored = localStorage.getItem(pane.key);
    return stored === null ? pane.initial : boundedWidth(side, Number(stored));
  } catch {
    return pane.initial;
  }
}

function readCollapsed(): boolean {
  try { return localStorage.getItem(LEFT_COLLAPSED_KEY) === "1"; } catch { return false; }
}

function saveWidth(side: PaneSide, width: number): void {
  try { localStorage.setItem(side === "left" ? LEFT_PANE.key : RIGHT_PANE.key, String(width)); } catch { /* device preference */ }
}

export function usePaneLayout(surface: LayoutSurface, rightOpen: boolean, rightScope: string | null) {
  const [state, dispatch] = useReducer(reduceLayout, undefined, () =>
    initialLayout(readWidth("left"), readWidth("right"), readCollapsed()));
  const current = useRef(state);
  current.current = state;
  const frame = useRef({ surface, rightOpen });
  frame.current = { surface, rightOpen };

  const measure = useCallback((width?: number) => {
    dispatch({ type: "frame", ...frame.current, width,
      attention: attention.latest(["center", "right"], true) ?? "center" });
  }, []);

  useLayoutEffect(() => {
    attention.setScope("right", rightScope);
    if (rightScope === null) attention.forget("right");
    measure();
  }, [rightScope, surface, rightOpen, measure]);

  const show = useCallback((column: Column) => dispatch({ type: "show", column }), []);
  const setLeftCollapsed = useCallback((collapsed: boolean) => {
    if (current.current.single) {
      dispatch({ type: "show", column: collapsed ? "center" : "left" });
      return;
    }
    dispatch({ type: "left", collapsed });
    try {
      if (collapsed) localStorage.setItem(LEFT_COLLAPSED_KEY, "1");
      else localStorage.removeItem(LEFT_COLLAPSED_KEY);
    } catch { /* device preference */ }
  }, []);

  const setWidth = useCallback((side: PaneSide, width: number, persist = false) => {
    const before = current.current;
    if (before.single || !Number.isFinite(width) || before.width <= 0) return;
    const geometry = paneGeometry(before);
    const pane = side === "left" ? LEFT_PANE : RIGHT_PANE;
    const max = side === "left" ? geometry.leftMax : geometry.rightMax;
    if (max < pane.min) return;
    const next = Math.min(max, Math.max(pane.min, width));
    if (next === (side === "left" ? geometry.left : geometry.right)) return;
    dispatch({ type: "width", side, width: next });
    if (persist) saveWidth(side, next);
  }, []);

  const commitWidth = useCallback((side: PaneSide) => {
    const value = current.current;
    saveWidth(side, side === "left" ? value.leftWidth : value.rightWidth);
  }, []);
  const openSize = useCallback((size: "half" | "default") => {
    dispatch({ type: "right-size", size: size === "half" ? "half" : readWidth("right") });
  }, []);

  return { state, geometry: paneGeometry(state), measure, show, setLeftCollapsed, setWidth, commitWidth, openSize };
}
