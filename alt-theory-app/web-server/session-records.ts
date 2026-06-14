import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import type { AssemblyManifest } from "../core/alt-theory-core.js";
import { writeJsonAtomic } from "../core/data-dir.js";

export const V4_SCHEMA_VERSION = 1;

export interface RecordEnvelope {
  schemaVersion: 1;
  recordType: string;
}

export interface V4SessionHeader extends RecordEnvelope {
  recordType: "session";
  sessionId: string;
  createdAt: string;
  activeBranchId: "main";
  recordModel: "v0.4";
}

export interface BranchRecord {
  branchId: string;
  parentBranchId: string | null;
  forkPointEntryId: string | null;
  forkPointTurnId: string | null;
  purpose: "main" | "collaboration" | "comparison";
  workspaceMode: "shared" | "copied";
  workspaceRef: string;
  activePiSessionFile: string | null;
  activeLeafEntryId: string | null;
  createdAt: string;
}

export interface BranchIndexRecord extends RecordEnvelope {
  recordType: "branch-index";
  activeBranchId: "main";
  branches: BranchRecord[];
}

export function writeFoundationRecords(args: {
  sessionRoot: string;
  recordsDir: string;
  manifest: AssemblyManifest;
}): { session: V4SessionHeader; branchIndex: BranchIndexRecord } {
  const createdAt = args.manifest.createdAt ?? new Date().toISOString();
  const session: V4SessionHeader = {
    schemaVersion: V4_SCHEMA_VERSION,
    recordType: "session",
    sessionId: args.manifest.sessionId,
    createdAt,
    activeBranchId: "main",
    recordModel: "v0.4",
  };
  const branchIndex: BranchIndexRecord = {
    schemaVersion: V4_SCHEMA_VERSION,
    recordType: "branch-index",
    activeBranchId: "main",
    branches: [
      {
        branchId: "main",
        parentBranchId: null,
        forkPointEntryId: null,
        forkPointTurnId: null,
        purpose: "main",
        workspaceMode: "shared",
        workspaceRef: resolveMainWorkspace(args.sessionRoot),
        activePiSessionFile: args.manifest.piSessionFile ?? null,
        activeLeafEntryId: null,
        createdAt,
      },
    ],
  };

  writeJsonAtomic(join(args.recordsDir, "session.json"), session);
  writeJsonAtomic(join(args.recordsDir, "branch-index.json"), branchIndex);
  return { session, branchIndex };
}

export function resolveMainWorkspace(sessionRoot: string): string {
  return resolve(sessionRoot, "workspace");
}

export function resolveBranchWorkspace(
  sessionRoot: string,
  branchId: string
): string {
  return branchId === "main"
    ? resolveMainWorkspace(sessionRoot)
    : resolve(sessionRoot, "branches", branchId, "workspace");
}

export function readV4SessionHeader(recordsDir: string): V4SessionHeader | null {
  const path = join(recordsDir, "session.json");
  const header = readJson<V4SessionHeader>(path);
  if (
    header?.schemaVersion === V4_SCHEMA_VERSION &&
    header.recordType === "session"
  ) {
    return header;
  }
  return null;
}

export function readBranchIndex(recordsDir: string): BranchIndexRecord | null {
  const path = join(recordsDir, "branch-index.json");
  const record = readJson<BranchIndexRecord>(path);
  if (
    record?.schemaVersion === V4_SCHEMA_VERSION &&
    record.recordType === "branch-index"
  ) {
    return record;
  }
  return null;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}
