import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSessionDirs } from "../core/data-dir.js";
import {
  deleteWorkspaceFile,
  getSessionWorkspaceUsage,
  listWorkspaceFiles,
  missingAttachmentPaths,
  describeWorkingFolders,
  listWorkingFolderChildren,
  readWorkingFolderTextFile,
  searchWorkingFolder,
  SESSION_WORKSPACE_QUOTA_BYTES,
  uploadWorkspaceFile,
} from "./workspace-files.js";

test("uploadWorkspaceFile stores text uploads under uploads/", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-workspace-upload-"));
  const dataDir = join(root, "data");
  const { sessionId } = createSessionDirs(dataDir);
  const result = await uploadWorkspaceFile(
    dataDir,
    sessionId,
    "notes.txt",
    Buffer.from("hello workspace", "utf-8")
  );
  assert.equal(result.extractStatus, "not-needed");
  assert.equal(result.originalPath, "uploads/notes.txt");
  assert.equal(result.entry.stageable, true);
  const listed = listWorkspaceFiles(dataDir, sessionId);
  assert.equal(listed.files.length, 1);
  assert.equal(listed.files[0].path, "uploads/notes.txt");
});

test("uploadWorkspaceFile rejects session quota overflow", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-workspace-quota-"));
  const dataDir = join(root, "data");
  const { sessionId } = createSessionDirs(dataDir);
  const workspace = join(dataDir, "sessions", sessionId, "workspace");
  mkdirSync(join(workspace, "uploads"), { recursive: true });
  writeFileSync(
    join(workspace, "uploads", "big.bin"),
    Buffer.alloc(SESSION_WORKSPACE_QUOTA_BYTES)
  );
  await assert.rejects(
    uploadWorkspaceFile(
      dataDir,
      sessionId,
      "notes.txt",
      Buffer.from("too much", "utf-8")
    ),
    /quota exceeded/i
  );
});

test("deleteWorkspaceFile removes upload and reports deleted paths", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-workspace-delete-"));
  const dataDir = join(root, "data");
  const { sessionId } = createSessionDirs(dataDir);
  await uploadWorkspaceFile(
    dataDir,
    sessionId,
    "notes.txt",
    Buffer.from("delete me", "utf-8")
  );
  const deleted = deleteWorkspaceFile(dataDir, sessionId, "uploads/notes.txt");
  assert.deepEqual(deleted.deleted, ["uploads/notes.txt"]);
  assert.equal(
    existsSync(join(dataDir, "sessions", sessionId, "workspace", "uploads", "notes.txt")),
    false
  );
  assert.equal(getSessionWorkspaceUsage(dataDir, sessionId), 0);
});

test("listWorkspaceFiles includes agent-authored text files outside uploads/", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-workspace-agent-"));
  const dataDir = join(root, "data");
  const { sessionId } = createSessionDirs(dataDir);
  const workspace = join(dataDir, "sessions", sessionId, "workspace");
  writeFileSync(join(workspace, "poem.md"), "# Poem\n", "utf-8");
  mkdirSync(join(workspace, "notes"), { recursive: true });
  writeFileSync(join(workspace, "notes", "idea.txt"), "idea", "utf-8");

  const listed = listWorkspaceFiles(dataDir, sessionId);
  const paths = listed.files.map((entry) => entry.path).sort();
  assert.deepEqual(paths, ["notes/idea.txt", "poem.md"]);
  assert.equal(listed.files.find((entry) => entry.path === "poem.md")?.kind, "text");
  assert.equal(
    listed.files.find((entry) => entry.path === "poem.md")?.stageable,
    true
  );
});

