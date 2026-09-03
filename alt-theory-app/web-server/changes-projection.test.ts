import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  groupChanges,
  mergeSessionChanges,
  projectChangesFromEntries,
  type ChangeRoot,
} from "./session-store.js";

function workspaceRoot(path: string): ChangeRoot[] {
  return [{ path, reason: "cwd", contentRoot: "working", folderId: "primary" }];
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

test("family changes merge on the resolved path; the content route address travels instead of the content", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-change-merge-"));
  try {
    const roots = workspaceRoot(root);
    const lead = projectChangesFromEntries([toolCallEntry("write", { path: "notes/draft.md", content: "a\nb" })]).files;
    const child = projectChangesFromEntries([
      toolCallEntry("edit", { path: join(root, "notes/draft.md"), oldText: "a", newText: "c" }),
      toolCallEntry("write", { path: "/tmp/elsewhere/out.txt", content: "x" }),
    ]).files;
    const merged = mergeSessionChanges([{ sessionId: "sa", files: child }, { sessionId: "lead", files: lead }], roots);
    assert.deepEqual(
      merged.map((f) => [f.resolvedPath, f.added, f.removed, f.sessionIds, f.contentRef ?? null]),
      [
        [join(root, "notes/draft.md"), 3, 1, ["sa", "lead"], { root: "working", path: "primary/notes/draft.md" }],
        ["/tmp/elsewhere/out.txt", 1, 0, ["sa"], null],
      ],
    );
    assert.equal("currentContent" in merged[0], false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("changes group by project folder, then by capped containing folder, titled by the deepest common ancestor", () => {
  const home = "/Users/owner";
  const project = join(home, "Research", "climate");
  const second = join(home, "Research", "shared");
  const roots: ChangeRoot[] = [
    { path: project, reason: "cwd", contentRoot: "working", folderId: "primary" },
    { path: second, reason: "additional", contentRoot: "working", folderId: "additional-1" },
  ];
  const file = (resolvedPath: string) => ({
    path: resolvedPath, resolvedPath, displayPath: resolvedPath, added: 1, removed: 0, diff: "+x", sessionIds: ["s"],
  });
  const groups = groupChanges(
    [
      file(join(project, "notes", "lit.md")),
      file(join(project, "notes", "wave3", "log.md")),
      file(join(second, "instruments", "items.csv")),
      file(join(home, "Downloads", "export", "clean.py")),
      file(join(home, "Downloads", "export", "tmp", "exports", "README.md")),
      file(join(home, "Downloads", "export", "tmp", "exports", "deep", "run.log")),
    ],
    roots,
    home,
  );
  assert.deepEqual(
    groups.map((g) => [g.role, g.path, g.title, g.capped, g.files.map((f) => f.displayPath)]),
    [
      // Project groups are never subdivided; the title is the files' common ancestor.
      ["primary", project, join(project, "notes"), false, ["lit.md", "wave3/log.md"]],
      ["additional", second, join(second, "instruments"), false, ["items.csv"]],
      // Two levels below home keeps its own group; four and five levels collapse
      // onto the level-3 ancestor and are titled by their own common ancestor.
      ["outside", join(home, "Downloads", "export"), join(home, "Downloads", "export"), false, ["clean.py"]],
      ["outside", join(home, "Downloads", "export", "tmp"), join(home, "Downloads", "export", "tmp", "exports"), true, ["README.md", "deep/run.log"]],
    ],
  );
});
