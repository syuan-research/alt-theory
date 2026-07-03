import { appendFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

export type RunStatus =
  | "accepted"
  | "completed"
  | "failed"
  | "interrupted"
  | "aborted"
  | "deleted"
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

function runsPath(recordsDir: string): string {
  return join(recordsDir, "runs.jsonl");
}
