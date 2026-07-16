import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readV4SessionHeader } from "./session-records.js";

test("readV4SessionHeader normalizes legacy fork purposes", () => {
  const cases: Array<[string, string]> = [
    ["collaboration", "side"],
    ["comparison", "ab-arm"],
    ["helper", "helper"],
    ["fork", "fork"],
  ];
  for (const [stored, expected] of cases) {
    const dir = mkdtempSync(join(tmpdir(), "records-"));
    writeFileSync(
      join(dir, "session.json"),
      JSON.stringify({
        schemaVersion: 1,
        recordType: "session",
        sessionId: "s1",
        createdAt: "2026-07-16T00:00:00.000Z",
        projectId: null,
        recordModel: "v0.4",
        forkedFrom: { sessionId: "parent", purpose: stored },
      })
    );
    assert.equal(readV4SessionHeader(dir)?.forkedFrom?.purpose, expected);
  }
});

test("readV4SessionHeader passes studyTag and modelOverride through", () => {
  const dir = mkdtempSync(join(tmpdir(), "records-"));
  writeFileSync(
    join(dir, "session.json"),
    JSON.stringify({
      schemaVersion: 1,
      recordType: "session",
      sessionId: "s2",
      createdAt: "2026-07-16T00:00:00.000Z",
      projectId: null,
      recordModel: "v0.4",
      studyTag: { studyId: "pilot-1", batch: "b2" },
      modelOverride: {
        provider: "anthropic",
        modelId: "claude-sonnet-5",
        thinkingLevel: "low",
      },
    })
  );
  const header = readV4SessionHeader(dir);
  assert.deepEqual(header?.studyTag, { studyId: "pilot-1", batch: "b2" });
  assert.deepEqual(header?.modelOverride, {
    provider: "anthropic",
    modelId: "claude-sonnet-5",
    thinkingLevel: "low",
  });
});
