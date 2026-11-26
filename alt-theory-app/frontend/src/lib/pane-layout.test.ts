import assert from "node:assert/strict";
import test from "node:test";
import { initialLayout, paneGeometry, reduceLayout, type PaneLayoutState } from "./pane-layout";

const frame = (state: PaneLayoutState, width: number, rightOpen = true, surface: "app" | "settings" | "review" = "app") =>
  reduceLayout(state, { type: "frame", width, rightOpen, surface });
const start = (width = 1280, rightOpen = true) => frame(initialLayout(256, false), width, rightOpen);

test("center and right shrink together as one share of the work area", () => {
  const wide = paneGeometry(start(1280));
  assert.equal(wide.left + wide.center + wide.right + wide.rail, 1280);
  assert.equal(wide.right, Math.round(0.4 * (1280 - 256 - 44)));
  const narrow = paneGeometry(start(1100));
  assert.equal(narrow.right, Math.round(0.4 * narrow.work));
  assert.equal(narrow.left, 256);
});

test("the right pane never moves the left column", () => {
  for (const width of [900, 760, 600]) {
    const closed = paneGeometry(start(width, false));
    const open = paneGeometry(start(width, true));
    assert.equal(open.left, closed.left, `at ${width}`);
  }
});

test("center+right under 700 docks the left as its strip and expanding floats it; leaving needs 724", () => {
  // 256 left + 44 rail: the strip starts below a 1000 window and ends at 1024.
  assert.equal(paneGeometry(start(1000)).left, 256);
  let state = start(999);
  assert.equal(paneGeometry(state).left, 48);
  state = reduceLayout(state, { type: "left", collapsed: false });
  assert.equal(state.leftCollapsed, false);
  assert.equal(paneGeometry(state).leftFloat, true);
  assert.equal(paneGeometry(state).left, 48);
  state = frame(state, 1016);
  assert.equal(paneGeometry(state).left, 48, "hysteresis keeps the strip");
  state = frame(state, 1024);
  assert.equal(paneGeometry(state).left, 256);
  assert.equal(state.leftFloat, false);
});

test("a manual collapse is a preference; the float is not", () => {
  let state = start(1280);
  state = reduceLayout(state, { type: "left", collapsed: true });
  assert.equal(state.leftCollapsed, true);
  state = frame(state, 700);
  state = reduceLayout(state, { type: "left", collapsed: false });
  assert.equal(state.leftCollapsed, true);
  assert.equal(paneGeometry(state).leftFloat, true);
  state = reduceLayout(state, { type: "left", collapsed: true });
  assert.equal(paneGeometry(state).leftFloat, false);
});

test("right full hides the center, docks the left strip, and ends when the pane closes or the center changes", () => {
  let state = reduceLayout(start(1280), { type: "right-full", on: true });
  const full = paneGeometry(state);
  assert.deepEqual([full.left, full.center, full.right], [48, 0, 1280 - 48 - 44]);
  state = reduceLayout(state, { type: "left", collapsed: false });
  assert.equal(paneGeometry(state).leftFloat, true);
  assert.equal(reduceLayout(state, { type: "center" }).rightFull, false);
  assert.equal(frame(state, 1280, false).rightFull, false);
});

test("review is full width; settings has no right pane", () => {
  const review = paneGeometry(frame(start(), 1000, true, "review"));
  assert.deepEqual([review.left, review.center, review.right], [0, 1000, 0]);
  const settings = paneGeometry(frame(start(), 1000, true, "settings"));
  assert.deepEqual([settings.left, settings.right, settings.rail], [256, 0, 0]);
  assert.equal(paneGeometry(frame(start(), 999, true, "app")).left, 48, "the rail counts in the app");
});

test("an invalid measurement leaves the state alone", () => {
  const state = start();
  assert.equal(frame(state, 0), state);
});
