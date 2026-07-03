import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  appendRunRecord,
  latestRunSnapshots,
  readRunRecords,
} from "./run-records.js";

test("run records retain append-only status and supersession snapshots", () => {
  const recordsDir = mkdtempSync(join(tmpdir(), "alt-theory-runs-"));
  const base = {
    sessionId: "session",
    branchId: "main",
    turnId: "turn-000001",
    revisionId: "rev-000001",
    runId: "run-000001",
    piSessionFile: "history/main.jsonl",
    userEntryId: null,
    assistantEntryIds: [],
    supersedesRunId: null,
    acceptedAt: "2026-06-14T00:00:00.000Z",
    completedAt: null,
  };
  appendRunRecord(recordsDir, { ...base, status: "accepted" });
  appendRunRecord(recordsDir, {
    ...base,
    status: "completed",
    userEntryId: "user-1",
    assistantEntryIds: ["assistant-1"],
    completedAt: "2026-06-14T00:00:01.000Z",
  });
  appendRunRecord(recordsDir, {
    ...base,
    status: "superseded",
    userEntryId: "user-1",
    assistantEntryIds: ["assistant-1"],
    completedAt: "2026-06-14T00:00:02.000Z",
  });

  assert.equal(readRunRecords(recordsDir).length, 3);
  assert.equal(latestRunSnapshots(recordsDir)[0].status, "superseded");
});
