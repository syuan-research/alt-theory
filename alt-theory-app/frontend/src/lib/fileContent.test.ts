import assert from "node:assert/strict";
import { test } from "node:test";
import { isEditable, previewModes } from "./fileContent.ts";

test("the viewer control follows the file type: .md/.html get rendered + source, code gets the file only, diff first when there is one", () => {
  assert.deepEqual(previewModes("notes/lit.md", { hasDiff: true }), ["diff", "rendered", "source"]);
  assert.deepEqual(previewModes("report/figures.html", { hasDiff: true }), ["diff", "rendered", "source"]);
  assert.deepEqual(previewModes("src/coding_scheme.ts", { hasDiff: true }), ["diff", "source"]);
  assert.deepEqual(previewModes("data/items.csv"), ["source"]);
  // Outside every root there is no current file to show: the diff stands alone.
  assert.deepEqual(previewModes("/tmp/x/run.log", { hasDiff: true, hasFile: false }), ["diff"]);
  assert.deepEqual(previewModes("records/notes.md", { editable: true }), ["rendered", "source", "edit"]);
});

test("only records and the managed workspace are editable through the write route", () => {
  assert.equal(isEditable({ root: "records", path: "a.md" }), true);
  assert.equal(isEditable({ root: "workspace", path: "a.md" }), true);
  assert.equal(isEditable({ root: "working", path: "primary/a.md" }), false);
  assert.equal(isEditable(null), false);
});
