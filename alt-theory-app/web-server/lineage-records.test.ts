import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  addAndActivateBranch,
  allocateBranchId,
  appendRunRecord,
  latestRunSnapshots,
  readRunRecords,
  updateBranchHead,
} from "./lineage-records.js";
import {
  readBranchIndex,
  writeBranchIndex,
  type BranchIndexRecord,
} from "./session-records.js";

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

test("branch records allocate, activate, and update explicit fork heads", () => {
  const recordsDir = mkdtempSync(join(tmpdir(), "alt-theory-branches-"));
  mkdirSync(recordsDir, { recursive: true });
  const initial: BranchIndexRecord = {
    schemaVersion: 1,
    recordType: "branch-index",
    activeBranchId: "main",
    branches: [{
      branchId: "main",
      parentBranchId: null,
      forkPointEntryId: null,
      forkPointTurnId: null,
      purpose: "main",
      workspaceMode: "shared",
      workspaceRef: "workspace",
      activePiSessionFile: "history/main.jsonl",
      activeLeafEntryId: "leaf-main",
      createdAt: "2026-06-14T00:00:00.000Z",
    }],
  };
  writeBranchIndex(recordsDir, initial);
  assert.equal(allocateBranchId(initial), "fork-001");
  addAndActivateBranch(recordsDir, {
    branchId: "fork-001",
    parentBranchId: "main",
    forkPointEntryId: "entry-1",
    forkPointTurnId: "turn-000001",
    purpose: "comparison",
    workspaceMode: "copied",
    workspaceRef: "branches/fork-001/workspace",
    activePiSessionFile: "history/fork.jsonl",
    activeLeafEntryId: "entry-1",
    createdAt: "2026-06-14T00:00:01.000Z",
  });
  updateBranchHead(recordsDir, "fork-001", {
    activePiSessionFile: "history/fork.jsonl",
    activeLeafEntryId: "leaf-fork",
  });

  const result = readBranchIndex(recordsDir)!;
  assert.equal(result.activeBranchId, "fork-001");
  assert.equal(result.branches[1].activeLeafEntryId, "leaf-fork");
});
