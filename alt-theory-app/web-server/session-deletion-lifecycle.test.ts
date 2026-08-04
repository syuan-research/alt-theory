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
) {
  const dirs = createSessionDirs(dataDir, sessionId);
  const manifest = {
    schemaVersion: 1,
    sessionId,
    createdAt: CREATED_AT,
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

  softDeleteSession(dataDir, "root");
  assert.deepEqual(ids(dataDir), ["branch", "branch-side", "promoted-helper"]);
  assert.deepEqual(
    listDeletedSessionSummaries(dataDir).sessions.map((session) => session.sessionId),
    ["root"],
  );
  assert.throws(
    () => restoreDeletedSession(dataDir, "side"),
    /not a direct Trash entry/,
  );

  assert.deepEqual(restoreDeletedSession(dataDir, "root").sort(), [
    "root",
    "side",
    "subagent",
  ]);
  assert.deepEqual(ids(dataDir), [
    "branch",
    "branch-side",
    "promoted-helper",
    "root",
    "side",
    "subagent",
  ]);

  softDeleteSession(dataDir, "branch");
  assert.deepEqual(ids(dataDir), ["promoted-helper", "root", "side", "subagent"]);
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

  // A subagent two levels down is as live as its root; a Branch and a promoted
  // child stay, so stopping them would abort work the user still has.
  assert.deepEqual(sessionsAttachedToDeletion(dataDir, "root").sort(), [
    "root",
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
