import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import { createSessionDirs } from "../core/data-dir.js";
import { writeFoundationRecords } from "./session-records.js";
import {
  calculateRetentionDueAt,
  hardDeleteExpiredPrivateSessions,
  refreshRetention,
  refreshSessionRetention,
} from "./session-retention.js";

const BASE_TIME = "2026-06-16T00:00:00.000Z";

function manifest(sessionId: string, recordsDir: string, sessionCwd: string) {
  return {
    schemaVersion: 1,
    sessionId,
    createdAt: BASE_TIME,
    openedFrom: "new",
    recordsDir,
    sessionCwd,
    piSessionDir: "",
    piSessionFile: join(recordsDir, "fake.jsonl"),
    appContext: { path: null, exists: false },
    soul: { path: null, slug: null, exists: false },
    rolePreset: { path: null, slug: "default", exists: false },
    kb: { dir: "", domain: "ep-core" },
    kbDir: "",
    kbDomain: "ep-core",
    promptMode: "alt-only",
    resourceDiscovery: { mode: "clean" },
    readonly: true,
    writableRoots: [],
    runtimeTools: [],
  } as any;
}

function createRecordedSession(
  dataDir: string,
  sessionId: string,
  visibility: "research" | "private",
  lastActivityAt = BASE_TIME
) {
  const dirs = createSessionDirs(dataDir, sessionId);
  const retentionDueAt =
    visibility === "private" ? calculateRetentionDueAt(lastActivityAt) : null;
  writeFoundationRecords({
    sessionRoot: dirs.sessionRoot,
    recordsDir: dirs.recordsDir,
    manifest: manifest(sessionId, dirs.recordsDir, dirs.sessionCwd),
    visibility,
    consentSnapshot: {
      researcherReadable: visibility !== "private",
      quoteAfterAnonymization: visibility !== "private",
      privateOverride: visibility === "private",
    },
    lastActivityAt,
    retentionDueAt,
  });
  mkdirSync(join(dirs.sessionRoot, "branches", "fork-001", "workspace"), {
    recursive: true,
  });
  writeFileSync(join(dirs.sessionRoot, "history", "session.jsonl"), "{}", "utf-8");
  writeFileSync(join(dirs.sessionRoot, "workspace", "note.md"), "private", "utf-8");
  writeFileSync(
    join(dirs.sessionRoot, "branches", "fork-001", "workspace", "fork.md"),
    "fork",
    "utf-8"
  );
  writeFileSync(join(dirs.recordsDir, "lineage.jsonl"), "evidence", "utf-8");
  return dirs;
}

test("calculateRetentionDueAt returns seven inactive days after activity", () => {
  assert.equal(
    calculateRetentionDueAt("2026-06-16T00:00:00.000Z"),
    "2026-06-23T00:00:00.000Z"
  );
  assert.throws(
    () => calculateRetentionDueAt("not-a-date"),
    /Invalid lastActivityAt/
  );
});

test("refreshRetention updates private sessions and clears public retention", () => {
  const now = new Date("2026-06-20T12:30:00.000Z");
  const refreshed = refreshRetention(
    {
      schemaVersion: 1,
      recordType: "session",
      sessionId: "private-session",
      createdAt: BASE_TIME,
      projectId: null,
      activeBranchId: "main",
      recordModel: "v0.4",
      visibility: "private",
      consentSnapshot: {
        researcherReadable: true,
        quoteAfterAnonymization: true,
        privateOverride: false,
      },
    },
    now
  );
  assert.equal(refreshed.lastActivityAt, "2026-06-20T12:30:00.000Z");
  assert.equal(refreshed.retentionDueAt, "2026-06-27T12:30:00.000Z");
  assert.equal(refreshed.consentSnapshot?.privateOverride, true);

  const publicSession = refreshRetention(
    {
      ...refreshed,
      visibility: "research",
      retentionDueAt: "2026-06-27T12:30:00.000Z",
    },
    now
  );
  assert.equal(publicSession.retentionDueAt, null);
});

test("refreshSessionRetention persists private activity metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-retention-refresh-"));
  const dirs = createRecordedSession(root, "private-refresh", "private");
  const refreshed = refreshSessionRetention(
    dirs.recordsDir,
    new Date("2026-06-17T00:00:00.000Z")
  );
  assert.equal(refreshed?.lastActivityAt, "2026-06-17T00:00:00.000Z");
  const stored = JSON.parse(
    readFileSync(join(dirs.recordsDir, "session.json"), "utf-8")
  );
  assert.equal(stored.retentionDueAt, "2026-06-24T00:00:00.000Z");
});

test("hardDeleteExpiredPrivateSessions removes expired private evidence only", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-retention-cleanup-"));
  const privateDirs = createRecordedSession(dataDir, "private-expired", "private");
  const publicDirs = createRecordedSession(dataDir, "public-session", "research");
  const futureDirs = createRecordedSession(
    dataDir,
    "private-not-due",
    "private",
    "2026-06-22T00:00:00.000Z"
  );

  const result = hardDeleteExpiredPrivateSessions(
    dataDir,
    new Date("2026-06-24T00:00:00.000Z")
  );
  assert.equal(result.scanned, 3);
  assert.deepEqual(
    result.deleted.map((record) => ({
      sessionId: record.sessionId,
      reason: record.reason,
    })),
    [
      {
        sessionId: "private-expired",
        reason: "private_retention_expired",
      },
    ]
  );
  assert.equal(existsSync(join(privateDirs.sessionRoot, "history")), false);
  assert.equal(existsSync(join(privateDirs.sessionRoot, "workspace")), false);
  assert.equal(existsSync(join(privateDirs.sessionRoot, "branches")), false);
  assert.equal(existsSync(join(privateDirs.recordsDir, "session.json")), false);
  assert.equal(existsSync(join(privateDirs.recordsDir, "lineage.jsonl")), false);
  assert.equal(existsSync(join(privateDirs.recordsDir, "deleted.json")), true);
  assert.equal(existsSync(join(publicDirs.sessionRoot, "history")), true);
  assert.equal(existsSync(join(publicDirs.sessionRoot, "workspace")), true);
  assert.equal(existsSync(join(futureDirs.sessionRoot, "history")), true);

  const second = hardDeleteExpiredPrivateSessions(
    dataDir,
    new Date("2026-06-25T00:00:00.000Z")
  );
  assert.equal(second.deleted.length, 0);
  assert.equal(existsSync(join(privateDirs.recordsDir, "deleted.json")), true);
});
