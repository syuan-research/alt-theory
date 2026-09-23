import assert from "node:assert/strict";
import { test } from "node:test";
import { isEditable, previewModes } from "./fileContent.ts";

test("the viewer control opens renderable changes with rendered first and keeps diff for other changes", () => {
  assert.deepEqual(previewModes("notes/lit.md", { hasDiff: true, editable: true }), ["rendered", "diff", "source", "edit"]);
  assert.deepEqual(previewModes("report/figures.html", { hasDiff: true }), ["rendered", "diff", "source"]);
  assert.deepEqual(previewModes("src/coding_scheme.ts", { hasDiff: true }), ["diff", "source"]);
  assert.deepEqual(previewModes("data/items.csv"), ["source"]);
  // Outside every root there is no current file to show: the diff stands alone.
  assert.deepEqual(previewModes("/tmp/x/run.log", { hasDiff: true, hasFile: false }), ["diff"]);
  assert.deepEqual(previewModes("records/notes.md", { editable: true }), ["rendered", "source", "edit"]);
});

test("every root is editable through the write route (owner ruling 2026-09-15)", () => {
  assert.equal(isEditable({ root: "records", path: "a.md" }), true);
  assert.equal(isEditable({ root: "workspace", path: "a.md" }), true);
  assert.equal(isEditable({ root: "working", path: "primary/a.md" }), true);
  assert.equal(isEditable(null), false);
});
