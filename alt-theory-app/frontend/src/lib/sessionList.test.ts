import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionSummary } from "../api/types.ts";
import { buildWorkspaceTree, canTakeMainline, isFamilyHead, relatedConversationsFor, sessionTitle } from "./sessionList.ts";

function child(
  sessionId: string,
  parentId: string,
  purpose: "fork" | "side" | "helper" | "subagent",
  createdAt: string,
): SessionSummary {
  return {
    sessionId,
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

test("branch prefix is a token path 'brN · title', not a rename to branch1", () => {
  const a = child("a", "parent", "fork", "2026-07-01T00:00:00.000Z");
  const b = child("b", "parent", "fork", "2026-07-02T00:00:00.000Z");
  const all = [b, a];
  const names = {
    a: { alias: "", snippet: "Map-level notes on theory" },
    b: { alias: "", snippet: "Map-level notes on theory" },
  };
  assert.equal(sessionTitle(a, names, all), "br1 · Map-level notes on theory");
  assert.equal(sessionTitle(b, names, all), "br2 · Map-level notes on theory");
});

test("btw and helper get btwN / hN prefixes", () => {
  const btw = child("s", "parent", "side", "2026-07-01T00:00:00.000Z");
  const help = child("h", "parent", "helper", "2026-07-01T00:00:00.000Z");
  assert.equal(
    sessionTitle(btw, { s: { alias: "", snippet: "What is a skill?" } }, [btw]),
    "btw1 · What is a skill?",
  );
  assert.equal(
    sessionTitle(
      help,
      { h: { alias: "", snippet: "How do I add a provider?" } },
      [help],
    ),
    "h1 · How do I add a provider?",
  );
});

test("subagent keeps custom name under saN prefix", () => {
  const w = child("w", "parent", "subagent", "2026-07-01T00:00:00.000Z");
  assert.equal(
    sessionTitle(w, { w: { alias: "Cite check", snippet: "" } }, [w]),
    "sa1 · Cite check",
  );
});

test("server lineageMarker wins: multi-level path names every depth", () => {
  const nested = child("n", "b1", "side", "2026-07-05T00:00:00.000Z");
  nested.lineagePath = ["root", "b1"];
  nested.lineageMarker = "br1-btw2";
  assert.equal(
    sessionTitle(nested, { n: { alias: "", snippet: "Side quest" } }, [nested]),
    "br1-btw2 · Side quest",
  );
  // A stale machine-token alias (old or new form) collapses to the marker.
  assert.equal(
    sessionTitle(nested, { n: { alias: "BTW 2", snippet: "" } }, [nested]),
    "br1-btw2",
  );
});

test("does not double-prefix when base is already only the marker", () => {
  const w = child("w", "parent", "subagent", "2026-07-01T00:00:00.000Z");
  assert.equal(
    sessionTitle(w, { w: { alias: "Subagent 1", snippet: "" } }, [w]),
    "sa1",
  );
});

test("user alias is kept under the prefix (prefix ≠ rename)", () => {
  const a = child("a", "parent", "fork", "2026-07-01T00:00:00.000Z");
  assert.equal(
    sessionTitle(a, { a: { alias: "My rename", snippet: "" } }, [a]),
    "br1 · My rename",
  );
});

test("a deleted middle branch never splinters root from grandchildren", () => {
  const root = {
    ...child("root", "unused", "fork", "2026-06-30T00:00:00.000Z"),
    forkedFrom: null,
  } as SessionSummary;
  // "mid" was deleted: absent from the list data, but the server lineage
  // still records the chain through it.
  const grand = child("grand", "mid", "fork", "2026-07-02T00:00:00.000Z");
  grand.lineagePath = ["root", "mid"];

  const tree = buildWorkspaceTree([root, grand], []);
  const roots = tree.groups.flatMap((g) => g.roots.map((r) => r.sessionId));
  assert.deepEqual(roots, ["root"]);
  assert.deepEqual(
    (tree.childrenByParent.get("root") ?? []).map((s) => s.sessionId),
    ["grand"],
  );
});

test("deleted mainline: oldest branch heads the family, others nest under it", () => {
  const b1 = child("b1", "gone", "fork", "2026-07-01T00:00:00.000Z");
  const b2 = child("b2", "gone", "fork", "2026-07-02T00:00:00.000Z");
  const btw = child("btw", "gone", "side", "2026-07-03T00:00:00.000Z");
  btw.forkedFrom = { ...btw.forkedFrom!, listed: true };
  // A lone orphan from another purged family keeps its own row.
  const solo = child("solo", "also-gone", "fork", "2026-07-04T00:00:00.000Z");

  const tree = buildWorkspaceTree([solo, b2, b1, btw], []);
  const roots = tree.groups.flatMap((g) => g.roots.map((r) => r.sessionId));
  assert.deepEqual(roots.sort(), ["b1", "solo"]);
  assert.deepEqual(
    (tree.childrenByParent.get("b1") ?? []).map((s) => s.sessionId).sort(),
    ["b2", "btw"],
  );
});

test("rootless family: the crown re-heads the orphan group", () => {
  const b1 = child("b1", "gone", "fork", "2026-07-01T00:00:00.000Z");
  const b2 = child("b2", "gone", "fork", "2026-07-02T00:00:00.000Z");
  // Default head = oldest branch, so only the other one gets the crown.
  assert.equal(canTakeMainline(b1, [b1, b2]), false);
  assert.equal(canTakeMainline(b2, [b1, b2]), true);
  // Promoting b2 anchors it as head: crown swaps sides, list head follows.
  b2.forkedFrom = { ...b2.forkedFrom!, listed: true };
  assert.equal(canTakeMainline(b2, [b1, b2]), false);
  assert.equal(canTakeMainline(b1, [b1, b2]), true);
  const tree = buildWorkspaceTree([b1, b2], []);
  assert.deepEqual(
    tree.groups.flatMap((g) => g.roots.map((r) => r.sessionId)),
    ["b2"],
  );
  assert.deepEqual(
    (tree.childrenByParent.get("b2") ?? []).map((s) => s.sessionId),
    ["b1"],
  );
});

test("promoting a branch-of-branch keeps the family visible (rooted nested promote)", () => {
  const main = {
    ...child("main", "unused", "fork", "2026-06-30T00:00:00.000Z"),
    forkedFrom: null,
    delisted: true,
    delistedFor: "c",
  } as SessionSummary;
  const b1 = child("b1", "main", "fork", "2026-07-01T00:00:00.000Z");
  const b2 = child("b2", "main", "fork", "2026-07-02T00:00:00.000Z");
  const c = child("c", "b1", "fork", "2026-07-03T00:00:00.000Z");
  c.forkedFrom = { ...c.forkedFrom!, listed: true };

  const tree = buildWorkspaceTree([main, b1, b2, c], []);
  const roots = tree.groups.flatMap((g) => g.roots.map((r) => r.sessionId));
  // The successor heads the family; the demoted root nests under it and the
  // rest hang off the root as before. The family must never vanish.
  assert.deepEqual(roots, ["c"]);
  assert.deepEqual(
    (tree.childrenByParent.get("c") ?? []).map((s) => s.sessionId),
    ["main"],
  );
});

test("a third-level branch can head a rootless family", () => {
  const b1 = child("b1", "gone", "fork", "2026-07-01T00:00:00.000Z");
  const b2 = child("b2", "gone", "fork", "2026-07-02T00:00:00.000Z");
  const c = child("c", "b1", "fork", "2026-07-03T00:00:00.000Z");

  // b1 heads by default (oldest first-level branch, marked as such); the
  // crown shows on every other member, nested ones included.
  assert.equal(isFamilyHead(b1, [b1, b2, c]), true);
  assert.equal(canTakeMainline(c, [b1, b2, c]), true);
  assert.equal(canTakeMainline(b2, [b1, b2, c]), true);
  assert.equal(canTakeMainline(b1, [b1, b2, c]), false);

  // Crown c: it is hoisted to the top, its parent b1 and aunt b2 nest
  // under it, and the crown moves to the displaced members.
  c.forkedFrom = { ...c.forkedFrom!, listed: true };
  assert.equal(isFamilyHead(c, [b1, b2, c]), true);
  assert.equal(canTakeMainline(c, [b1, b2, c]), false);
  assert.equal(canTakeMainline(b1, [b1, b2, c]), true);
  const tree = buildWorkspaceTree([b1, b2, c], []);
  assert.deepEqual(
    tree.groups.flatMap((g) => g.roots.map((r) => r.sessionId)),
    ["c"],
  );
  assert.deepEqual(
    (tree.childrenByParent.get("c") ?? []).map((s) => s.sessionId).sort(),
    ["b1", "b2"],
  );
  assert.deepEqual(tree.childrenByParent.get("b1") ?? [], []);
});

test("rail: a child sees its full living ancestor chain, root first", () => {
  const root = {
    ...child("root", "unused", "fork", "2026-06-30T00:00:00.000Z"),
    forkedFrom: null,
  } as SessionSummary;
  const mid = child("mid", "root", "fork", "2026-07-01T00:00:00.000Z");
  const leaf = child("leaf", "mid", "fork", "2026-07-02T00:00:00.000Z");
  leaf.lineagePath = ["root", "mid"];

  const { ancestors, others } = relatedConversationsFor("leaf", [root, mid, leaf]);
  assert.deepEqual(ancestors.map((s) => s.sessionId), ["root", "mid"]);
  assert.deepEqual(others, []);
});

test("rail: deleted middles are skipped; family attached still listed once", () => {
  const root = {
    ...child("root", "unused", "fork", "2026-06-30T00:00:00.000Z"),
    forkedFrom: null,
  } as SessionSummary;
  const grand = child("grand", "mid", "fork", "2026-07-02T00:00:00.000Z");
  grand.lineagePath = ["root", "mid"];
  const sub = child("sub", "mid", "subagent", "2026-07-03T00:00:00.000Z");
  sub.lineagePath = ["root", "mid"];

  const { ancestors, others } = relatedConversationsFor("grand", [root, grand, sub]);
  assert.deepEqual(ancestors.map((s) => s.sessionId), ["root"]);
  assert.deepEqual(others.map((s) => s.sessionId), ["sub"]);
});

test("rail: a delisted origin appears as an ancestor (its only door)", () => {
  const origin = {
    ...child("origin", "unused", "fork", "2026-06-30T00:00:00.000Z"),
    forkedFrom: null,
    delisted: true,
    delistedFor: "b",
  } as SessionSummary;
  const b = child("b", "origin", "fork", "2026-07-01T00:00:00.000Z");

  const { ancestors } = relatedConversationsFor("b", [origin, b]);
  assert.deepEqual(ancestors.map((s) => s.sessionId), ["origin"]);
});
