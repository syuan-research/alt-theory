import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { copyMarks, readMarks, writeMarks, readBookmarks, writeBookmark } from "./session-marks.js";

test("marks round-trip and drop malformed rows", () => {
  const root = mkdtempSync(join(tmpdir(), "marks-"));
  try {
    const a = join(root, "a");
    assert.deepEqual(readMarks(a), []);
    const good = { row: "e1:0", kind: "hl-2", quote: "核心范畴", prefix: "找能串起", suffix: "。" };
    const saved = writeMarks(a, [good, { ...good, kind: "red" }, { ...good, quote: "" }, null]);
    assert.deepEqual(saved, [good]);
    assert.deepEqual(readMarks(a), [good]);
    assert.throws(() => writeMarks(a, { marks: [] }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("copyMarks carries the file over and is a no-op without one", () => {
  const root = mkdtempSync(join(tmpdir(), "marks-"));
  try {
    const a = join(root, "a");
    const b = join(root, "b");
    writeMarks(b, []);
    copyMarks(a, b); // nothing to copy
    assert.deepEqual(readMarks(b), []);
    const mark = { row: "e1:0", kind: "under", quote: "x", prefix: "", suffix: "" };
    writeMarks(a, [mark]);
    copyMarks(a, b);
    assert.deepEqual(readMarks(b), [mark]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("node bookmarks and reader marks coexist through edits, removal and forks", () => {
  const root = mkdtempSync(join(tmpdir(), "bookmarks-"));
  try {
    const a = join(root, "a");
    const b = join(root, "b");
    assert.deepEqual(readBookmarks(a), []);
    const mark = { row: "e1:0", kind: "under", quote: "x", prefix: "", suffix: "" };
    writeMarks(a, [mark]);
    const first = writeBookmark(a, "e1:0", "")[0];
    writeBookmark(a, "e2:0", "另一个节点");
    const edited = writeBookmark(a, "e1:0", "需要测试模型是否理解了目标").find((item) => item.row === "e1:0")!;
    assert.equal(edited.createdAt, first.createdAt);
    assert.equal(edited.note, "需要测试模型是否理解了目标");
    assert.equal(readBookmarks(a).length, 2);
    assert.deepEqual(readMarks(a), [mark]);
    writeMarks(a, []);
    assert.equal(readBookmarks(a).length, 2);
    writeMarks(b, []);
    copyMarks(a, b);
    assert.deepEqual(readBookmarks(b), readBookmarks(a));
    writeBookmark(a, "e1:0", null);
    assert.deepEqual(readBookmarks(a).map((item) => item.row), ["e2:0"]);
    assert.equal(readBookmarks(b).length, 2);
    assert.throws(() => writeBookmark(a, "", "note"));
    assert.throws(() => writeBookmark(a, "e1:0", undefined));
    assert.throws(() => writeBookmark(a, "e1:0", "x".repeat(20001)));
    const file = join(a, "marks.json");
    writeFileSync(file, "broken json");
    assert.throws(() => writeBookmark(a, "e1:0", "note"));
    assert.throws(() => writeMarks(a, []));
    assert.equal(readFileSync(file, "utf8"), "broken json");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
