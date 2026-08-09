import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFileTreeModel } from "./fileTree.ts";

test("file tree groups folders first and resolves Windows full paths", () => {
  const model = buildFileTreeModel(
    [{ path: "notes/z.md" }, { path: "a.md" }, { path: "notes/a.md" }],
    "D:\\research\\project",
  );

  assert.deepEqual(model.nodes.get(model.rootId)?.children, ["node:notes", "node:a.md"]);
  assert.deepEqual(model.nodes.get("node:notes")?.children, [
    "node:notes/a.md",
    "node:notes/z.md",
  ]);
  assert.equal(
    model.nodes.get("node:notes/a.md")?.fullPath,
    "D:\\research\\project\\notes\\a.md",
  );
  assert.deepEqual(model.folderIds, ["node:notes"]);
});

test("file tree keeps relative paths when no absolute base is available", () => {
  const model = buildFileTreeModel([{ path: "uploads/reference.pdf" }], "");
  assert.equal(
    model.nodes.get("node:uploads/reference.pdf")?.fullPath,
    "uploads/reference.pdf",
  );
});
