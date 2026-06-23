import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import {
  classifyModelError,
  ModelFallbackCoordinator,
  type ModelFallbackConfig,
} from "./model-fallback.js";

const testConfig: ModelFallbackConfig = {
  enabled: true,
  provider: "qwen-bailian-beijing",
  chain: [
    "qwen3.7-max",
    "qwen3.7-max-2026-06-08",
    "qwen3.7-max-2026-05-20",
    "qwen3.7-plus",
  ],
  maxFallbacksPerRun: 4,
  rules: [
    {
      id: "auth-failure",
      action: "fail",
      match: { anyPattern: ["401", "unauthorized"] },
    },
    {
      id: "dashscope-allocation-quota",
      action: "exclude_and_fallback",
      match: {
        anyPattern: [
          "allocationquota",
          "free quota",
          "free tier",
          "quota has been exhausted",
        ],
      },
    },
  ],
};

test("classifyModelError maps DashScope allocation quota to exclude_and_fallback", () => {
  const decision = classifyModelError(
    '403 AllocationQuota.FreeTierOnly The free quota has been exhausted.',
    testConfig.rules
  );
  assert.equal(decision.action, "exclude_and_fallback");
  assert.equal(decision.ruleId, "dashscope-allocation-quota");
});

test("classifyModelError maps 401 to fail", () => {
  const decision = classifyModelError("401 status code (no body)", testConfig.rules);
  assert.equal(decision.action, "fail");
  assert.equal(decision.ruleId, "auth-failure");
});

test("classifyModelError maps bare 429 to ignore", () => {
  const decision = classifyModelError("429 Too Many Requests", testConfig.rules);
  assert.equal(decision.action, "ignore");
});

test("classifyModelError maps free tier exhausted wording to exclude_and_fallback", () => {
  const decision = classifyModelError(
    "403 The free tier of the model has been exhausted.",
    testConfig.rules
  );
  assert.equal(decision.action, "exclude_and_fallback");
});

test("ModelFallbackCoordinator persists exclusion and skips excluded models", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-fallback-"));
  const statePath = join(root, "runtime", "model-fallback-state.json");
  const coordinator = new ModelFallbackCoordinator(testConfig, statePath);

  coordinator.exclude(
    "qwen-bailian-beijing",
    "qwen3.7-max",
    "dashscope-allocation-quota",
    "403 exhausted"
  );

  assert.equal(
    coordinator.resolveNext("qwen3.7-max")?.modelId,
    "qwen3.7-max-2026-06-08"
  );

  coordinator.exclude(
    "qwen-bailian-beijing",
    "qwen3.7-max-2026-06-08",
    "dashscope-allocation-quota",
    "403 exhausted"
  );

  assert.equal(
    coordinator.resolveNext("qwen3.7-max")?.modelId,
    "qwen3.7-max-2026-05-20"
  );

  const persisted = JSON.parse(readFileSync(statePath, "utf-8")) as {
    excluded: Record<string, unknown>;
  };
  assert.ok(persisted.excluded["qwen-bailian-beijing/qwen3.7-max"]);
});

test("resolveFirstUsableModel skips excluded preferred model", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-fallback-usable-"));
  const statePath = join(root, "runtime", "model-fallback-state.json");
  const coordinator = new ModelFallbackCoordinator(testConfig, statePath);
  coordinator.exclude(
    "qwen-bailian-beijing",
    "qwen3.7-max",
    "dashscope-allocation-quota",
    "403 exhausted"
  );
  assert.equal(
    coordinator.resolveFirstUsableModel("qwen3.7-max")?.modelId,
    "qwen3.7-max-2026-06-08"
  );
});