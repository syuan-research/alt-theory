import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLLAPSE_DRAG_THRESHOLD_PX,
  shouldToggleCollapseOnClick,
} from "./collapseAnywhere.ts";

const origin = { x: 10, y: 10 };

test("a still click with a collapsed selection collapses", () => {
  assert.equal(
    shouldToggleCollapseOnClick({
      selectionCollapsed: true,
      down: origin,
      up: origin,
    }),
    true,
  );
});

test("a drag past the threshold does not collapse", () => {
  assert.equal(
    shouldToggleCollapseOnClick({
      selectionCollapsed: true,
      down: origin,
      up: { x: origin.x, y: origin.y + COLLAPSE_DRAG_THRESHOLD_PX + 1 },
    }),
    false,
  );
});

test("a non-collapsed selection does not collapse even without movement", () => {
  assert.equal(
    shouldToggleCollapseOnClick({
      selectionCollapsed: false,
      down: origin,
      up: origin,
    }),
    false,
  );
});
