import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { copyMarks, readMarks, writeMarks } from "./session-marks.js";

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
