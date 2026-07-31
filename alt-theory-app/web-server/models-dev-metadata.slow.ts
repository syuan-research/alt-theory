import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import {
  initialThinkingLevelForModel,
  listProviders,
  upsertProvider,
} from "./config-store.js";

test("models.dev effort metadata stays provider-specific", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-models-dev-"));
  writeFileSync(
    join(agentDir, "models-dev-cache.json"),
    JSON.stringify({
      openai: {
        models: {
          "gpt-5.6-terra": {
            reasoning_options: [{
              type: "effort",
              values: ["none", "low", "medium", "high", "xhigh", "max"],
            }],
          },
        },
      },
      "opencode-go": {
        api: "https://opencode.ai/zen/go/v1",
        models: {
          "mimo-v2.5-pro": { reasoning_options: [] },
        },
      },
    }),
    "utf-8",
  );
  await upsertProvider(
    agentDir,
    {
      name: "opencode-go-local",
      baseUrl: "https://opencode.ai/zen/go/v1",
      api: "openai-completions",
      apiKey: "test-key",
      models: [{ id: "mimo-v2.5-pro", reasoning: true }],
    },
    { keyStorage: "literal" },
  );
  await upsertProvider(
    agentDir,
    {
      name: "openai-codex",
      apiKey: "test-key",
      models: [{ id: "gpt-5.6-terra", reasoning: true }],
    },
    { keyStorage: "literal" },
  );

  const providers = listProviders(agentDir);
  const mimo = providers.find((p) => p.name === "opencode-go-local")?.models[0];
  const terra = providers.find((p) => p.name === "openai-codex")?.models[0];
  assert.deepEqual(mimo?.availableThinkingLevels, []);
  assert.deepEqual(terra?.availableThinkingLevels, [
    "off", "low", "medium", "high", "xhigh", "max",
  ]);
  assert.equal(
    initialThinkingLevelForModel(
      agentDir,
      "opencode-go-local",
      "mimo-v2.5-pro",
    ),
    "off",
  );
  assert.equal(
    initialThinkingLevelForModel(agentDir, "openai-codex", "gpt-5.6-terra"),
    "high",
  );
});

test("Pi effort metadata remains the offline fallback", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-pi-effort-"));
  await upsertProvider(
    agentDir,
    {
      name: "openai-codex",
      apiKey: "test-key",
      models: [{ id: "gpt-5.6-terra", reasoning: true }],
    },
    { keyStorage: "literal" },
  );

  const terra = listProviders(agentDir)
    .find((provider) => provider.name === "openai-codex")
    ?.models[0];
  assert.ok(terra?.availableThinkingLevels?.includes("high"));
  assert.notEqual(
    initialThinkingLevelForModel(agentDir, "openai-codex", "gpt-5.6-terra"),
    "off",
  );
});
