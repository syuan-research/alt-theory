import assert from "node:assert/strict";
import test from "node:test";
import { initialLayout, paneGeometry, reduceLayout,
  type PaneLayoutState } from "./pane-layout";
import type { Column } from "./attention";

const initial = () => initialLayout(256, 480, false);
const frame = (state: PaneLayoutState, width: number, rightOpen = true, attention: Column = "center") =>
  reduceLayout(state, { type: "frame", width, rightOpen, surface: "app", attention });

test("an oversized preference stays in the window without overwriting the preference", () => {
  const state = frame(initialLayout(256, 1200, false), 1700);
  const sizes = paneGeometry(state);
  assert.equal(sizes.left + sizes.center + sizes.right + sizes.rail, 1700);
  assert.equal(sizes.center, 400);
  assert.equal(sizes.right, 996);
  assert.equal(state.rightWidth, 1200);
  assert.equal(paneGeometry(frame(state, 2100)).right, 1200);
});

test("left auto-collapse runs on entry, not on every resize below 800", () => {
  let state = frame(initial(), 900, false);
  state = frame(state, 700, false);
  assert.equal(state.leftCollapsed, true);
  state = reduceLayout(state, { type: "left", collapsed: false });
  assert.equal(state.single, null);
  state = frame(state, 710, false);
  assert.equal(state.leftCollapsed, false);
  assert.equal(paneGeometry(state).left, 256);
  state = frame(state, 900, false);
  state = frame(state, 700, false);
  assert.equal(state.leftCollapsed, true);
});

test("C chooses once; later attention does not replace the single pane", () => {
  let state = frame(initial(), 1200);
  state = frame(state, 600, true, "right");
  assert.equal(state.single, "right");
  state = frame(state, 610, true, "center");
  assert.equal(state.single, "right");
  state = frame(state, 1200);
  assert.equal(state.single, null);
  state = frame(state, 600, true, "center");
  assert.equal(state.single, "center");
});

test("half sizing uses the work area once and waits while the app surface is hidden", () => {
  let state = reduceLayout(initial(), { type: "frame", width: 1200, surface: "settings", rightOpen: false, attention: "center" });
  state = reduceLayout(state, { type: "right-size", size: "half" });
  assert.equal(state.halfPending, true);
  const invalid = frame(state, 0);
  assert.equal(invalid, state);
  state = frame(state, 1200);
  assert.equal(state.halfPending, false);
  assert.equal(state.rightWidth, (1200 - 256 - 48) / 2);
  assert.equal(frame(state, 1400).rightWidth, state.rightWidth);
});

