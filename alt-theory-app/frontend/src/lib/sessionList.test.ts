import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionSummary } from "../api/types.ts";
import { sessionTitle } from "./sessionList.ts";

function child(
  sessionId: string,
  parentId: string,
  purpose: "fork" | "side" | "helper" | "worker",
  createdAt: string,
): SessionSummary {
  return {
    sessionId,
    projectId: null,
    ownerAccountId: null,
    roleCondition: null,
    visibility: "research",
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    status: "available",
    rolePresetSlug: null,
    kbDomain: null,
    provider: null,
    model: null,
    messageCount: 1,
    turnCount: 1,
    hasManifest: true,
    hasSessionFile: true,
    recordModel: "v0.4",
    warnings: [],
    forkedFrom: { sessionId: parentId, purpose },
    studyTag: null,
    workspacePrimaryDir: null,
  };
}

test("branch prefix is English 'Branch N · title', not a rename to branch1", () => {
  const a = child("a", "parent", "fork", "2026-07-01T00:00:00.000Z");
  const b = child("b", "parent", "fork", "2026-07-02T00:00:00.000Z");
  const all = [b, a];
  const names = {
    a: { alias: "", snippet: "Map-level notes on theory" },
    b: { alias: "", snippet: "Map-level notes on theory" },
  };
  assert.equal(
    sessionTitle(a, names, all),
    "Branch 1 · Map-level notes on theory",
  );
  assert.equal(
    sessionTitle(b, names, all),
    "Branch 2 · Map-level notes on theory",
  );
});

test("btw and helper get BTW N / Helper N prefixes", () => {
  const btw = child("s", "parent", "side", "2026-07-01T00:00:00.000Z");
  const help = child("h", "parent", "helper", "2026-07-01T00:00:00.000Z");
  assert.equal(
    sessionTitle(btw, { s: { alias: "", snippet: "What is a skill?" } }, [btw]),
    "BTW 1 · What is a skill?",
  );
  assert.equal(
    sessionTitle(
      help,
      { h: { alias: "", snippet: "How do I add a provider?" } },
      [help],
    ),
    "Helper 1 · How do I add a provider?",
  );
});

test("worker keeps custom name under Worker N prefix", () => {
  const w = child("w", "parent", "worker", "2026-07-01T00:00:00.000Z");
  assert.equal(
    sessionTitle(w, { w: { alias: "Cite check", snippet: "" } }, [w]),
    "Worker 1 · Cite check",
  );
});

test("does not double-prefix when base is already only the marker", () => {
  const w = child("w", "parent", "worker", "2026-07-01T00:00:00.000Z");
  assert.equal(
    sessionTitle(w, { w: { alias: "Worker 1", snippet: "" } }, [w]),
    "Worker 1",
  );
});

test("user alias is kept under the prefix (prefix ≠ rename)", () => {
  const a = child("a", "parent", "fork", "2026-07-01T00:00:00.000Z");
  assert.equal(
    sessionTitle(a, { a: { alias: "My rename", snippet: "" } }, [a]),
    "Branch 1 · My rename",
  );
});
