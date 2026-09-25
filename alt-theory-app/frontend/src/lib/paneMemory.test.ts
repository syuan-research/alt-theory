import assert from "node:assert/strict";
import { test } from "node:test";
import { paneMemory } from "./paneMemory.ts";

test("pane memory keeps a value for the app's lifetime under its key", () => {
  assert.equal(paneMemory.get("s1:scroll"), undefined);
  paneMemory.set("s1:scroll", 120);
  assert.equal(paneMemory.get("s1:scroll"), 120);
});

test("a deleted conversation's view state is forgotten, others stay", () => {
  paneMemory.set("gone:changes:groups", [1]);
  paneMemory.set("gone:files:query", "x");
  paneMemory.set("gone2:scroll", 5);
  paneMemory.set("kept:changes:groups", [2]);
  paneMemory.forgetSessions(["gone"]);
  assert.equal(paneMemory.get("gone:changes:groups"), undefined);
  assert.equal(paneMemory.get("gone:files:query"), undefined);
  assert.equal(paneMemory.get("gone2:scroll"), 5);
  assert.deepEqual(paneMemory.get("kept:changes:groups"), [2]);
});
