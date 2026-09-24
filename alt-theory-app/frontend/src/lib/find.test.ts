import assert from "node:assert/strict";
import test from "node:test";
import { findSpans } from "./find.ts";

test("find matches case-insensitively across formatting splits, never across blocks", () => {
  // "Alt" + <em>"Theo"</em> + "ry" in one paragraph, then a block break.
  const segments = ["\n", "Alt ", "Theo", "ry says", "\n", "theory"];
  assert.deepEqual(findSpans(segments, "theory"), [
    [2, 0, 3, 2],
    [5, 0, 5, 6],
  ]);
  assert.deepEqual(findSpans(segments, "saystheory"), []);
  assert.deepEqual(findSpans(segments, ""), []);
});

test("find counts non-overlapping occurrences and keeps offsets when case folding changes length", () => {
  assert.equal(findSpans(["aaaa"], "aa").length, 2);
  // "İ".toLowerCase() is two code units; offsets after it must not drift.
  assert.deepEqual(findSpans(["İx 中文"], "中文"), [[0, 3, 0, 5]]);
});
