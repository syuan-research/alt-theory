import { useCallback, useLayoutEffect, useReducer, useRef } from "react";
import { boundedLeft, initialLayout, LEFT_PANE, paneGeometry, reduceLayout,
  type LayoutSurface } from "./pane-layout";

const LEFT_COLLAPSED_KEY = "alt-theory-left-collapsed";

function read(key: string): number | null {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? null : Number(stored);
  } catch {
    return null;
  }
}

function save(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* device preference */ }
}

export function usePaneLayout(surface: LayoutSurface, rightOpen: boolean) {
  const [state, dispatch] = useReducer(reduceLayout, undefined, () => initialLayout(
    boundedLeft(read(LEFT_PANE.key) ?? LEFT_PANE.initial),
    read(LEFT_COLLAPSED_KEY) === 1,
  ));
  const current = useRef(state);
  current.current = state;
  const frame = useRef({ surface, rightOpen });
  frame.current = { surface, rightOpen };

  const measure = useCallback((width?: number) => dispatch({ type: "frame", ...frame.current, width }), []);
  useLayoutEffect(() => { measure(); }, [surface, rightOpen, measure]);

  const setLeftCollapsed = useCallback((collapsed: boolean) => {
    const action = { type: "left", collapsed } as const;
    // Opening or closing the float is not a preference; only a docked change is saved.
    const changed = reduceLayout(current.current, action).leftCollapsed !== current.current.leftCollapsed;
    dispatch(action);
    if (changed) save(LEFT_COLLAPSED_KEY, collapsed ? "1" : null);
  }, []);

  /** Pixel request from a drag or key: the left width (saved) or the right share (session only). */
  const setWidth = useCallback((side: "left" | "right", px: number, persist = false) => {
    const geometry = paneGeometry(current.current);
    if (!Number.isFinite(px) || current.current.width <= 0 || geometry.rightFull) return;
    if (side === "left") {
      if (geometry.leftMini || geometry.leftMax < LEFT_PANE.min) return;
      const width = Math.min(geometry.leftMax, Math.max(LEFT_PANE.min, px));
      dispatch({ type: "left-width", width });
      if (persist) save(LEFT_PANE.key, String(width));
      return;
    }
    if (geometry.rightMax < geometry.rightMin || geometry.work <= 0) return;
    const share = Math.min(geometry.rightMax, Math.max(geometry.rightMin, px)) / geometry.work;
    dispatch({ type: "right-share", share });
  }, []);

  const commitWidth = useCallback((side: "left" | "right") => {
    if (side === "left") save(LEFT_PANE.key, String(current.current.leftWidth));
  }, []);

  const setRightFull = useCallback((on: boolean) => dispatch({ type: "right-full", on }), []);
  const showCenter = useCallback(() => dispatch({ type: "center" }), []);

  return { state, geometry: paneGeometry(state), measure, setLeftCollapsed, setWidth, commitWidth, setRightFull, showCenter };
}
