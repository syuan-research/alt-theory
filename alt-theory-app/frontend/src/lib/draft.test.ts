import assert from "node:assert/strict";
import test from "node:test";

import { appendDraft } from "./draft.ts";

test("recalled text lands on its own line after the draft", () => {
  assert.equal(appendDraft("first", "second"), "first\nsecond");
});

test("an empty or blank side contributes no line", () => {
  assert.equal(appendDraft("", "second"), "second");
  assert.equal(appendDraft("   ", "second"), "second");
  assert.equal(appendDraft("first", ""), "first");
});
