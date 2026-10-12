import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readV4SessionHeader } from "./session-records.js";

test("retired root help marker is ignored without changing the stored record", () => {
  const dir = mkdtempSync(join(tmpdir(), "records-retired-root-"));
  const raw = { schemaVersion: 1, recordType: "session", sessionId: "root", helper: true };
  writeFileSync(join(dir, "session.json"), JSON.stringify(raw));
  const header = readV4SessionHeader(dir);
  assert.equal(header?.sessionId, "root");
  assert.equal(header?.forkedFrom, undefined);
  assert.equal((header as any).helper, undefined);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "session.json"), "utf8")), raw);
});

test("readV4SessionHeader normalizes legacy fork purposes", () => {
  const cases: Array<[string, string]> = [
    ["collaboration", "side"],
    ["comparison", "ab-arm"],
    ["helper", "side"],
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
        recordModel: "v0.4",
        forkedFrom: { sessionId: "parent", purpose: stored },
      })
    );
    assert.equal(readV4SessionHeader(dir)?.forkedFrom?.purpose, expected);
    if (stored === "helper") {
      assert.equal(readV4SessionHeader(dir)?.forkedFrom?.listed, true);
    }
  }
});

test("readV4SessionHeader reads retired modes as work", () => {
  // Retired values (v1-alpha pure/full, Understand) open as work; only
  // read-only stays read-only (owner 2026-09-25).
  const cases: Array<[string, string]> = [
    ["pure", "work"],
    ["full", "work"],
    ["understand", "work"],
    ["read-only", "read-only"],
    ["work", "work"],
  ];
  for (const [stored, expected] of cases) {
    const dir = mkdtempSync(join(tmpdir(), "records-"));
    writeFileSync(
      join(dir, "session.json"),
      JSON.stringify({
        schemaVersion: 1,
        recordType: "session",
        sessionId: "s-mode",
        createdAt: "2026-07-16T00:00:00.000Z",
        recordModel: "v0.4",
        mode: stored,
      })
    );
    assert.equal(readV4SessionHeader(dir)?.mode, expected);
  }
});

test("readV4SessionHeader reads the hosted vocabulary as the marker the app showed", () => {
  const cases: Array<[string, string]> = [
    ["research", "exportable"],
    ["private", "no-export"],
    ["exportable", "exportable"],
    ["no-export", "no-export"],
  ];
  for (const [stored, expected] of cases) {
    const dir = mkdtempSync(join(tmpdir(), "records-"));
    writeFileSync(
      join(dir, "session.json"),
      JSON.stringify({
        schemaVersion: 1,
        recordType: "session",
        sessionId: "s-visibility",
        createdAt: "2026-07-16T00:00:00.000Z",
        recordModel: "v0.4",
        visibility: stored,
      })
    );
    assert.equal(readV4SessionHeader(dir)?.visibility, expected);
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
