import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultTranscriptView, showAdvancedConfig } from "./viewMode.js";

test("user mode shows the simple view; researcher mode the advanced one", () => {
  assert.equal(showAdvancedConfig("user"), false);
  assert.equal(defaultTranscriptView("user"), "user");
  assert.equal(showAdvancedConfig("researcher"), true);
  assert.equal(defaultTranscriptView("researcher"), "developer");
});