test("describeWorkingFolders lists the global list after the project folders", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-working-folder-global-"));
  const dataDir = join(root, "data");
  const external = join(root, "user-project");
  const shared = join(root, "shared");
  mkdirSync(external, { recursive: true });
  mkdirSync(join(shared, "refs"), { recursive: true });
  writeFileSync(join(shared, "refs", "guide.md"), "guide", "utf-8");
  const { sessionId } = createSessionDirs(dataDir);
  const recordsDir = join(dataDir, "sessions", sessionId, "records");
  writeFileSync(
    join(recordsDir, "session.json"),
    JSON.stringify({
      schemaVersion: 1,
      recordType: "session",
      sessionId,
      createdAt: new Date().toISOString(),
      recordModel: "v0.4",
      workspace: { primaryDir: external },
    })
  );
  writeFileSync(
    join(dataDir, "app-settings.json"),
    JSON.stringify({
      schemaVersion: 1,
      workingFolders: { global: [{ path: shared, writable: false }], projects: [] },
    })
  );

  const folders = describeWorkingFolders(dataDir, sessionId);
  assert.deepEqual(
    folders.map((folder) => [folder.id, folder.role, folder.available]),
    [["primary", "primary", true], ["global-1", "global", true]]
  );
  const sharedEntries = listWorkingFolderChildren(
    dataDir,
    sessionId,
    "global-1"
  ).entries;
  assert.deepEqual(sharedEntries.map((entry) => entry.path), ["refs"]);
});

test("working-folder browsing follows the persisted external workspace", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-working-folder-"));
  const dataDir = join(root, "data");
  const external = join(root, "user-project");
  mkdirSync(join(external, "notes"), { recursive: true });
  writeFileSync(join(external, "notes", "idea.md"), "# Actual work\n", "utf-8");
  mkdirSync(join(external, "node_modules", "ignored"), { recursive: true });
  writeFileSync(join(external, "node_modules", "ignored", "x.js"), "x", "utf-8");
  mkdirSync(join(external, "flat"), { recursive: true });
  for (let index = 0; index < 1005; index += 1) {
    writeFileSync(join(external, "flat", `${index}.txt`), "x", "utf-8");
  }
  const { sessionId } = createSessionDirs(dataDir);
  const recordsDir = join(dataDir, "sessions", sessionId, "records");
  writeFileSync(
    join(recordsDir, "session.json"),
    JSON.stringify({
      schemaVersion: 1,
      recordType: "session",
      sessionId,
      createdAt: new Date().toISOString(),
      recordModel: "v0.4",
      workspace: { primaryDir: external },
    })
  );

  const folders = describeWorkingFolders(dataDir, sessionId);
  assert.equal(folders[0]?.path, external);
  const rootEntries = listWorkingFolderChildren(
    dataDir,
    sessionId,
    "primary",
  ).entries;
  assert.deepEqual(rootEntries.map((entry) => entry.path), ["flat", "notes"]);
  assert.equal(rootEntries[0]?.isDirectory, true);
  assert.equal(
    listWorkingFolderChildren(dataDir, sessionId, "primary", "flat").entries
      .length,
    1005,
  );
  const noteEntries = listWorkingFolderChildren(
    dataDir,
    sessionId,
    "primary",
    "notes",
  ).entries;
  assert.deepEqual(noteEntries.map((entry) => entry.path), ["notes/idea.md"]);
  assert.equal(noteEntries[0]?.isDirectory, false);
  assert.throws(
    () =>
      listWorkingFolderChildren(
        dataDir,
        sessionId,
        "primary",
        "node_modules",
      ),
    /omitted/,
  );
  const file = readWorkingFolderTextFile(
    dataDir,
    sessionId,
    "primary/notes/idea.md"
  );
  assert.equal(file.content, "# Actual work\n");
  const search = await searchWorkingFolder(dataDir, sessionId, "primary", "IDEA");
  assert.deepEqual(search.entries.map((entry) => entry.path), ["notes/idea.md"]);
  assert.equal(search.truncated, false);
  assert.deepEqual(
    (await searchWorkingFolder(dataDir, sessionId, "primary", "notes")).entries.map((entry) => entry.path),
    ["notes"],
  );
  assert.deepEqual(
    (await searchWorkingFolder(dataDir, sessionId, "primary", "notes/idea")).entries.map((entry) => entry.path),
    ["notes/idea.md"],
  );
  for (let index = 0; index < 205; index += 1) {
    writeFileSync(join(external, "flat", `a-${String(index).padStart(3, "0")}-needle.txt`), "x");
  }
  writeFileSync(join(external, "flat", "needle"), "x");
  const ranked = await searchWorkingFolder(dataDir, sessionId, "primary", "needle", 1);
  assert.deepEqual(ranked.entries.map((entry) => entry.path), ["flat/needle"]);
  assert.equal(ranked.truncated, true);
  assert.equal(
    (await searchWorkingFolder(dataDir, sessionId, "primary", ".txt", 1)).truncated,
    true,
  );
  assert.deepEqual(
    (await searchWorkingFolder(dataDir, sessionId, "primary", "x.js")).entries,
    [],
  );

  // One search token reuses its folder walk; a new token walks again.
  const tokenSearch = (query: string, token: string) =>
    searchWorkingFolder(dataDir, sessionId, "primary", query, 200, { token });
  assert.deepEqual((await tokenSearch("later", "t1")).entries, []);
  writeFileSync(join(external, "notes", "later.md"), "x");
  assert.deepEqual((await tokenSearch("later", "t1")).entries, []);
  assert.deepEqual((await tokenSearch("later", "t2")).entries.map((entry) => entry.path), ["notes/later.md"]);
  // A cached path deleted since the walk is skipped, not an error.
  unlinkSync(join(external, "notes", "later.md"));
  assert.deepEqual((await tokenSearch("later", "t2")).entries, []);

  const closed = new AbortController();
  closed.abort();
  await assert.rejects(
    searchWorkingFolder(dataDir, sessionId, "primary", "needle", 200, { signal: closed.signal }),
    { name: "AbortError" },
  );
});

