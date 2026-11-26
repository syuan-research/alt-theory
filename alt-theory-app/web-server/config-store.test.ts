import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
  type Model,
} from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  getConfigStatus,
  getRuntimeModelConfig,
  listProviders,
  normalizeModelListPayload,
  upsertProvider,
} from "./config-store.js";

function writtenProviderModel(
  agentDir: string,
  provider: string,
  modelId: string,
) {
  const models = JSON.parse(
    readFileSync(join(agentDir, "models.json"), "utf-8"),
  ) as {
    providers: Record<string, { models: Array<Record<string, unknown>> }>;
  };
  const row = models.providers[provider]?.models.find(
    (model) => model.id === modelId,
  );
  assert.ok(row, `${provider}/${modelId} was written`);
  return row;
}

function piThinkingLevels(entry: Record<string, unknown>) {
  return getSupportedThinkingLevels({
    id: String(entry.id),
    provider: "test",
    reasoning: entry.reasoning === true,
    thinkingLevelMap: entry.thinkingLevelMap,
  } as unknown as Model<any>);
}

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

test("Copilot OAuth model list follows the account, never the stale builtin", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-copilot-models-"));
  writeFileSync(join(agentDir, "auth.json"), JSON.stringify({
    "github-copilot": {
      type: "oauth",
      access: "access",
      refresh: "refresh",
      // 60s would be below Pi 0.84's refresh margin, but listProviders reads
      // the stored credential without resolving it, so no refresh happens.
      expires: Date.now() + 60_000,
      availableModelIds: ["claude-sonnet-4.6", "brand-new-model-9"],
    },
  }));
  const view = listProviders(agentDir).find(
    (p) => p.name === "github-copilot",
  );
  assert.ok(view, "copilot appears once its credential exists");
  // The account-enabled ids are the list; one is builtin-known (decorated),
  // one is not yet in the builtin catalog and still appears bare. Builtin
  // ids the account lacks (e.g. claude-opus-4.8) stay out.
  assert.deepEqual(
    view.models.map((model) => model.id),
    ["claude-sonnet-4.6", "brand-new-model-9"],
  );
  const known = view.models.find((model) => model.id === "claude-sonnet-4.6");
  assert.ok(known?.name, "builtin metadata decorates a known id");
  const unknown = view.models.find((model) => model.id === "brand-new-model-9");
  assert.ok(unknown, "unknown ids still appear (fallback to bare id)");
});

test("Copilot saved models hide ids the account does not offer", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-copilot-intersect-"));
  writeFileSync(
    join(agentDir, "models.json"),
    JSON.stringify({
      providers: {
        "github-copilot": {
          models: [
            { id: "claude-sonnet-4.5" },
            { id: "not-on-this-account" },
          ],
        },
      },
    }),
  );
  writeFileSync(join(agentDir, "auth.json"), JSON.stringify({
    "github-copilot": {
      type: "oauth",
      access: "access",
      refresh: "refresh",
      expires: Date.now() + 60_000,
      availableModelIds: ["claude-sonnet-4.5", "brand-new-model-9"],
    },
  }));
  const view = listProviders(agentDir).find(
    (p) => p.name === "github-copilot",
  );
  assert.deepEqual(
    view?.models.map((model) => model.id),
    ["claude-sonnet-4.5"],
  );
});

test("Copilot without availableModelIds falls back to the builtin catalog", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-copilot-fallback-"));
  writeFileSync(join(agentDir, "auth.json"), JSON.stringify({
    "github-copilot": {
      type: "oauth",
      access: "access",
      refresh: "refresh",
      expires: Date.now() + 60_000,
    },
  }));
  const view = listProviders(agentDir).find(
    (p) => p.name === "github-copilot",
  );
  assert.ok(view);
  assert.ok(
    (view.models.length ?? 0) > 0,
    "builtin catalog is the last fallback when the credential carries no list",
  );
});

