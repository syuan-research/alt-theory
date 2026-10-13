import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChangeGroup, FileChange } from "../api/types.ts";
import { agentMatches, changeAuthors, changeSections, passesAgentFilter } from "./changeList.ts";

const file = (path: string, sessionIds: string[], hour: number): FileChange => ({
  path, resolvedPath: `/p/${path}`, displayPath: path, added: 1, removed: 0, diff: "",
  sessionIds, touchedAt: `2026-10-13T${String(hour).padStart(2, "0")}:00:00.000Z`,
});
const groups: ChangeGroup[] = [
  { title: "/p", path: "/p", role: "primary", capped: false, files: [
    // The server lists the open conversation's files first, whatever their time.
    file("old-parent.md", ["parent"], 1), file("b.md", ["child"], 9), file("a.md", ["child", "parent"], 5),
  ] },
  { title: "/tmp", path: "/tmp", role: "outside", capped: false, files: [file("z.md", ["child2"], 7)] },
];
const all = () => true;

test("folder order keeps the groups and puts the newest change first inside each", () => {
  const sections = changeSections(groups, "folder", all);
  assert.deepEqual(sections.map((s) => s.files.map((f) => f.path)), [["b.md", "a.md", "old-parent.md"], ["z.md"]]);
});

test("time order is one list across folders, newest first", () => {
  assert.deepEqual(changeSections(groups, "time", all)[0].files.map((f) => f.path), ["b.md", "z.md", "a.md", "old-parent.md"]);
});

test("agent order groups by who changed it, the most recently active agent first", () => {
  const sections = changeSections(groups, "agent", all);
  assert.deepEqual(sections.map((s) => s.agentId), ["child", "child2", "parent"]);
  assert.deepEqual(sections[2].files.map((f) => f.path), ["a.md", "old-parent.md"]);
  assert.deepEqual(changeAuthors(groups).find((a) => a.id === "parent")?.count, 2);
});

test("agent filters: current conversation, running members, picked members", () => {
  const context = { currentId: "parent", running: new Set(["child2"]) };
  const paths = (filter: Parameters<typeof passesAgentFilter>[1]) =>
    changeSections(groups, "name", (f) => passesAgentFilter(f, filter, context))[0]?.files.map((f) => f.path) ?? [];
  assert.deepEqual(paths({ kind: "current" }), ["a.md", "old-parent.md"]);
  assert.deepEqual(paths({ kind: "running" }), ["z.md"]);
  assert.deepEqual(paths({ kind: "agents", ids: ["child"] }), ["a.md", "b.md"]);
  assert.deepEqual(paths({ kind: "agents", ids: ["nobody"] }), []);
  // Agent order under a filter: only the filtered agents get sections.
  const current = { kind: "current" } as const;
  const sections = changeSections(groups, "agent",
    (f) => passesAgentFilter(f, current, context), (id) => agentMatches(id, current, context));
  assert.deepEqual(sections.map((s) => s.agentId), ["parent"]);
});
