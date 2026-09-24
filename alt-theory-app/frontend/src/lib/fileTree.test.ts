import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFileTreeModel, getFileTreeNode } from "./fileTree.ts";

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

test("file tree keeps an unloaded directory expandable before it has children", () => {
  const model = buildFileTreeModel(
    [{ path: "large-folder", isDirectory: true }],
    "D:\\research",
  );
  assert.equal(model.nodes.get("node:large-folder")?.isFolder, true);
  assert.deepEqual(model.folderIds, ["node:large-folder"]);
});

test("file tree ignores stale items while replacing filtered results", () => {
  const first = buildFileTreeModel([{ path: "first.md" }], "");
  const second = buildFileTreeModel([{ path: "second.md" }], "");

  assert.equal(getFileTreeNode(first, "node:first.md")?.name, "first.md");
  assert.equal(getFileTreeNode(second, "node:first.md"), null);
});

test("a matched folder in search results holds its matched files", () => {
  const model = buildFileTreeModel([
    { path: "a/b/c/interviews", isDirectory: true },
    { path: "a/b/c/interviews/p01.md" },
    { path: "a/b/c/d/interviews", isDirectory: true },
    { path: "a/b/c/d/interviews/p02.md" },
  ], "/r", true);
  assert.deepEqual(model.nodes.get("node:a/b/c/interviews")?.children, ["node:a/b/c/interviews/p01.md"]);
  assert.equal(model.nodes.get("node:a/b/c/interviews/p01.md")?.name, "p01.md");
  assert.equal(model.nodes.get("node:a/b/c/d/interviews")?.name, "d / interviews");
  assert.deepEqual(model.nodes.get("node:a/b/c/d/interviews")?.children, ["node:a/b/c/d/interviews/p02.md"]);
  assert.deepEqual(model.nodes.get("node:a/b/c")?.children, ["node:a/b/c/interviews", "node:a/b/c/d/interviews"]);
});

test("search tree keeps ranked order and compresses paths after three folders", () => {
  const model = buildFileTreeModel([
    { path: "z/one/two/three/four/best.md" },
    { path: "a/other.md" },
  ], "D:\\research", true);
  assert.deepEqual(model.nodes.get(model.rootId)?.children, ["node:z", "node:a"]);
  const deep = model.nodes.get("node:z/one/two/three/four/best.md");
  assert.equal(deep?.name, "three / four / best.md");
  assert.equal(deep?.fullPath, "D:\\research\\z\\one\\two\\three\\four\\best.md");
});