test("provider write fills reasoning from the local catalog so Pi sees the cache levels", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-thinking-write-hit-"));
  writeFileSync(
    join(agentDir, "models-dev-cache.json"),
    JSON.stringify({
      deepseek: {
        api: "https://api.deepseek.com",
        models: {
          "deepseek-v4-flash": {
            reasoning: true,
            reasoning_options: [
              { type: "effort", values: ["low", "high", "max"] },
            ],
          },
        },
      },
    }),
  );
  await upsertProvider(
    agentDir,
    {
      name: "deepseek-official",
      baseUrl: "https://api.deepseek.com/v1",
      api: "openai-completions",
      apiKey: "DEEPSEEK_API_KEY",
      models: [{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }],
    },
    { keyStorage: "env" },
  );
  const entry = writtenProviderModel(
    agentDir,
    "deepseek-official",
    "deepseek-v4-flash",
  );
  assert.equal(entry.reasoning, true);
  assert.equal(entry.thinkingLevels, undefined);
  assert.deepEqual(piThinkingLevels(entry), ["low", "high", "max"]);
});

test("provider write without a catalog match stays a bare entry", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-thinking-write-miss-"));
  await upsertProvider(
    agentDir,
    {
      name: "custom-bare",
      baseUrl: "https://example.invalid/v1",
      api: "openai-completions",
      apiKey: "ENV_BARE",
      models: [{ id: "ghost-model" }],
    },
    { keyStorage: "env" },
  );
  const entry = writtenProviderModel(agentDir, "custom-bare", "ghost-model");
  assert.equal(entry.reasoning, undefined);
  assert.equal(entry.thinkingLevelMap, undefined);
  assert.equal(entry.thinkingLevels, undefined);
  assert.deepEqual(piThinkingLevels(entry), ["off"]);
});

test("an ambiguous URL-only catalog match stays bare instead of key-order-dependent", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-thinking-write-ambig-"));
  // Two catalog providers share the API URL and carry the same model id with
  // different effort levels: whichever Object.values yields first would win.
  writeFileSync(
    join(agentDir, "models-dev-cache.json"),
    JSON.stringify({
      "alpha-proxy": {
        api: "https://proxy.example/v1",
        models: {
          "shared-model": {
            reasoning: true,
            reasoning_options: [{ type: "effort", values: ["low", "max"] }],
          },
        },
      },
      "beta-proxy": {
        api: "https://proxy.example/v1",
        models: {
          "shared-model": {
            reasoning: true,
            reasoning_options: [{ type: "effort", values: ["low", "high"] }],
          },
        },
      },
    }),
  );
  await upsertProvider(
    agentDir,
    {
      name: "my-proxy",
      baseUrl: "https://proxy.example/v1",
      api: "openai-completions",
      apiKey: "PROXY_KEY",
      models: [{ id: "shared-model" }],
    },
    { keyStorage: "env" },
  );
  const entry = writtenProviderModel(agentDir, "my-proxy", "shared-model");
  assert.equal(entry.reasoning, undefined);
  assert.equal(entry.thinkingLevelMap, undefined);
  assert.deepEqual(piThinkingLevels(entry), ["off"]);
  // The picker chain falls through the same ambiguity: neither candidate's
  // levels are offered for the model.
  const view = listProviders(agentDir).find((provider) => provider.name === "my-proxy");
  assert.ok(view);
  assert.deepEqual(view.models[0].availableThinkingLevels, []);
});

test("user-explicit thinkingLevels survive a catalog hit", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-thinking-write-user-"));
  writeFileSync(
    join(agentDir, "models-dev-cache.json"),
    JSON.stringify({
      deepseek: {
        api: "https://api.deepseek.com",
        models: {
          "deepseek-v4-flash": {
            reasoning: true,
            reasoning_options: [
              { type: "effort", values: ["low", "high", "max"] },
            ],
          },
        },
      },
    }),
  );
  await upsertProvider(
    agentDir,
    {
      name: "deepseek-official",
      baseUrl: "https://api.deepseek.com/v1",
      api: "openai-completions",
      apiKey: "DEEPSEEK_API_KEY",
      models: [
        {
          id: "deepseek-v4-flash",
          thinkingLevels: ["off", "high"],
        },
      ],
    },
    { keyStorage: "env" },
  );
  const entry = writtenProviderModel(
    agentDir,
    "deepseek-official",
    "deepseek-v4-flash",
  );
  assert.deepEqual(entry.thinkingLevels, ["off", "high"]);
  assert.deepEqual(piThinkingLevels(entry), ["off", "high"]);
});

