import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import {
  modelReferenceIdentity,
  readSubagentConfig,
  subagentConfigPath,
  subagentModelCandidates,
  writeSubagentConfig,
} from "./subagent-config.js";

test("subagent config defaults safely and derives provider/model candidates", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-subagents-"));
  const defaults = readSubagentConfig(dataDir);
  assert.equal(defaults.warning, null);
  assert.equal(defaults.config.defaultAgent, "general-medium");
  assert.equal(defaults.config.agents[0].id, "general-medium");
  assert.equal(defaults.config.agents[0].model, "inherit:medium");

  const config = writeSubagentConfig(dataDir, {
    schemaVersion: 1,
    defaultAgent: "general-medium",
    agents: [
      {
        id: "general-medium",
        model: "openai-codex/gpt-5.6-terra:high",
        fallbackModels: ["openai-codex/gpt-5.6-sol:low"],
      },
      {
        id: "general-low",
        model: "inherit:low",
        fallbackModels: [],
      },
      {
        id: "general-high",
        model: "inherit:high",
        fallbackModels: [],
      },
      {
        id: "review",
        description: "High-quality review",
        model: "openai-codex/gpt-5.6-sol:max",
        fallbackModels: ["anthropic/claude-sonnet-5"],
      },
    ],
  });
  assert.deepEqual(subagentModelCandidates(config), [
    "inherit",
    "openai-codex/gpt-5.6-terra",
    "openai-codex/gpt-5.6-sol",
    "anthropic/claude-sonnet-5",
  ]);
  assert.equal(
    modelReferenceIdentity("openrouter/vendor/model:exacto"),
    "openrouter/vendor/model:exacto",
  );
});

test("invalid independent config cannot block general/inherit", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "alt-subagents-bad-"));
  writeFileSync(subagentConfigPath(dataDir), "{broken", "utf-8");
  const loaded = readSubagentConfig(dataDir);
  assert.match(loaded.warning ?? "", /Could not read/);
  assert.equal(loaded.config.agents[0].id, "general-medium");
  assert.equal(loaded.config.agents[0].model, "inherit:medium");
});
