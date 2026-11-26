import assert from "node:assert/strict";
import test from "node:test";
import { anchorAt, locate, railMarksOf, type TextMark } from "./marks.ts";

test("anchorAt trims whitespace and keeps context on both sides", () => {
  const text = "\n第一次贴着原话，第二次找关系。\n";
  assert.equal(anchorAt(text, 0, 1), null);
  const anchor = anchorAt(text, 0, 7)!;
  assert.equal(anchor.quote, "第一次贴着原");
  assert.equal(anchor.prefix, "\n");
  assert.equal(anchor.suffix.startsWith("话"), true);
});

test("locate picks the occurrence whose context matches", () => {
  const text = "理论在前。扎根理论不是先有理论再找证据。理论饱和。";
  for (const start of [0, 7, 12, 21]) {
    const anchor = anchorAt(text, start, start + 2)!;
    assert.deepEqual(locate(text, anchor), [start, start + 2]);
  }
  // The row text changed around the quote: still found, best match wins.
  const anchor = anchorAt(text, 12, 14)!;
  assert.deepEqual(locate("前言。" + text, anchor), [15, 17]);
  assert.equal(locate("没有", anchor), null);
});

test("rail marks: a reply's bookmark and marks land on its turn", () => {
  const turns = [{ rowId: "u1:0", replies: ["a1:0", "a1:1"] }, { rowId: "u2:0", replies: ["a2:0"] }];
  const mark = (row: string, kind: TextMark["kind"]) => ({ row, kind, quote: "q", prefix: "", suffix: "" });
  const rail = railMarksOf(turns, ["a1:1"], [mark("a1:0#thinking", "hl-5"), mark("a1:0", "hl-1"), mark("a1:1", "hl-5"), mark("u2:0", "under"), mark("gone:0", "hl-2")]);
  assert.deepEqual(rail.get("u1:0"), { bookmark: true, colors: ["var(--hl-5)", "var(--hl-1)"] });
  assert.deepEqual(rail.get("u2:0"), { bookmark: false, colors: ["var(--text-3)"] });
  assert.equal(rail.size, 2);
});
