import assert from "node:assert/strict";
import test from "node:test";
import { AttentionHistory } from "./attention";

test("search and pane entry query the same history with different candidate sets", () => {
  const history = new AttentionHistory();
  history.note("center");
  history.note("right");
  history.note("left");
  assert.equal(history.latest(), "left");
  assert.equal(history.latest(["center", "right"], true), "right");
  // A left conversation row is attributed to the content it opens.
  history.note("center");
  assert.equal(history.latest(), "center");
  assert.equal(history.latest(["center", "right"], true), "center");
});

test("replacing the right target invalidates its layout signal without a second history", () => {
  const history = new AttentionHistory();
  history.note("center");
  history.setScope("right", "file:a");
  history.note("right");
  history.setScope("right", "file:b");
  assert.equal(history.latest(), "right");
  assert.equal(history.latest(["center", "right"], true), "center");
  history.note("right");
  assert.equal(history.latest(["center", "right"], true), "right");
  history.forget("right");
  assert.equal(history.latest(), "center");
});

