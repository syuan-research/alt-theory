import assert from "node:assert/strict";
import { test } from "node:test";
import { isEditable, previewModes, selectionHeldIn } from "./fileContent.ts";

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

test("a refresh defers only for a real selection inside the preview body", () => {
  const inside = {} as Node;
  const outside = {} as Node;
  const container = { contains: (node: Node) => node === inside } as HTMLElement;
  const held = (anchor: Node | null, focus: Node | null) => ({
    isCollapsed: false,
    anchorNode: anchor,
    focusNode: focus,
  });
  assert.equal(selectionHeldIn(container, held(inside, inside)), true);
  // Crossing the body edge, or sitting outside it, is not a held read here.
  assert.equal(selectionHeldIn(container, held(inside, outside)), false);
  assert.equal(selectionHeldIn(container, held(outside, outside)), false);
  assert.equal(selectionHeldIn(container, held(null, inside)), false);
  assert.equal(selectionHeldIn(container, held(inside, null)), false);
  // A bare caret (collapsed) or no selection at all never defers.
  assert.equal(selectionHeldIn(container, { isCollapsed: true, anchorNode: inside, focusNode: inside }), false);
  assert.equal(selectionHeldIn(container, null), false);
  assert.equal(selectionHeldIn(null, held(inside, inside)), false);
});
