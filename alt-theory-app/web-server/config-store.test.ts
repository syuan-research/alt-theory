import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { getRuntimeModelConfig, upsertProvider } from "./config-store.js";

test("provider save completes after the key is durable even when catalog refresh stalls", async (t) => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-provider-save-"));
  mkdirSync(agentDir, { recursive: true });

  t.mock.method(ModelRuntime, "create", async () => {
    return {
      login: async (
        provider: string,
        _type: string,
        interaction: { prompt: () => Promise<string> },
      ) => {
        const key = await interaction.prompt();
        writeFileSync(
          join(agentDir, "auth.json"),
          JSON.stringify({ [provider]: { type: "api_key", key } }),
          "utf-8",
        );
        return await new Promise<never>(() => {});
      },
    } as unknown as ModelRuntime;
  });

  const saved = await upsertProvider(
    agentDir,
    {
      name: "shared-provider",
      baseUrl: "https://example.test/v1",
      api: "openai-completions",
      apiKey: "test-key",
      models: [{ id: "shared-model" }],
    },
    { keyStorage: "literal" },
  );

  assert.equal(saved.keyState, "stored");
  assert.match(saved.warning ?? "", /continuing in the background/);
  assert.deepEqual(
    JSON.parse(readFileSync(join(agentDir, "auth.json"), "utf-8")),
    { "shared-provider": { type: "api_key", key: "test-key" } },
  );
});

test("a removed active model falls back to the first saved usable model", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-stale-active-"));
  writeFileSync(
    join(agentDir, "models.json"),
    JSON.stringify({
      providers: {
        xai: {
          baseUrl: "https://api.x.ai/v1",
          api: "openai-completions",
          apiKey: "xai",
          models: [{ id: "grok-4.6" }],
        },
      },
    }),
  );
  writeFileSync(
    join(agentDir, "auth.json"),
    JSON.stringify({ xai: { type: "api_key", key: "test-key" } }),
  );
  writeFileSync(
    join(agentDir, "settings.json"),
    JSON.stringify({ defaultProvider: "xai", defaultModel: "glm-5.2" }),
  );

  assert.deepEqual(getRuntimeModelConfig(agentDir), {
    modelProvider: "xai",
    modelId: "grok-4.6",
    modelsPath: join(agentDir, "models.json"),
    authPath: join(agentDir, "auth.json"),
  });
  assert.deepEqual(
    JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf-8")),
    { defaultProvider: "xai", defaultModel: "grok-4.6" },
  );
});
