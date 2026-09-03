import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionSummary } from "../api/types.ts";
import { buildWorkspaceTree, canTakeMainline, familyMembersOf, filterRelatedRows, isFamilyHead, isListMember, railMatchIds, relatedRowsFor, sessionTitle } from "./sessionList.ts";

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

test("btw gets a numbered prefix and Helper keeps its full marker", () => {
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
    "Helper · How do I add a provider?",
  );
  assert.equal(isListMember(help), true);

  const rootHelper = {
    ...child("root-help", "unused", "helper", "2026-07-02T00:00:00.000Z"),
    forkedFrom: null,
    helper: true,
  } as SessionSummary;
  assert.equal(
    sessionTitle(
      rootHelper,
      { "root-help": { alias: "", snippet: "How do I begin?" } },
      [rootHelper],
    ),
    "Helper · How do I begin?",
  );
  assert.equal(isListMember(rootHelper), true);
});

test("familyMembersOf includes hidden descendants from any selected member", () => {
  const root = { ...child("root", "unused", "fork", "2026-07-01T00:00:00.000Z"), forkedFrom: null } as SessionSummary;
  const branch = child("branch", "root", "fork", "2026-07-02T00:00:00.000Z");
  const helper = child("helper", "branch", "helper", "2026-07-03T00:00:00.000Z");
  helper.lineagePath = ["root", "branch"];
  const other = { ...child("other", "unused", "fork", "2026-07-04T00:00:00.000Z"), forkedFrom: null } as SessionSummary;
  const all = [root, branch, helper, other];
  assert.deepEqual(
    familyMembersOf(helper, all).map((item) => item.sessionId),
    ["root", "branch", "helper"],
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

  const rows = relatedRowsFor("leaf", [root, mid, leaf]);
  assert.deepEqual(
    rows.map((r) => [r.session.sessionId, r.relation]),
    [["root", "ancestor"], ["mid", "parent"]],
  );
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

  const rows = relatedRowsFor("grand", [root, grand, sub]);
  assert.deepEqual(
    rows.map((r) => [r.session.sessionId, r.relation]),
    [["root", "parent"], ["sub", "subagent"]],
  );
});

test("rail: a delisted origin appears as an ancestor (its only door)", () => {
  const origin = {
    ...child("origin", "unused", "fork", "2026-06-30T00:00:00.000Z"),
    forkedFrom: null,
    delisted: true,
    delistedFor: "b",
  } as SessionSummary;
  const b = child("b", "origin", "fork", "2026-07-01T00:00:00.000Z");

  const rows = relatedRowsFor("b", [origin, b]);
  assert.deepEqual(rows.map((r) => [r.session.sessionId, r.relation, r.icon]), [["origin", "origin", "ph-crown-simple"]]);
});

test("rail rows carry relation, run state, role and creation time for every kind (card 9)", () => {
  const root = {
    ...child("root", "unused", "fork", "2026-06-30T00:00:00.000Z"),
    forkedFrom: null,
  } as SessionSummary;
  const br = child("br", "root", "fork", "2026-07-01T00:00:00.000Z");
  const sa = { ...child("sa", "root", "subagent", "2026-07-02T00:00:00.000Z"), runStatus: "running" as const, agentType: "reviewer" };
  const btw = child("btw", "br", "side", "2026-07-03T00:00:00.000Z");
  btw.lineagePath = ["root", "br"];
  const rows = relatedRowsFor("root", [root, br, sa, btw]);
  assert.deepEqual(
    rows.map((r) => [r.session.sessionId, r.relation, r.kind, r.runStatus ?? null, r.role, r.createdAt, r.paneSize]),
    [
      ["br", "fork", "fork", null, null, "2026-07-01T00:00:00.000Z", "half"],
      ["sa", "subagent", "subagent", "running", "reviewer", "2026-07-02T00:00:00.000Z", "default"],
      ["btw", "side", "side", null, null, "2026-07-03T00:00:00.000Z", "default"],
    ],
  );
});

test("rail: whole-family scope adds sibling branches; kind filter and search intersect, ancestors ignore the kind filter", () => {
  const root = {
    ...child("root", "unused", "fork", "2026-06-30T00:00:00.000Z"),
    forkedFrom: null,
  } as SessionSummary;
  const b1 = child("b1", "root", "fork", "2026-07-01T00:00:00.000Z");
  const b2 = child("b2", "root", "fork", "2026-07-02T00:00:00.000Z");
  const b1sa = child("b1-sa", "b1", "subagent", "2026-07-03T00:00:00.000Z");
  b1sa.lineagePath = ["root", "b1"];
  const b2sa = child("b2-sa", "b2", "subagent", "2026-07-04T00:00:00.000Z");
  b2sa.lineagePath = ["root", "b2"];
  const all = [root, b1, b2, b1sa, b2sa];

  const ids = (rows: ReturnType<typeof relatedRowsFor>) => rows.map((r) => r.session.sessionId);
  // From b1: parent, own subagent, and the family's other subagent — not the sibling branch.
  assert.deepEqual(ids(relatedRowsFor("b1", all)), ["root", "b1-sa", "b2-sa"]);
  assert.deepEqual(ids(relatedRowsFor("b1", all, "family")), ["root", "b1-sa", "b2", "b2-sa"]);

  const titles: Record<string, string> = { root: "Interview coding", "b1-sa": "kappa check", "b2-sa": "quote extraction", b2: "codebook v1" };
  const titleOf = (s: SessionSummary) => titles[s.sessionId] ?? s.sessionId;
  const rows = relatedRowsFor("b1", all, "family");
  assert.deepEqual(ids(filterRelatedRows(rows, { kinds: new Set(["subagent"]), query: "", titleOf })), ["root", "b1-sa", "b2-sa"]);
  assert.deepEqual(ids(filterRelatedRows(rows, { kinds: new Set(["subagent"]), query: "quote", titleOf })), ["b2-sa"]);
  assert.deepEqual(ids(filterRelatedRows(rows, { kinds: new Set(["fork"]), query: "coding", titleOf })), ["root"]);
  assert.deepEqual(ids(filterRelatedRows(rows, { kinds: new Set(), query: "", titleOf })), ["root"]);
});

test("rail filter keeps a match and its ancestors; an empty query means no filter", () => {
  const root = {
    ...child("root", "unused", "fork", "2026-06-30T00:00:00.000Z"),
    forkedFrom: null,
  } as SessionSummary;
  const br = child("br", "root", "fork", "2026-07-01T00:00:00.000Z");
  const nested = child("nested", "br", "fork", "2026-07-02T00:00:00.000Z");
  nested.lineagePath = ["root", "br"];
  const other = { ...child("other", "unused", "fork", "2026-07-03T00:00:00.000Z"), forkedFrom: null } as SessionSummary;
  const names = { nested: { alias: "kappa check", snippet: "" }, other: { alias: "unrelated", snippet: "" } };
  assert.equal(railMatchIds([root, br, nested, other], "  ", names), null);
  assert.deepEqual([...railMatchIds([root, br, nested, other], "kappa", names)!].sort(), ["br", "nested", "root"]);
});

test("family and folder modified sorting follow descendant prompt acceptance", () => {
  const oldRoot = {
    ...child("old-root", "unused", "fork", "2026-06-01T00:00:00.000Z"),
    forkedFrom: null,
    workspacePrimaryDir: "C:/alpha",
  } as SessionSummary;
  const freshRoot = {
    ...child("fresh-root", "unused", "fork", "2026-07-01T00:00:00.000Z"),
    forkedFrom: null,
    workspacePrimaryDir: "C:/beta",
  } as SessionSummary;
  const descendant = child(
    "descendant",
    "old-root",
    "side",
    "2026-06-02T00:00:00.000Z",
  );
  descendant.workspacePrimaryDir = "C:/alpha";
  descendant.lastPromptAcceptedAt = "2026-08-01T00:00:00.000Z";

  const tree = buildWorkspaceTree(
    [freshRoot, oldRoot, descendant],
    [],
    { folders: "modified", conversations: "modified" },
  );
  assert.deepEqual(tree.groups.map((group) => group.dir), ["C:/alpha", "C:/beta"]);
});

test("name sorting uses displayed conversation names", () => {
  const z = {
    ...child("z", "unused", "fork", "2026-07-02T00:00:00.000Z"),
    forkedFrom: null,
  } as SessionSummary;
  const a = {
    ...child("a", "unused", "fork", "2026-07-01T00:00:00.000Z"),
    forkedFrom: null,
  } as SessionSummary;
  const tree = buildWorkspaceTree(
    [z, a],
    [],
    { folders: "name", conversations: "name" },
    {
      z: { alias: "Alpha", snippet: "" },
      a: { alias: "Zulu", snippet: "" },
    },
  );
  assert.deepEqual(tree.groups[0].roots.map((root) => root.sessionId), ["z", "a"]);
});
