import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "fs";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import { createSessionDirs } from "../core/data-dir.js";
import {
  readV4SessionHeader,
  writeFoundationRecords,
  writeSessionHeader,
  type ForkPurpose,
} from "./session-records.js";
import {
  listDeletedSessionSummaries,
  listSessionSummaries,
  permanentlyDeleteSession,
  promoteToMainlineRecords,
  purgeExpiredDeletedSessions,
  restoreDeletedSession,
  sessionsAttachedToDeletion,
  softDeleteSession,
} from "./session-store.js";
import {
  removeDeletedSessionRecord,
  writeDeletedSessionRecord,
} from "./session-deletion.js";

const CREATED_AT = "2026-08-01T00:00:00.000Z";

function createSession(
  dataDir: string,
  sessionId: string,
  forkedFrom?: { sessionId: string; purpose: ForkPurpose; listed?: boolean },
  createdAt: string = CREATED_AT,
) {
  const dirs = createSessionDirs(dataDir, sessionId);
  const manifest = {
    schemaVersion: 1,
    sessionId,
    createdAt,
    openedFrom: "new",
    recordsDir: dirs.recordsDir,
    sessionCwd: dirs.sessionCwd,
    piSessionDir: dirs.piSessionDir,
    piSessionFile: join(dirs.piSessionDir, "session.jsonl"),
    appContext: { path: null, exists: false },
    soul: { path: null, slug: null, exists: false },
    rolePreset: { path: null, slug: "default", exists: false },
    kb: { dir: "", domain: "ep-core" },
    kbDir: "",
    kbDomain: "ep-core",
    altMode: "understand",
    resourceDiscovery: { mode: "clean" },
    readonly: true,
    writableRoots: [],
    runtimeTools: [],
  } as any;
  writeFoundationRecords({
    sessionRoot: dirs.sessionRoot,
    recordsDir: dirs.recordsDir,
    manifest,
    forkedFrom,
  });
  if (forkedFrom?.listed) {
    const header = readV4SessionHeader(dirs.recordsDir)!;
    writeSessionHeader(dirs.recordsDir, {
      ...header,
      forkedFrom: { ...header.forkedFrom!, listed: true },
    });
  }
  writeFileSync(manifest.piSessionFile, "{}\n", "utf-8");
  writeFileSync(join(dirs.recordsDir, "source-rollout.jsonl"), "raw", "utf-8");
  writeFileSync(join(dirs.writeDir, "attachment.txt"), "keep", "utf-8");
  return dirs;
}

function ids(dataDir: string) {
  return listSessionSummaries(dataDir).sessions.map((session) => session.sessionId).sort();
}

test("Delete follows attached conversations but stops at Branches and promoted children", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-trash-identity-"));
  createSession(dataDir, "root");
  createSession(dataDir, "branch", { sessionId: "root", purpose: "fork" });
  createSession(dataDir, "side", { sessionId: "root", purpose: "side" });
  createSession(dataDir, "subagent", { sessionId: "side", purpose: "subagent" });
  createSession(dataDir, "promoted-helper", {
    sessionId: "root",
    purpose: "helper",
    listed: true,
  });
  createSession(dataDir, "branch-side", { sessionId: "branch", purpose: "side" });

  // root has a living branch, so ALL its attached conversations survive the
  // delete (owner ruling 2026-08-04: no fork-time bound).
  softDeleteSession(dataDir, "root");
  assert.deepEqual(ids(dataDir), [
    "branch",
    "branch-side",
    "promoted-helper",
    "side",
    "subagent",
  ]);
  assert.deepEqual(
    listDeletedSessionSummaries(dataDir).sessions.map((session) => session.sessionId),
    ["root"],
  );
  assert.deepEqual(restoreDeletedSession(dataDir, "root").sort(), ["root"]);

  // branch has no branch of its own: the cascade still buries its attached
  // side conversation, and that child is not a direct Trash entry.
  softDeleteSession(dataDir, "branch");
  assert.deepEqual(ids(dataDir), ["promoted-helper", "root", "side", "subagent"]);
  assert.throws(
    () => restoreDeletedSession(dataDir, "branch-side"),
    /not a direct Trash entry/,
  );
  assert.deepEqual(restoreDeletedSession(dataDir, "branch").sort(), [
    "branch",
    "branch-side",
  ]);
});

test("Deleting a parent keeps subagents and btw a surviving branch shares", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-trash-shared-"));
  createSession(dataDir, "root");
  createSession(
    dataDir,
    "sa-before",
    { sessionId: "root", purpose: "subagent" },
    "2026-08-01T01:00:00.000Z",
  );
  createSession(
    dataDir,
    "btw-before",
    { sessionId: "root", purpose: "side" },
    "2026-08-01T01:30:00.000Z",
  );
  createSession(
    dataDir,
    "branch",
    { sessionId: "root", purpose: "fork" },
    "2026-08-01T02:00:00.000Z",
  );
  createSession(
    dataDir,
    "sa-after",
    { sessionId: "root", purpose: "subagent" },
    "2026-08-01T03:00:00.000Z",
  );

  softDeleteSession(dataDir, "root");
  // While any branch lives, ALL of the parent's attached conversations
  // survive — no fork-time comparison (owner ruling 2026-08-04: edit flows
  // delete old mainlines constantly; never silently lose content).
  assert.deepEqual(ids(dataDir), [
    "branch",
    "btw-before",
    "sa-after",
    "sa-before",
  ]);

  restoreDeletedSession(dataDir, "root");
  assert.deepEqual(ids(dataDir), [
    "branch",
    "btw-before",
    "root",
    "sa-after",
    "sa-before",
  ]);
});

