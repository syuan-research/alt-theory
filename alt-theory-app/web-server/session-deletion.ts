import { existsSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync } from "fs";
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
  /** Display title at permanent deletion — the only name its kept files have left. */
  title?: string;
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
    title?: string;
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
    ...(options.title ? { title: options.title } : {}),
  };
  writeJsonAtomic(join(recordsDir, "deleted.json"), record);
  return record;
}

export function removeDeletedSessionRecord(recordsDir: string): void {
  const path = join(recordsDir, "deleted.json");
  if (existsSync(path)) unlinkSync(path);
}

export interface KeptFile {
  /** Path inside workspace/, forward slashes. */
  path: string;
  /** uploads/ = what the user attached; everything else the agent wrote. */
  section: "product" | "attachment";
  size: number;
  updatedAt: string;
}

/**
 * The files a conversation's own folder holds that are worth a decision:
 * agent output and the user's attachments. extracted/ is derived text that
 * can always be rebuilt, so it never counts.
 */
export function listKeptFiles(workspaceDir: string): KeptFile[] {
  const files: KeptFile[] = [];
  if (!existsSync(workspaceDir)) return files;
  // ponytail: sync walk of every file; fine for per-conversation folders, move
  // to an async walker if someone keeps thousands of files in one.
  const visit = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (rel === "extracted") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full, rel);
        continue;
      }
      if (!entry.isFile() || rel.endsWith(".extract-error.json")) continue;
      const stats = statSync(full);
      files.push({
        path: rel,
        section: rel.startsWith("uploads/") ? "attachment" : "product",
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
      });
    }
  };
  visit(workspaceDir, "");
  return files;
}

/**
 * After a permanent delete: drop the derived text, then the whole folder
 * (tombstone included) when nothing worth keeping is left.
 */
export function removeFolderIfNothingKept(sessionRoot: string): boolean {
  const workspaceDir = join(sessionRoot, "workspace");
  rmSync(join(workspaceDir, "extracted"), { recursive: true, force: true });
  if (listKeptFiles(workspaceDir).length > 0) return false;
  rmSync(sessionRoot, { recursive: true, force: true });
  return true;
}
