import assert from "node:assert/strict";
import { test } from "node:test";
import {
  shouldAutoOpenRelated,
  shouldClearRelatedOnSubChange,
} from "./relatedOpen.ts";

test("leaving related sub clears sticky activeRelatedSessionId path", () => {
  assert.equal(
    shouldClearRelatedOnSubChange("related:child-a", null),
    true,
  );
  assert.equal(
    shouldClearRelatedOnSubChange("related:child-a", "related:child-b"),
    false,
  );
  assert.equal(shouldClearRelatedOnSubChange(null, "related:child-a"), false);
  assert.equal(shouldClearRelatedOnSubChange(null, null), false);
  assert.equal(shouldClearRelatedOnSubChange("changes:foo", null), false);
});

test("a spawned subagent only claims an empty rail; btw/helper always open", () => {
  assert.equal(shouldAutoOpenRelated("subagent", null), true);
  assert.equal(shouldAutoOpenRelated("subagent", "child-a"), false);
  assert.equal(shouldAutoOpenRelated("side", "child-a"), true);
  assert.equal(shouldAutoOpenRelated("helper", "child-a"), true);
});
