import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "fs";
import { join, resolve } from "path";
import {
  resolveSessionRoot,
  resolveSessionsRoot,
} from "../core/data-dir.js";
import {
  readV4SessionHeader,
  writeSessionHeader,
  type V4SessionHeader,
} from "./session-records.js";
import {
  writeDeletedSessionRecord,
  type DeletedSessionRecord,
} from "./session-deletion.js";

const PRIVATE_RETENTION_DAYS = 7;

export interface PrivateRetentionCleanupResult {
  scanned: number;
  deleted: DeletedSessionRecord[];
  skipped: Array<{ sessionId: string; reason: string }>;
}

export function calculateRetentionDueAt(lastActivityAt: string): string {
  const activityTime = Date.parse(lastActivityAt);
  if (Number.isNaN(activityTime)) {
    throw new Error(`Invalid lastActivityAt timestamp: ${lastActivityAt}`);
  }
  return new Date(
    activityTime + PRIVATE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
}

export function refreshRetention(
  session: V4SessionHeader,
  now: Date = new Date()
): V4SessionHeader {
  if (session.visibility !== "private") {
    return {
      ...session,
      retentionDueAt: null,
    };
  }
  const lastActivityAt = now.toISOString();
  return {
    ...session,
    consentSnapshot: {
      researcherReadable: session.consentSnapshot?.researcherReadable ?? false,
      quoteAfterAnonymization:
        session.consentSnapshot?.quoteAfterAnonymization ?? false,
      privateOverride: true,
    },
    lastActivityAt,
    retentionDueAt: calculateRetentionDueAt(lastActivityAt),
  };
}

export function refreshSessionRetention(
  recordsDir: string,
  now: Date = new Date()
): V4SessionHeader | null {
  const session = readV4SessionHeader(recordsDir);
  if (!session) return null;
  const refreshed = refreshRetention(session, now);
  writeSessionHeader(recordsDir, refreshed);
  return refreshed;
}

export function hardDeleteExpiredPrivateSessions(
  dataDir: string,
  now: Date = new Date()
): PrivateRetentionCleanupResult {
  const sessionsRoot = resolveSessionsRoot(dataDir);
  const result: PrivateRetentionCleanupResult = {
    scanned: 0,
    deleted: [],
    skipped: [],
  };
  if (!existsSync(sessionsRoot)) return result;

  for (const entry of readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    result.scanned++;
    const sessionId = entry.name;
    const sessionRoot = resolveSessionRoot(dataDir, sessionId);
    if (!sessionRoot || !existsSync(sessionRoot)) {
      result.skipped.push({ sessionId, reason: "invalid-session-root" });
      continue;
    }
    const recordsDir = join(sessionRoot, "records");
    const session = readV4SessionHeader(recordsDir);
    if (!session) {
      result.skipped.push({ sessionId, reason: "missing-v4-session" });
      continue;
    }
    if (session.visibility !== "private") {
      result.skipped.push({ sessionId, reason: "not-private" });
      continue;
    }
    if (!session.retentionDueAt) {
      result.skipped.push({ sessionId, reason: "missing-retention-due-at" });
      continue;
    }
    const dueTime = Date.parse(session.retentionDueAt);
    if (Number.isNaN(dueTime)) {
      result.skipped.push({ sessionId, reason: "invalid-retention-due-at" });
      continue;
    }
    if (dueTime > now.getTime()) {
      result.skipped.push({ sessionId, reason: "not-yet-due" });
      continue;
    }
    result.deleted.push(hardDeletePrivateSession(sessionRoot, sessionId, now));
  }

  return result;
}

function hardDeletePrivateSession(
  sessionRoot: string,
  sessionId: string,
  now: Date
): DeletedSessionRecord {
  const resolvedRoot = resolve(sessionRoot);
  const recordsDir = join(resolvedRoot, "records");
  mkdirSync(recordsDir, { recursive: true });

  for (const name of ["history", "workspace", "branches"]) {
    rmSync(join(resolvedRoot, name), { recursive: true, force: true });
  }
  for (const entry of readdirSync(recordsDir, { withFileTypes: true })) {
    if (entry.name === "deleted.json") continue;
    rmSync(join(recordsDir, entry.name), { recursive: true, force: true });
  }

  return writeDeletedSessionRecord(recordsDir, sessionId, {
    deletedAt: now.toISOString(),
    reason: "private_retention_expired",
  });
}