test("Mainline promotion is a reversible role swap with a living representative", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-mainline-"));
  createSession(dataDir, "root");
  createSession(
    dataDir,
    "branch",
    { sessionId: "root", purpose: "fork" },
    "2026-08-01T02:00:00.000Z",
  );
  const summary = (id: string) =>
    listSessionSummaries(dataDir).sessions.find((s) => s.sessionId === id)!;

  // Promote: branch takes the list spot, root cedes it, both stay alive,
  // lineage untouched; the successor is recorded so the list can nest the
  // demoted root under the RIGHT child deterministically.
  promoteToMainlineRecords(dataDir, "branch");
  assert.equal(summary("branch").forkedFrom?.listed, true);
  assert.equal(summary("root").delisted, true);
  assert.equal(summary("root").delistedFor, "branch");
  assert.equal(summary("branch").forkedFrom?.sessionId, "root");

  // Reverse from the delisted root: it returns to the list; the branch
  // simply stays an ordinary branch (fork children are list-visible by
  // nature, so there is nothing to step down).
  promoteToMainlineRecords(dataDir, "root");
  assert.notEqual(summary("root").delisted, true);
  assert.equal(summary("branch").forkedFrom?.purpose, "fork");

  // Deleting the only listed member auto-relists the living ancestor, so
  // the tree never vanishes from the list.
  promoteToMainlineRecords(dataDir, "branch");
  softDeleteSession(dataDir, "branch");
  assert.notEqual(summary("root").delisted, true);
});

test("Promoting a branch-of-branch steps down the nearest visible member, not the root's root", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-mainline-deep-"));
  createSession(dataDir, "root");
  createSession(
    dataDir,
    "b1",
    { sessionId: "root", purpose: "fork" },
    "2026-08-01T02:00:00.000Z",
  );
  createSession(
    dataDir,
    "c1",
    { sessionId: "b1", purpose: "fork" },
    "2026-08-01T03:00:00.000Z",
  );
  const summary = (id: string) =>
    listSessionSummaries(dataDir).sessions.find((s) => s.sessionId === id)!;

  // The old MAINLINE cedes the spot: fork ancestors are list-visible by
  // nature and pass through untouched; the root is the delistable one
  // (owner's role-swap model — b1 remains an ordinary branch).
  promoteToMainlineRecords(dataDir, "c1");
  assert.equal(summary("c1").forkedFrom?.listed, true);
  assert.equal(summary("root").delisted, true);
  assert.equal(summary("b1").forkedFrom?.listed, undefined);
  assert.equal(summary("b1").forkedFrom?.purpose, "fork");
});

test("Delete reports every conversation it will bury, so a live run can be stopped first", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-trash-attached-"));
  createSession(dataDir, "root");
  createSession(dataDir, "side", { sessionId: "root", purpose: "side" });
  createSession(dataDir, "subagent", { sessionId: "side", purpose: "subagent" });
  createSession(dataDir, "branch", { sessionId: "root", purpose: "fork" });
  createSession(dataDir, "promoted-helper", {
    sessionId: "root",
    purpose: "helper",
    listed: true,
  });

  // root's living branch protects its attached conversations, so deleting
  // root buries only root. A branchless parent still reports the whole
  // attached family (a subagent two levels down is as live as its root).
  assert.deepEqual(sessionsAttachedToDeletion(dataDir, "root").sort(), [
    "root",
  ]);
  assert.deepEqual(sessionsAttachedToDeletion(dataDir, "side").sort(), [
    "side",
    "subagent",
  ]);
});

test("Permanent deletion removes conversation records but keeps workspace files", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-trash-permanent-"));
  const dirs = createSession(dataDir, "imported");
  assert.throws(
    () => permanentlyDeleteSession(dataDir, "imported"),
    /not a direct Trash entry/,
  );
  softDeleteSession(dataDir, "imported");
  permanentlyDeleteSession(dataDir, "imported");

  assert.equal(existsSync(dirs.piSessionDir), false);
  assert.equal(existsSync(join(dirs.recordsDir, "source-rollout.jsonl")), false);
  assert.equal(existsSync(join(dirs.writeDir, "attachment.txt")), true);
  assert.equal(listDeletedSessionSummaries(dataDir).sessions.length, 0);
});

test("A conversation emptied by private retention is not offered as recoverable", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-trash-private-"));
  const dirs = createSession(dataDir, "private");
  writeDeletedSessionRecord(dirs.recordsDir, "private", {
    deletedAt: "2026-08-01T00:00:00.000Z",
    reason: "private_retention_expired",
  });

  assert.deepEqual(listDeletedSessionSummaries(dataDir).sessions, []);
  assert.throws(
    () => restoreDeletedSession(dataDir, "private"),
    /no longer recoverable/,
  );
});

test("Trash retention permanently deletes after 30 days", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-trash-expiry-"));
  const dirs = createSession(dataDir, "expired");
  softDeleteSession(dataDir, "expired");
  removeDeletedSessionRecord(dirs.recordsDir);
  writeDeletedSessionRecord(dirs.recordsDir, "expired", {
    deletedAt: "2026-06-01T00:00:00.000Z",
    reason: "user_deleted",
    cascadeRootSessionId: "expired",
  });

  assert.deepEqual(
    purgeExpiredDeletedSessions(
      dataDir,
      new Date("2026-07-02T00:00:00.000Z"),
    ),
    ["expired"],
  );
  assert.equal(existsSync(join(dirs.writeDir, "attachment.txt")), true);
  assert.equal(existsSync(dirs.piSessionDir), false);
});