/** The request Pi really sends for a saved entry (network stubbed), minus the conversation. */
async function piRequestFor(
  agentDir: string,
  provider: string,
  modelId: string,
  level: ThinkingLevel,
) {
  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: join(agentDir, "models.json"),
  });
  const model = runtime.getModel(provider, modelId);
  assert.ok(model, `${provider}/${modelId} is a Pi model`);
  const originalFetch = globalThis.fetch;
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (_url, init) => {
    body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response("stub", { status: 400 });
  }) as typeof fetch;
  try {
    // What Pi's simple API passes on: the clamped level, and off means "no effort".
    await runtime.stream(
      model,
      {
        messages: [{ role: "user", content: "hi", timestamp: 0 }],
        tools: [],
      } as never,
      (() => {
        const clamped = clampThinkingLevel(model, level);
        return { reasoningEffort: clamped === "off" ? undefined : clamped };
      })() as never,
    ).result();
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.ok(body.model, "Pi made a request");
  const { messages, model: _model, tools, ...params } = body;
  return params;
}

const THINKING_PARAMS = ["reasoning_effort", "thinking", "enable_thinking", "reasoning"];

async function saveLiteral(
  agentDir: string,
  name: string,
  baseUrl: string,
  model: Record<string, unknown>,
) {
  await upsertProvider(
    agentDir,
    {
      name,
      baseUrl,
      api: "openai-completions",
      apiKey: "test-key",
      models: [model] as never,
    },
    { keyStorage: "literal" },
  );
}

test("a model Pi ships a definition for is saved with Pi's thinking fields, whatever the provider is called", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-thinking-shipped-"));
  // No models.dev cache here: Pi's shipped catalog alone answers. The
  // provider name is Alt's, not Pi's, and the URL carries the match.
  await saveLiteral(
    agentDir,
    "xiaomi-mimo-token-plan-cn",
    "https://token-plan-cn.xiaomimimo.com/v1/",
    { id: "mimo-v2.6-pro" },
  );
  const entry = writtenProviderModel(agentDir, "xiaomi-mimo-token-plan-cn", "mimo-v2.6-pro");
  assert.equal(entry.reasoning, true);
  assert.deepEqual(entry.thinkingLevelMap, {
    off: "off", minimal: null, low: null, medium: null, high: "high", xhigh: null, max: null,
  });
  assert.equal(entry.compat?.thinkingFormat, "deepseek");
  assert.equal(entry.compat?.supportsReasoningEffort, false);
  assert.deepEqual(piThinkingLevels(entry), ["off", "high"]);
  assert.deepEqual(
    listProviders(agentDir).find((provider) => provider.name === "xiaomi-mimo-token-plan-cn")
      ?.models[0].availableThinkingLevels,
    ["off", "high"],
  );

  // On the wire: a switch, never an effort, whatever level is picked.
  for (const [level, type] of [["high", "enabled"], ["medium", "enabled"], ["off", "disabled"]] as const) {
    const params = await piRequestFor(agentDir, "xiaomi-mimo-token-plan-cn", "mimo-v2.6-pro", level);
    assert.deepEqual(params.thinking, { type });
    assert.equal("reasoning_effort" in params, false, `reasoning_effort sent for ${level}`);
  }
});

