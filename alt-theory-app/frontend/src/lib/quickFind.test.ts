import assert from "node:assert/strict";
import test from "node:test";
import { quickFindScore, quickFindTerms } from "../../../shared/quick-find.ts";

test("Quick Find matches unordered words, Chinese, and either path separator", () => {
  const fields = [{ text: "项目/采访/田野笔记.md", weight: 10 }];
  assert.ok(quickFindScore(quickFindTerms("笔记 项目"), fields));
  assert.ok(quickFindScore(quickFindTerms("项目\\采访"), fields));
  assert.ok(quickFindScore(quickFindTerms("D:\\archive\\项目\\采访\\田野笔记.md"), fields));
  assert.equal(quickFindScore(quickFindTerms("笔记 财务"), fields), 0);
});

test("a pasted absolute path finds its file even when quoted or spaced", () => {
  const fields = [{ text: "ch2.md", weight: 10 }, { text: "thesis/ch2.md", weight: 3 }];
  for (const query of [
    '"D:\\research\\thesis\\ch2.md"', // Explorer "Copy as path"
    "C:\\Users\\Ann\\OneDrive - Uni\\thesis\\ch2.md",
    "/Users/ann/My Notes/ch2.md",
    "\\\\server\\share\\ch2.md",
  ]) {
    assert.deepEqual(quickFindTerms(query), ["ch2.md"], query);
    assert.ok(quickFindScore(quickFindTerms(query), fields), query);
  }
  assert.deepEqual(quickFindTerms('"interview notes"'), ["interview", "notes"]);
});

test("a filename outranks the same term only in a directory", () => {
  const terms = quickFindTerms("notes");
  const file = quickFindScore(terms, [
    { text: "notes", weight: 10 }, { text: "archive/notes", weight: 3 },
  ]);
  const directory = quickFindScore(terms, [
    { text: "draft.md", weight: 10 }, { text: "notes/draft.md", weight: 3 },
  ]);
  assert.ok(file > directory);
});
