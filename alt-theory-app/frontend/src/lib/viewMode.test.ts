import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isSimpleViewMode,
  researcherDoorOpen,
  showAdvancedConfig,
  viewModeForRole,
} from "./viewMode.js";

test("hosted participant uses simple user view", () => {
  const mode = viewModeForRole("participant", "hosted");
  assert.equal(mode, "user");
  assert.equal(isSimpleViewMode(mode), true);
  assert.equal(showAdvancedConfig(mode), false);
  assert.equal(researcherDoorOpen("participant", "hosted"), false);
});

test("hosted researcher sees advanced launch config", () => {
  const mode = viewModeForRole("researcher", "hosted");
  assert.equal(mode, "researcher");
  assert.equal(showAdvancedConfig(mode), true);
  assert.equal(researcherDoorOpen("researcher", "hosted"), true);
});

test("local install starts in user mode with the door open", () => {
  const mode = viewModeForRole("researcher", "local");
  assert.equal(mode, "user");
  assert.equal(showAdvancedConfig(mode), false);
  assert.equal(researcherDoorOpen("anonymous", "local"), true);
});