test("a model with thinking but no effort levels sends no thinking parameter", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-thinking-toggle-"));
  writeFileSync(
    join(agentDir, "models-dev-cache.json"),
    JSON.stringify({
      "acme-toggle": {
        api: "https://toggle.example/v1",
        models: { "t-1": { reasoning: true, reasoning_options: [{ type: "toggle" }] } },
      },
    }),
  );
  await saveLiteral(agentDir, "acme-toggle", "https://toggle.example/v1", { id: "t-1" });
  const entry = writtenProviderModel(agentDir, "acme-toggle", "t-1");
  assert.equal(entry.reasoning, true);
  assert.deepEqual(piThinkingLevels(entry), []);
  for (const level of ["high", "off"] as const) {
    const params = await piRequestFor(agentDir, "acme-toggle", "t-1", level);
    for (const key of THINKING_PARAMS) assert.equal(key in params, false, `${key} sent for ${level}`);
  }

  // The same for a model nothing is known about beyond "it reasons".
  await saveLiteral(agentDir, "acme-unknown", "https://example.invalid/v1", { id: "ghost", reasoning: true });
  assert.deepEqual(
    writtenProviderModel(agentDir, "acme-unknown", "ghost").thinkingLevelMap,
    entry.thinkingLevelMap,
  );
});

test("'thinking only, no effort levels' gives on and off once a switch format is known", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-thinking-no-levels-"));
  await saveLiteral(agentDir, "acme-switch", "https://example.invalid/v1", {
    id: "ghost",
    thinkingLevels: [],
    compat: { thinkingFormat: "deepseek" },
  });
  const entry = writtenProviderModel(agentDir, "acme-switch", "ghost");
  assert.equal(entry.compat?.supportsReasoningEffort, false);
  assert.deepEqual(piThinkingLevels(entry), ["off", "high"]);
  assert.deepEqual(
    (await piRequestFor(agentDir, "acme-switch", "ghost", "high")).thinking,
    { type: "enabled" },
  );
  assert.deepEqual(
    (await piRequestFor(agentDir, "acme-switch", "ghost", "off")).thinking,
    { type: "disabled" },
  );

  // Without a format there is nothing safe to send: the provider's default applies.
  await saveLiteral(agentDir, "acme-quiet", "https://example.invalid/v1", { id: "ghost", thinkingLevels: [] });
  const params = await piRequestFor(agentDir, "acme-quiet", "ghost", "high");
  for (const key of THINKING_PARAMS) assert.equal(key in params, false, `${key} sent`);
});

test("a ticked off level never sends Pi's own `off` as an effort value", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-thinking-off-"));
  await saveLiteral(agentDir, "acme-off", "https://example.invalid/v1", {
    id: "ghost",
    thinkingLevels: ["off", "high"],
  });
  const entry = writtenProviderModel(agentDir, "acme-off", "ghost");
  assert.equal("off" in (entry.thinkingLevelMap ?? {}), false);
  assert.deepEqual(piThinkingLevels(entry), ["off", "high"]);
  assert.equal("reasoning_effort" in (await piRequestFor(agentDir, "acme-off", "ghost", "off")), false);
  assert.equal(
    (await piRequestFor(agentDir, "acme-off", "ghost", "high")).reasoning_effort,
    "high",
  );

  // A catalog that names its off value keeps it: "none" is the provider's word.
  writeFileSync(
    join(agentDir, "models-dev-cache.json"),
    JSON.stringify({
      "acme-effort": {
        api: "https://effort.example/v1",
        models: {
          "e-1": { reasoning: true, reasoning_options: [{ type: "effort", values: ["none", "low", "high"] }] },
        },
      },
    }),
  );
  await saveLiteral(agentDir, "acme-effort", "https://effort.example/v1", { id: "e-1" });
  assert.equal(writtenProviderModel(agentDir, "acme-effort", "e-1").thinkingLevelMap?.off, "none");
  assert.equal(
    (await piRequestFor(agentDir, "acme-effort", "e-1", "off")).reasoning_effort,
    "none",
  );
});

test("the user's level list beats Pi's shipped definition", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-thinking-user-wins-"));
  await saveLiteral(agentDir, "xiaomi-mimo-token-plan-cn", "https://token-plan-cn.xiaomimimo.com/v1", {
    id: "mimo-v2.6-pro",
    thinkingLevels: ["low"],
  });
  assert.deepEqual(
    writtenProviderModel(agentDir, "xiaomi-mimo-token-plan-cn", "mimo-v2.6-pro").thinkingLevelMap,
    { off: null, minimal: null, low: "low", medium: null, high: null, xhigh: null, max: null },
  );
});