test("working-folder listing and preview refuse a symlink out of the folder", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-working-symlink-"));
  const dataDir = join(root, "data");
  const external = join(root, "user-project");
  const outside = join(root, "outside");
  mkdirSync(join(external, "notes"), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(external, "notes", "idea.md"), "# Actual work\n", "utf-8");
  writeFileSync(join(outside, "passwd"), "root:x:0:0", "utf-8");
  symlinkSync(
    outside,
    join(external, "link"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const { sessionId } = createSessionDirs(dataDir);
  const recordsDir = join(dataDir, "sessions", sessionId, "records");
  writeFileSync(
    join(recordsDir, "session.json"),
    JSON.stringify({
      schemaVersion: 1,
      recordType: "session",
      sessionId,
      createdAt: new Date().toISOString(),
      recordModel: "v0.4",
      workspace: { primaryDir: external },
    })
  );

  // Review card 4 case B: the listing refuses, and the preview cannot return
  // a file the listing refuses.
  assert.throws(
    () => listWorkingFolderChildren(dataDir, sessionId, "primary", "link"),
    /must stay inside the selected folder/,
  );
  assert.throws(
    () =>
      readWorkingFolderTextFile(dataDir, sessionId, "primary/link/passwd"),
    /must stay inside the selected folder/,
  );

  // The folder's own files are unaffected.
  const file = readWorkingFolderTextFile(
    dataDir,
    sessionId,
    "primary/notes/idea.md"
  );
  assert.equal(file.content, "# Actual work\n");
});

test("a restored draft learns which staged attachments are gone", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-missing-attachments-"));
  const dataDir = join(root, "data");
  const dirs = createSessionDirs(dataDir, "session-attachments");
  mkdirSync(join(dirs.sessionCwd, "uploads"), { recursive: true });
  writeFileSync(join(dirs.sessionCwd, "uploads", "kept.md"), "kept", "utf-8");
  const outside = join(root, "outside.txt");
  writeFileSync(outside, "outside", "utf-8");
  assert.deepEqual(
    missingAttachmentPaths(dataDir, "session-attachments", [
      "uploads/kept.md",
      "uploads/gone.md",
      "../../outside.txt",
      outside,
      join(root, "gone.txt"),
    ]),
    ["uploads/gone.md", "../../outside.txt", join(root, "gone.txt")],
  );
  // The new-conversation draft has no workspace: only absolute paths hold.
  assert.deepEqual(missingAttachmentPaths(dataDir, null, ["uploads/kept.md", outside]), ["uploads/kept.md"]);
});
