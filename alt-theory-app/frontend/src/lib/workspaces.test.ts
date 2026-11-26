import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseSlot, type Place, type Slot } from "./workspaces.ts";

const places: Record<string, Place> = {
  a1: { project: "/paper", family: "a1" },
  a1br: { project: "/paper", family: "a1" },
  a2: { project: "/paper", family: "a2" },
  b1: { project: "/interviews", family: "b1" },
  b2: { project: "/interviews", family: "b2" },
  s1: { project: "", family: "s1" },
};
const placeOf = (id: string) => places[id] ?? null;
const one: Slot[] = [{ id: 1, sessionId: null, pane: null }];
const two: Slot[] = [{ id: 1, sessionId: null, pane: null }, { id: 2, sessionId: "b1", pane: null }];

test("project mode: same project stays here, another project opens or reuses its workspace", () => {
  assert.deepEqual(chooseSlot(one, 1, "a1", "a2", placeOf, "project", false), { kind: "here" });
  assert.deepEqual(chooseSlot(one, 1, "a1", "b1", placeOf, "project", false), { kind: "new" });
  assert.deepEqual(chooseSlot(two, 1, "a1", "b2", placeOf, "project", false), { kind: "switch", id: 2 });
  // Standalone conversations are one place of their own.
  assert.deepEqual(chooseSlot(one, 1, "a1", "s1", placeOf, "project", false), { kind: "new" });
});

test("family, always and never; a draft and Cmd+click", () => {
  assert.deepEqual(chooseSlot(one, 1, "a1", "a1br", placeOf, "family", false), { kind: "here" });
  assert.deepEqual(chooseSlot(one, 1, "a1", "a2", placeOf, "family", false), { kind: "new" });
  assert.deepEqual(chooseSlot(two, 1, "a1", "b1", placeOf, "always", false), { kind: "switch", id: 2 });
  assert.deepEqual(chooseSlot(two, 1, "a1", "a2", placeOf, "always", false), { kind: "new" });
  assert.deepEqual(chooseSlot(two, 1, "a1", "b2", placeOf, "never", false), { kind: "here" });
  assert.deepEqual(chooseSlot(one, 1, null, "b1", placeOf, "project", false), { kind: "here" });
  assert.deepEqual(chooseSlot(one, 1, "a1", "a2", placeOf, "never", true), { kind: "new" });
  assert.deepEqual(chooseSlot(two, 1, "a1", "b1", placeOf, "never", true), { kind: "switch", id: 2 });
});
