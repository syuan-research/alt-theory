import { appendFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  readBranchIndex,
  readV4SessionHeader,
  writeBranchIndex,
  writeSessionHeader,
  type BranchIndexRecord,
  type BranchRecord,
} from "./session-records.js";

export type RunStatus =
  | "accepted"
  | "completed"
  | "failed"
  | "interrupted"
  | "aborted"
  | "superseded";

export interface RunRecord {
  schemaVersion: 1;
  recordType: "run";
  sessionId: string;
  branchId: string;
  turnId: string;
  revisionId: string;
  runId: string;
  status: RunStatus;
  piSessionFile: string | null;
  userEntryId: string | null;
  assistantEntryIds: string[];
  supersedesRunId: string | null;
  acceptedAt: string;
  completedAt: string | null;
}

export function appendRunRecord(
  recordsDir: string,
  record: Omit<RunRecord, "schemaVersion" | "recordType">
): RunRecord {
  const value: RunRecord = {
    schemaVersion: 1,
    recordType: "run",
    ...record,
  };
  appendFileSync(runsPath(recordsDir), `${JSON.stringify(value)}\n`, "utf-8");
  return value;
}

export function readRunRecords(recordsDir: string): RunRecord[] {
  const path = runsPath(recordsDir);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunRecord)
    .filter(
      (record) =>
        record.schemaVersion === 1 && record.recordType === "run"
    );
}

export function latestRunSnapshots(recordsDir: string): RunRecord[] {
  const latest = new Map<string, RunRecord>();
  for (const record of readRunRecords(recordsDir)) {
    latest.set(record.runId, record);
  }
  return [...latest.values()];
}

export function allocateBranchId(branchIndex: BranchIndexRecord): string {
  const used = new Set(branchIndex.branches.map((branch) => branch.branchId));
  let index = 1;
  while (used.has(`fork-${String(index).padStart(3, "0")}`)) index++;
  return `fork-${String(index).padStart(3, "0")}`;
}

export function addAndActivateBranch(
  recordsDir: string,
  branch: BranchRecord
): BranchIndexRecord {
  const current = requireBranchIndex(recordsDir);
  if (current.branches.some((item) => item.branchId === branch.branchId)) {
    throw new Error(`Branch already exists: ${branch.branchId}`);
  }
  const updated: BranchIndexRecord = {
    ...current,
    activeBranchId: branch.branchId,
    branches: [...current.branches, branch],
  };
  writeBranchIndex(recordsDir, updated);
  const session = readV4SessionHeader(recordsDir);
  if (session) {
    writeSessionHeader(recordsDir, {
      ...session,
      activeBranchId: branch.branchId,
    });
  }
  return updated;
}

export function updateBranchHead(
  recordsDir: string,
  branchId: string,
  values: Pick<BranchRecord, "activePiSessionFile" | "activeLeafEntryId">
): BranchIndexRecord {
  const current = requireBranchIndex(recordsDir);
  let found = false;
  const updated: BranchIndexRecord = {
    ...current,
    branches: current.branches.map((branch) => {
      if (branch.branchId !== branchId) return branch;
      found = true;
      return { ...branch, ...values };
    }),
  };
  if (!found) throw new Error(`Unknown branch: ${branchId}`);
  writeBranchIndex(recordsDir, updated);
  return updated;
}

function requireBranchIndex(recordsDir: string): BranchIndexRecord {
  const branchIndex = readBranchIndex(recordsDir);
  if (!branchIndex) {
    throw new Error("v0.4 branch index is required");
  }
  return branchIndex;
}

function runsPath(recordsDir: string): string {
  return join(recordsDir, "runs.jsonl");
}
