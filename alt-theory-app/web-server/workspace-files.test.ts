import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSessionDirs } from "../core/data-dir.js";
import {
  ACCOUNT_STORAGE_QUOTA_BYTES,
  deleteWorkspaceFile,
  getAccountStorageUsage,
  getSessionWorkspaceUsage,
  listWorkspaceFiles,
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
    "p01",
    "notes.txt",
    Buffer.from("hello workspace", "utf-8")
  );
  assert.equal(result.extractStatus, "not-needed");
  assert.equal(result.originalPath, "uploads/notes.txt");
  assert.equal(result.entry.stageable, true);
  const listed = listWorkspaceFiles(dataDir, sessionId, "p01");
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
      "p01",
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
    "p01",
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

function writeOwnerStub(dataDir: string, sessionId: string, ownerAccountId: string) {
  const recordsDir = join(dataDir, "sessions", sessionId, "records");
  mkdirSync(recordsDir, { recursive: true });
  writeFileSync(
    join(recordsDir, "session.json"),
    JSON.stringify({
      schemaVersion: 1,
      recordType: "session",
      sessionId,
      createdAt: new Date().toISOString(),
      projectId: null,
      recordModel: "v0.4",
      ownerAccountId,
    })
  );
}

test("listWorkspaceFiles includes agent-authored text files outside uploads/", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-workspace-agent-"));
  const dataDir = join(root, "data");
  const { sessionId } = createSessionDirs(dataDir);
  const workspace = join(dataDir, "sessions", sessionId, "workspace");
  writeFileSync(join(workspace, "poem.md"), "# Poem\n", "utf-8");
  mkdirSync(join(workspace, "notes"), { recursive: true });
  writeFileSync(join(workspace, "notes", "idea.txt"), "idea", "utf-8");

  const listed = listWorkspaceFiles(dataDir, sessionId, "p01");
  const paths = listed.files.map((entry) => entry.path).sort();
  assert.deepEqual(paths, ["notes/idea.txt", "poem.md"]);
  assert.equal(listed.files.find((entry) => entry.path === "poem.md")?.kind, "text");
  assert.equal(
    listed.files.find((entry) => entry.path === "poem.md")?.stageable,
    true
  );
});

test("account usage sums owned session workspaces", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-workspace-account-"));
  const dataDir = join(root, "data");
  const first = createSessionDirs(dataDir);
  const second = createSessionDirs(dataDir);
  writeOwnerStub(dataDir, first.sessionId, "p01");
  writeOwnerStub(dataDir, second.sessionId, "p01");
  await uploadWorkspaceFile(
    dataDir,
    first.sessionId,
    "p01",
    "a.txt",
    Buffer.alloc(1024, 1)
  );
  await uploadWorkspaceFile(
    dataDir,
    second.sessionId,
    "p01",
    "b.txt",
    Buffer.alloc(2048, 2)
  );
  assert.equal(getAccountStorageUsage(dataDir, "p01"), 3072);
  const listed = listWorkspaceFiles(dataDir, first.sessionId, "p01");
  assert.equal(listed.usage.sessionBytes, 1024);
});
