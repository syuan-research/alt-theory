import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isSimpleViewMode,
  showAdvancedConfig,
  viewModeForRole,
} from "./viewMode.js";

test("hosted participant uses simple view with KB-only config gating", () => {
  const mode = viewModeForRole("participant", "hosted");
  assert.equal(mode, "participant");
  assert.equal(isSimpleViewMode(mode), true);
  assert.equal(showAdvancedConfig(mode), false);
});

test("hosted researcher sees advanced launch config", () => {
  const mode = viewModeForRole("researcher", "hosted");
  assert.equal(showAdvancedConfig(mode), true);
});

test("local mode keeps simple shell like participant", () => {
  const mode = viewModeForRole("researcher", "local");
  assert.equal(mode, "local");
  assert.equal(showAdvancedConfig(mode), false);
});