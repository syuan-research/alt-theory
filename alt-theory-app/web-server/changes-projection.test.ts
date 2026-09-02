import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Root } from "../core/root-policy.js";
import {
  projectChangesFromEntries,
  readCurrentChangedFile,
} from "./session-store.js";

function workspaceRoot(path: string): Root[] {
  return [{ path, reason: "cwd" }];
}

function toolCallEntry(name: string, args: unknown, id?: string) {
  return { message: { content: [{ type: "toolCall", id, name, arguments: args }] } };
}

function toolResultEntry(toolCallId: string, isError: boolean) {
  return { message: { role: "toolResult", toolCallId, isError } };
}

test("write tool counts content lines as additions", () => {
  const { files } = projectChangesFromEntries([
    toolCallEntry("write", { path: "notes/a.md", content: "line1\nline2\nline3" }),
  ]);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, "notes/a.md");
  assert.equal(files[0].added, 3);
  assert.equal(files[0].removed, 0);
});

test("edit tool counts old/new lines and aggregates per path", () => {
  const { files } = projectChangesFromEntries([
    toolCallEntry("edit", {
      path: "notes/a.md",
      edits: [{ oldText: "old", newText: "new1\nnew2" }],
    }),
    toolCallEntry("edit", {
      path: "notes/a.md",
      edits: [{ oldText: "x\ny", newText: "z" }],
    }),
  ]);
  assert.equal(files.length, 1);
  assert.equal(files[0].added, 2 + 1);
  assert.equal(files[0].removed, 1 + 2);
});

test("non-file-mutating tool calls are ignored", () => {
  const { files } = projectChangesFromEntries([
    toolCallEntry("grep", { pattern: "foo" }),
    toolCallEntry("bash", { command: "ls" }),
  ]);
  assert.equal(files.length, 0);
});

test("most-recently-touched file comes first", () => {
  const { files } = projectChangesFromEntries([
    toolCallEntry("write", { path: "first.md", content: "a" }),
    toolCallEntry("write", { path: "second.md", content: "b" }),
  ]);
  assert.deepEqual(
    files.map((f) => f.path),
    ["second.md", "first.md"]
  );
});

test("failed or pending writes are not reported as file changes", () => {
  const { files } = projectChangesFromEntries([
    toolCallEntry("write", { path: "failed.md", content: "no" }, "failed"),
    toolResultEntry("failed", true),
    toolCallEntry("write", { path: "pending.md", content: "not yet" }, "pending"),
    toolCallEntry("write", { path: "done.md", content: "yes" }, "done"),
    toolResultEntry("done", false),
  ]);
  assert.deepEqual(files.map((file) => file.path), ["done.md"]);
});

test("current changed-file preview reads the latest safe workspace text", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-change-preview-"));
  const notes = join(root, "notes");
  mkdirSync(notes);
  writeFileSync(join(notes, "draft.md"), "# Current\n\nlatest text", "utf-8");
  writeFileSync(join(root, "binary.md"), Buffer.from([0, 1, 2]));

  try {
    const current = readCurrentChangedFile(workspaceRoot(root), "notes/draft.md");
    assert.equal(current.currentContent, "# Current\n\nlatest text");
    assert.ok(current.currentUpdatedAt);
    assert.deepEqual(readCurrentChangedFile(workspaceRoot(root), "../outside.md"), {});
    assert.deepEqual(readCurrentChangedFile(workspaceRoot(root), "binary.md"), {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
