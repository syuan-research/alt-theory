import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readSessionAccessSummary } from "./session-store.js";

test("the list snippet is stored on the header and recomputed only when the branch leaf moves", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-theory-snippet-"));
  const root = join(dataDir, "sessions", "s1");
  const records = join(root, "records");
  const historyFile = join(root, "history", "session.jsonl");
  mkdirSync(join(root, "history"), { recursive: true });
  mkdirSync(records, { recursive: true });
  writeFileSync(join(records, "session.json"), JSON.stringify({
    schemaVersion: 1, recordType: "session", sessionId: "s1", createdAt: "2026-09-26T00:00:00.000Z", recordModel: "v0.4",
  }));
  const message = (id: string, parentId: string | null, role: "user" | "assistant", text: string) => JSON.stringify({
    type: "message", id, parentId, timestamp: "2026-09-26T00:00:00.000Z",
    message: { role, content: [{ type: "text", text }], timestamp: 0 },
  }) + "\n";
  const run = (runId: string, status: string, userEntryId: string, assistantEntryIds: string[]) => JSON.stringify({
    schemaVersion: 1, recordType: "run", runId, status, userEntryId, assistantEntryIds, acceptedAt: "2026-09-26T00:00:00.000Z",
  }) + "\n";
  const header = () => JSON.parse(readFileSync(join(records, "session.json"), "utf-8"));

  writeFileSync(historyFile, JSON.stringify({ type: "session", version: 3, id: "s1", timestamp: "2026-09-26T00:00:00.000Z", cwd: dataDir }) + "\n"
    + message("u1", null, "user", "访谈编码") + message("a1", "u1", "assistant", "memo"));
  writeFileSync(join(records, "runs.jsonl"), run("run-1", "completed", "u1", ["a1"]));

  assert.equal(readSessionAccessSummary(dataDir, "s1")?.snippet, "访谈编码");
  assert.equal(header().snippet, "访谈编码");
  assert.equal(header().snippetLeafId, "a1");

  // Same leaf: the header answers; the history is not read again.
  writeFileSync(historyFile, readFileSync(historyFile, "utf-8").replace("访谈编码", "changed on disk"));
  assert.equal(readSessionAccessSummary(dataDir, "s1")?.snippet, "访谈编码");

  // First turn revised: a sibling user entry becomes the branch; the snippet
  // follows the visible branch, not file order.
  appendFileSync(historyFile, message("u2", null, "user", "revised first question") + message("a2", "u2", "assistant", "answer"));
  appendFileSync(join(records, "runs.jsonl"), run("run-1", "superseded", "u1", ["a1"]) + run("run-2", "completed", "u2", ["a2"]));
  assert.equal(readSessionAccessSummary(dataDir, "s1")?.snippet, "revised first question");
  assert.equal(header().snippetLeafId, "a2");
});
