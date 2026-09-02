import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampThinkingLevel as piClamp,
  getSupportedThinkingLevels,
  type Model,
} from "@earendil-works/pi-ai";
import {
  clampThinkingLevel,
  defaultThinkingLevel,
  resolveThinkingLevel,
} from "./thinking-level.js";

test("a user-chosen level is kept, never defaulted", () => {
  assert.deepEqual(resolveThinkingLevel(["off", "low", "medium", "high"], "low"), {
    level: "low",
    source: "user",
    chosen: "low",
  });
  // Unknown model levels: keep the choice as is.
  assert.deepEqual(resolveThinkingLevel([], "high"), {
    level: "high",
    source: "user",
    chosen: "high",
  });
});

test("a level the model cannot run is reported as clamped, with the choice kept", () => {
  assert.deepEqual(resolveThinkingLevel(["off", "medium", "high"], "low"), {
    level: "medium",
    source: "clamped",
    chosen: "low",
  });
  assert.deepEqual(resolveThinkingLevel(["off", "low"], "max"), {
    level: "low",
    source: "clamped",
    chosen: "max",
  });
});

test("no choice → the model's midpoint, lower middle on an even count", () => {
  assert.deepEqual(resolveThinkingLevel(["off", "low", "medium", "high"], undefined), {
    level: "medium",
    source: "model-default",
  });
  assert.equal(defaultThinkingLevel(["off", "low", "medium", "high", "xhigh"]), "medium");
  assert.equal(defaultThinkingLevel(["off", "low", "high"]), "low");
  assert.equal(defaultThinkingLevel(["off"]), "medium");
  assert.equal(defaultThinkingLevel([]), "medium");
});

test("the clamp rule matches pi-ai's on a real model shape", () => {
  const model = {
    id: "m",
    provider: "p",
    reasoning: true,
    thinkingLevelMap: { minimal: null, low: null, xhigh: "x" },
  } as unknown as Model<any>;
  const available = getSupportedThinkingLevels(model);
  assert.deepEqual(available, ["off", "medium", "high", "xhigh"]);
  for (const level of ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const) {
    assert.equal(clampThinkingLevel(available, level), piClamp(model, level), level);
  }
});
