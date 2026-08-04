import { existsSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { writeJsonAtomic } from "../core/data-dir.js";

export interface DeletedSessionRecord {
  schemaVersion: 1;
  recordType: "deleted-session";
  sessionId: string;
  deletedAt: string;
  reason?:
    | "user_deleted"
    | "user_permanently_deleted"
    | "trash_retention_expired"
    | "private_retention_expired";
  /** Root Delete action that attached this conversation to the same Trash item. */
  cascadeRootSessionId?: string;
}

export const TRASH_RETENTION_DAYS = 30;

export function deletedSessionDueAt(deletedAt: string): string | null {
  const time = Date.parse(deletedAt);
  if (Number.isNaN(time)) return null;
  return new Date(time + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
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
    cascadeRootSessionId?: string;
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
    ...(options.cascadeRootSessionId
      ? { cascadeRootSessionId: options.cascadeRootSessionId }
      : {}),
  };
  writeJsonAtomic(join(recordsDir, "deleted.json"), record);
  return record;
}

export function removeDeletedSessionRecord(recordsDir: string): void {
  const path = join(recordsDir, "deleted.json");
  if (existsSync(path)) unlinkSync(path);
}
