import assert from "node:assert/strict";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import {
  appendAbComparisonRecord,
  readAbComparisonRecords,
} from "./ab-records.js";

test("A/B comparison records retain candidates, scores, and Pi artifact pointers", () => {
  const recordsDir = mkdtempSync(join(tmpdir(), "alt-theory-ab-"));

  const record = appendAbComparisonRecord(recordsDir, {
    sessionId: "session-1",
    trigger: "pi_subagents",
    promptEntryId: "entry-user",
    selectedCandidateId: "b",
    candidates: [
      {
        candidateId: "a",
        provider: "anthropic",
        model: "claude-sonnet-4",
        role: "mentor-a",
        outputText: "Answer A",
        artifact: {
          runId: "sub-run",
          resultFile: ".pi-subagents/results/sub-run.json",
          eventsFile: ".pi-subagents/async/sub-run/events.jsonl",
        },
      },
      {
        candidateId: "b",
        provider: "openai",
        model: "gpt-5-mini",
        role: "mentor-b",
        instructionRef: "default",
        kbDomain: "all",
        outputText: "Answer B",
      },
    ],
    scores: [
      { candidateId: "a", metric: "clarity", value: 3 },
      { candidateId: "b", metric: "clarity", value: 5 },
    ],
    source: {
      package: "pi-subagents",
      artifactVersion: 1,
      runId: "sub-run",
    },
  });

  assert.equal(record.recordType, "ab-comparison");
  assert.equal(record.selectedCandidateId, "b");
  assert.equal(readAbComparisonRecords(recordsDir).length, 1);
  assert.equal(
    readAbComparisonRecords(recordsDir)[0].candidates[0].artifact?.eventsFile,
    ".pi-subagents/async/sub-run/events.jsonl"
  );
});

test("A/B comparison records reject scores for unknown candidates", () => {
  const recordsDir = mkdtempSync(join(tmpdir(), "alt-theory-ab-"));

  assert.throws(
    () =>
      appendAbComparisonRecord(recordsDir, {
        sessionId: "session-1",
        trigger: "manual",
        candidates: [{ candidateId: "a" }],
        scores: [{ candidateId: "missing", metric: "quality", value: 1 }],
      }),
    /score candidateId/
  );
});
