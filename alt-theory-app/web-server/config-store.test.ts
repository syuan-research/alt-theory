import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import {
  getConfigStatus,
  getRuntimeModelConfig,
  listProviders,
  normalizeModelListPayload,
  upsertProvider,
} from "./config-store.js";

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

test("OpenAI Codex OAuth config removes stale protocol fields", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-codex-models-"));
  writeFileSync(join(agentDir, "auth.json"), JSON.stringify({
    "openai-codex": { type: "oauth", access: "access", refresh: "refresh", expires: Date.now() + 60_000 },
  }));
  const modelsRaw = JSON.stringify({ providers: {
    "openai-codex": {
      baseUrl: "https://chatgpt.com/backend-api",
      api: "openai-completions",
      apiKey: "openai-codex",
      models: [{ id: "old-model" }],
    },
  } });
  writeFileSync(join(agentDir, "models.json"), modelsRaw, "utf-8");
  // Reads sanitize the view but leave the file for an explicit write to
  // persist (reads never write).
  const view = listProviders(agentDir).find((p) => p.name === "openai-codex");
  assert.ok(view);
  assert.equal(view.api, undefined);
  assert.equal(view.baseUrl, undefined);
  assert.equal(readFileSync(join(agentDir, "models.json"), "utf-8"), modelsRaw);
});

test("model-list normalization accepts the OpenAI Codex response envelope", () => {
  assert.deepEqual(normalizeModelListPayload({ models: [{ slug: "gpt-x", display_name: "GPT X" }] }), [
    { id: "gpt-x", name: "GPT X" },
  ]);
});

test("provider reads never write: list and status leave config files byte-identical", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-provider-read-"));
  const modelsRaw =
    '{"providers":{' +
    '"custom-x":{"api":"openai-completions","baseUrl":"https://example.test/v1/","apiKey":"custom-x","models":[{"id":"m-1"}]},' +
    '"custom-y":{"api":"openai-completions","baseUrl":"https://example.test","apiKey":"custom-y","models":[{"id":"m-2"}]}' +
    "}}";
  writeFileSync(join(agentDir, "models.json"), modelsRaw, "utf-8");
  writeFileSync(
    join(agentDir, "auth.json"),
    JSON.stringify({ "custom-y": { type: "api_key", key: "k" } }),
    "utf-8",
  );
  writeFileSync(
    join(agentDir, "settings.json"),
    JSON.stringify({ defaultProvider: "gone-provider", defaultModel: "m-x" }),
    "utf-8",
  );

  const providers = listProviders(agentDir);
  const viewX = providers.find((p) => p.name === "custom-x");
  assert.ok(viewX, "custom-x in view");
  assert.equal(viewX.baseUrl, "https://example.test/v1");
  assert.equal(viewX.keyState, "missing");

  const status = getConfigStatus(agentDir);
  assert.equal(status.activeProvider, "custom-y");

  assert.equal(readFileSync(join(agentDir, "models.json"), "utf-8"), modelsRaw);
  assert.equal(
    readFileSync(join(agentDir, "settings.json"), "utf-8"),
    JSON.stringify({ defaultProvider: "gone-provider", defaultModel: "m-x" }),
  );
});

test("explicit provider writes persist the read-path repairs and migrate the active pointer", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-provider-write-"));
  const modelsRaw =
    '{"providers":{' +
    '"custom-x":{"api":"openai-completions","baseUrl":"https://example.test","apiKey":"custom-x","models":[{"id":"m-1"}]},' +
    '"custom-y":{"api":"openai-completions","baseUrl":"https://example.test","apiKey":"custom-y","models":[{"id":"m-2"}]}' +
    "}}";
  writeFileSync(join(agentDir, "models.json"), modelsRaw, "utf-8");
  writeFileSync(
    join(agentDir, "auth.json"),
    JSON.stringify({ "custom-y": { type: "api_key", key: "k" } }),
    "utf-8",
  );
  writeFileSync(
    join(agentDir, "settings.json"),
    JSON.stringify({ defaultProvider: "gone-provider", defaultModel: "m-x" }),
    "utf-8",
  );

  await upsertProvider(
    agentDir,
    {
      name: "custom-z",
      baseUrl: "https://example.test",
      api: "openai-completions",
      apiKey: "ENV_Z",
      models: [{ id: "m-3" }],
    },
    { keyStorage: "env" },
  );

  const models = JSON.parse(readFileSync(join(agentDir, "models.json"), "utf-8"));
  assert.equal(models.providers["custom-x"].apiKey, undefined);
  assert.equal(models.providers["custom-z"].apiKey, "ENV_Z");
  const settings = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf-8"));
  assert.equal(settings.defaultProvider, "custom-y");
  assert.equal(settings.defaultModel, "m-2");
});
