import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldClearRelatedOnSubChange } from "./relatedOpen.ts";

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
