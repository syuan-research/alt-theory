import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { writeJsonAtomic } from "../core/data-dir.js";

export interface DeletedSessionRecord {
  schemaVersion: 1;
  recordType: "deleted-session";
  sessionId: string;
  deletedAt: string;
  reason?: "user_deleted" | "private_retention_expired";
}

export function readDeletedSessionRecord(
  recordsDir: string
): DeletedSessionRecord | null {
  const path = join(recordsDir, "deleted.json");
  if (!existsSync(path)) return null;
  try {
    const record = JSON.parse(
      readFileSync(path, "utf-8")
    ) as DeletedSessionRecord;
    return record.schemaVersion === 1 &&
      record.recordType === "deleted-session"
      ? record
      : null;
  } catch {
    return null;
  }
}

export function writeDeletedSessionRecord(
  recordsDir: string,
  sessionId: string,
  options: {
    deletedAt?: string;
    reason?: DeletedSessionRecord["reason"];
  } = {}
): DeletedSessionRecord {
  const existing = readDeletedSessionRecord(recordsDir);
  if (existing) return existing;
  const record: DeletedSessionRecord = {
    schemaVersion: 1,
    recordType: "deleted-session",
    sessionId,
    deletedAt: options.deletedAt ?? new Date().toISOString(),
    ...(options.reason ? { reason: options.reason } : {}),
  };
  writeJsonAtomic(join(recordsDir, "deleted.json"), record);
  return record;
}
