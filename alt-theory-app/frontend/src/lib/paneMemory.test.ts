import assert from "node:assert/strict";
import { test } from "node:test";
import { paneMemory } from "./paneMemory.ts";

test("pane memory keeps a value for the app's lifetime under its key", () => {
  assert.equal(paneMemory.get("s1:scroll"), undefined);
  paneMemory.set("s1:scroll", 120);
  assert.equal(paneMemory.get("s1:scroll"), 120);
});
