import assert from "node:assert/strict";
import test from "node:test";
import { FIND_LIMIT, findSpans, textPatch } from "./find.ts";

test("textPatch is the one minimal edit between two strings", () => {
  const apply = (prev: string, next: string) => {
    const [start, removed, inserted] = textPatch(prev, next);
    return prev.slice(0, start) + inserted + prev.slice(start + removed);
  };
  const cases: [string, string][] = [
    ["hello world", "hello brave world"],
    ["hello world", "hello"],
    ["aaa", "aaaa"],
    ["", "x"],
    ["x", ""],
    ["same", "same"],
    ["中文 hello", "中文 hi hello"],
  ];
  for (const [prev, next] of cases) assert.equal(apply(prev, next), next);
  // Typing one char in the middle touches only that char.
  assert.deepEqual(textPatch("abcdef", "abcXdef"), [3, 0, "X"]);
});

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

test("find stops at the limit, in document order", () => {
  const text = "e".repeat(200_000);
  const spans = findSpans([text], "e", FIND_LIMIT + 1);
  assert.equal(spans.length, FIND_LIMIT + 1);
  assert.deepEqual(spans[0], [0, 0, 0, 1]);
  assert.deepEqual(spans[FIND_LIMIT], [0, FIND_LIMIT, 0, FIND_LIMIT + 1]);
});
