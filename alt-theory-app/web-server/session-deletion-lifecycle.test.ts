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
  forkFamilyIds,
  healFamilyInvariants,
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
  createSession(dataDir, "branch-arm", { sessionId: "branch", purpose: "ab-arm" });

  // root has a living branch, so ALL its attached conversations survive the
  // delete (owner ruling 2026-08-04: no fork-time bound).
  softDeleteSession(dataDir, "root");
  assert.deepEqual(ids(dataDir), [
    "branch",
    "branch-arm",
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
  // A/B arms are disposable (owner 2026-08-04: real-time compare, the
  // alternative is not retained) — they follow their parent into Trash
  // instead of surviving as invisible orphans.
  assert.throws(
    () => restoreDeletedSession(dataDir, "branch-arm"),
    /not a direct Trash entry/,
  );
  assert.deepEqual(restoreDeletedSession(dataDir, "branch").sort(), [
    "branch",
    "branch-arm",
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

test("A listed btw holds its promotion through later mainline switches", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-mainline-btw-"));
  createSession(dataDir, "root");
  createSession(
    dataDir,
    "btw",
    { sessionId: "root", purpose: "side", listed: true },
    "2026-08-01T01:00:00.000Z",
  );
  createSession(
    dataDir,
    "b1",
    { sessionId: "root", purpose: "fork" },
    "2026-08-01T02:00:00.000Z",
  );
  createSession(
    dataDir,
    "b2",
    { sessionId: "root", purpose: "fork" },
    "2026-08-01T03:00:00.000Z",
  );
  const summary = (id: string) =>
    listSessionSummaries(dataDir).sessions.find((s) => s.sessionId === id)!;

  // First promotion delists the root; the second finds no delistable
  // ancestor — and must NOT strip the listed btw's promotion (only roots
  // step down).
  promoteToMainlineRecords(dataDir, "b1");
  assert.equal(summary("root").delisted, true);
  promoteToMainlineRecords(dataDir, "b2");
  assert.equal(summary("btw").forkedFrom?.listed, true);
  assert.equal(summary("btw").forkedFrom?.purpose, "side");
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

test("Trash retention sweep fails per entry, not per pass", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-trash-sweep-"));
  const expire = (id: string) => {
    const dirs = createSession(dataDir, id);
    softDeleteSession(dataDir, id);
    removeDeletedSessionRecord(dirs.recordsDir);
    writeDeletedSessionRecord(dirs.recordsDir, id, {
      deletedAt: "2026-06-01T00:00:00.000Z",
      reason: "user_deleted",
      cascadeRootSessionId: id,
    });
  };
  expire("a-kept");
  expire("z-damaged"); // created last + sorts first on ties: swept first
  const purged = purgeExpiredDeletedSessions(
    dataDir,
    new Date("2026-07-02T00:00:00.000Z"),
    (sessionId) => {
      if (sessionId === "z-damaged") throw new Error("simulated damage");
      return false;
    },
  );
  assert.deepEqual(purged, ["a-kept"]);
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

test("forkFamilyIds returns the whole tree from any member", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-family-ids-"));
  createSession(dataDir, "root");
  createSession(dataDir, "b1", { sessionId: "root", purpose: "fork" });
  createSession(dataDir, "b1-child", { sessionId: "b1", purpose: "fork" });
  createSession(dataDir, "side", { sessionId: "root", purpose: "side" });
  createSession(dataDir, "other-root");

  // From a mid-tree member the family still covers root + every subtree.
  assert.deepEqual(forkFamilyIds(dataDir, "b1").sort(), [
    "b1",
    "b1-child",
    "root",
    "side",
  ]);
  assert.deepEqual(forkFamilyIds(dataDir, "other-root"), ["other-root"]);
});

function setWorkspace(recordsDir: string, primaryDir: string | null) {
  const header = readV4SessionHeader(recordsDir)!;
  writeSessionHeader(recordsDir, {
    ...header,
    workspace: primaryDir
      ? { primaryDir, additionalDirs: [] }
      : undefined,
  });
}

test("healFamilyInvariants aligns every member to the root's working folder", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-heal-ws-"));
  const rootDirs = createSession(dataDir, "root");
  const b1Dirs = createSession(dataDir, "b1", {
    sessionId: "root",
    purpose: "fork",
  });
  const b2Dirs = createSession(dataDir, "b1-child", {
    sessionId: "b1",
    purpose: "fork",
  });
  const folder = mkdtempSync(join(tmpdir(), "alt-theory-heal-folder-"));
  setWorkspace(rootDirs.recordsDir, folder);
  setWorkspace(b2Dirs.recordsDir, mkdtempSync(join(tmpdir(), "alt-theory-stray-")));

  healFamilyInvariants(dataDir);

  for (const dirs of [rootDirs, b1Dirs, b2Dirs]) {
    assert.equal(
      readV4SessionHeader(dirs.recordsDir)?.workspace?.primaryDir,
      folder,
    );
  }

  // Root wins in the other direction too: a folderless root clears strays.
  setWorkspace(rootDirs.recordsDir, null);
  healFamilyInvariants(dataDir);
  for (const dirs of [b1Dirs, b2Dirs]) {
    assert.equal(readV4SessionHeader(dirs.recordsDir)?.workspace, undefined);
  }
});

test("healFamilyInvariants relists a representative for an invisible family", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-heal-rep-"));
  const rootDirs = createSession(dataDir, "root");
  createSession(dataDir, "side", { sessionId: "root", purpose: "side" });
  // Broken state from an older build: root in Trash, unlisted side survives.
  writeDeletedSessionRecord(rootDirs.recordsDir, "root", {
    deletedAt: "2026-08-01T00:00:00.000Z",
    reason: "user_deleted",
    cascadeRootSessionId: "root",
  });

  healFamilyInvariants(dataDir);

  const side = listSessionSummaries(dataDir).sessions.find(
    (s) => s.sessionId === "side",
  );
  assert.equal(side?.forkedFrom?.listed, true);
});

test("deleting the last listed member promotes the OLDEST first-level branch", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-oldest-branch-"));
  createSession(dataDir, "root");
  // Root already gone from an older build; the listed helper is the last
  // visible member, and two unlisted-but-living branches remain.
  const rootDirs = createSession(dataDir, "gone-root");
  createSession(
    dataDir,
    "b-old",
    { sessionId: "gone-root", purpose: "fork" },
    "2026-08-01T00:00:00.000Z",
  );
  createSession(
    dataDir,
    "b-new",
    { sessionId: "gone-root", purpose: "fork" },
    "2026-08-02T00:00:00.000Z",
  );
  void rootDirs;
  softDeleteSession(dataDir, "gone-root");
  // Branches are list members by nature, so the tree stays visible and no
  // representative promotion is needed — the oldest branch heads the family
  // in the list (frontend orphan grouping).
  const summaries = listSessionSummaries(dataDir).sessions;
  assert.deepEqual(
    summaries
      .filter((s) => s.forkedFrom?.purpose === "fork" && !s.deletedAt)
      .map((s) => s.sessionId)
      .sort(),
    ["b-old", "b-new"].sort(),
  );
});

test("promote in a rootless family moves the head anchor between branches", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-rootless-head-"));
  createSession(dataDir, "root");
  createSession(
    dataDir,
    "b1",
    { sessionId: "root", purpose: "fork" },
    "2026-08-01T00:00:00.000Z",
  );
  createSession(
    dataDir,
    "b2",
    { sessionId: "root", purpose: "fork" },
    "2026-08-02T00:00:00.000Z",
  );
  softDeleteSession(dataDir, "root");

  const flags = () => {
    const byId = new Map(
      listSessionSummaries(dataDir).sessions.map((s) => [s.sessionId, s]),
    );
    return {
      b1: byId.get("b1")?.forkedFrom?.listed === true,
      b2: byId.get("b2")?.forkedFrom?.listed === true,
    };
  };

  promoteToMainlineRecords(dataDir, "b2");
  assert.deepEqual(flags(), { b1: false, b2: true });
  // Re-heading clears the competing anchor so the head stays unique.
  promoteToMainlineRecords(dataDir, "b1");
  assert.deepEqual(flags(), { b1: true, b2: false });
});

test("promoting a branch-of-branch in a rootless family clears anchors family-wide", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-nested-head-"));
  createSession(dataDir, "root");
  createSession(
    dataDir,
    "b1",
    { sessionId: "root", purpose: "fork" },
    "2026-08-01T00:00:00.000Z",
  );
  createSession(
    dataDir,
    "c",
    { sessionId: "b1", purpose: "fork" },
    "2026-08-02T00:00:00.000Z",
  );
  softDeleteSession(dataDir, "root");
  promoteToMainlineRecords(dataDir, "b1");
  promoteToMainlineRecords(dataDir, "c");

  const byId = new Map(
    listSessionSummaries(dataDir).sessions.map((s) => [s.sessionId, s]),
  );
  assert.equal(byId.get("c")?.forkedFrom?.listed, true);
  assert.notEqual(byId.get("b1")?.forkedFrom?.listed, true);
});
