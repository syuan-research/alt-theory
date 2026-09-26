import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import test from "node:test";
import { mkdtempSync } from "fs";
import WebSocket from "ws";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import {
  createAltTheorySession,
  openAltTheorySession,
} from "../core/alt-theory-core.js";
import { createSessionDirs } from "../core/data-dir.js";
import {
  isKnownKbDomain,
  listKbDomains,
  listRolePresets,
  listSouls,
  resolveRolePresetSlug,
  resolveSoulSlug,
} from "./asset-registry.js";
import { createAltTheoryServer } from "./server.js";
import { SessionService } from "./session-service.js";
import {
  buildSessionMetrics,
  persistSessionMetrics,
} from "./session-metrics.js";
import { appendSessionEvent } from "./session-events.js";
import {
  buildTranscriptFromEntries,
  getSessionRootForRequest,
  listSessionTextFiles,
  listSessionSummaries,
  readSessionTextFile,
  readSessionDetail,
  writeSessionTextFile,
} from "./session-store.js";

test("compaction transcript keeps visible history and exposes its summary", () => {
  const transcript = buildTranscriptFromEntries([
    {
      type: "message",
      id: "user-1",
      timestamp: "2026-07-24T00:00:00.000Z",
      message: { role: "user", content: "before compact" },
    },
    {
      type: "message",
      id: "assistant-1",
      timestamp: "2026-07-24T00:00:01.000Z",
      message: { role: "assistant", content: "still visible" },
    },
    {
      type: "compaction",
      id: "compact-1",
      timestamp: "2026-07-24T00:00:02.000Z",
      summary: "real compact summary",
    },
  ]);

  assert.deepEqual(
    transcript.map(({ text, marker }) => ({ text, marker })),
    [
      { text: "before compact", marker: undefined },
      { text: "still visible", marker: undefined },
      { text: "real compact summary", marker: "compaction" },
    ],
  );
});

test("persisted tool results keep call order and failure state", () => {
  const transcript = buildTranscriptFromEntries([
    {
      type: "message",
      id: "assistant-tool",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "before tool" },
          {
            type: "toolCall",
            id: "call-1",
            name: "read",
            arguments: { path: "missing.md" },
          },
          { type: "text", text: "after tool" },
        ],
      },
    },
    {
      type: "message",
      id: "tool-result",
      message: {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read",
        content: [{ type: "text", text: "not found" }],
        isError: true,
      },
    },
  ]);

  assert.deepEqual(
    transcript.map(({ role, text, toolType, success }) => ({
      role,
      text,
      toolType,
      success,
    })),
    [
      {
        role: "assistant",
        text: "before tool",
        toolType: undefined,
        success: undefined,
      },
      { role: "tool", text: "not found", toolType: "call", success: false },
      {
        role: "assistant",
        text: "after tool",
        toolType: undefined,
        success: undefined,
      },
    ],
  );
  // The three rows share one entryId; each has its own stable row id, the
  // same on every projection (the display key, M1).
  assert.deepEqual(
    transcript.map((row) => [row.entryId, row.rowId]),
    [
      ["assistant-tool", "assistant-tool:0"],
      ["assistant-tool", "assistant-tool:1"],
      ["assistant-tool", "assistant-tool:2"],
    ],
  );
});

test("every projected row has a unique stable id, compaction rows included", () => {
  const entries = [
    { type: "message", id: "u1", message: { role: "user", content: "hi" } },
    {
      type: "message",
      id: "a1",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "one" },
          { type: "toolCall", id: "c1", name: "read", arguments: {} },
          { type: "text", text: "two" },
        ],
      },
    },
    { type: "compaction", id: "k1", summary: "compressed" },
  ];
  const first = buildTranscriptFromEntries(entries);
  const ids = first.map((row) => row.rowId);
  assert.deepEqual(ids, ["u1:0", "a1:0", "a1:1", "a1:2", "k1:0"]);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(buildTranscriptFromEntries(entries).map((row) => row.rowId), ids);
});
import { writeFoundationRecords } from "./session-records.js";
import {
  getConfigStatus,
  getVerifiedConfigStatus,
  getRuntimeModelConfig,
  fetchProviderModels,
  fetchProviderModelsFromDraft,
  thinkingLevelsForModel,
  listProviders,
  normalizeModelListPayload,
  setActive,
  upsertProvider,
} from "./config-store.js";
import { defaultThinkingLevel } from "./thinking-level.js";

/** The former config-store default: the resolver's midpoint over the registry's levels. */
const initialThinkingLevelForModel = (agentDir: string, provider: string, modelId: string) =>
  defaultThinkingLevel(thinkingLevelsForModel(agentDir, provider, modelId) ?? []);

test("initial thinking effort uses the lower positional middle of model levels", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-thinking-levels-"));
  await upsertProvider(
    agentDir,
    {
      name: "effort-test",
      baseUrl: "https://example.invalid/v1",
      api: "openai-responses",
      apiKey: "test-key",
      models: [
        {
          id: "high-max",
          reasoning: true,
          thinkingLevels: ["off", "high", "max"],
        },
        {
          id: "four-levels",
          reasoning: true,
          thinkingLevels: ["off", "low", "medium", "high", "xhigh"],
        },
        { id: "no-level-metadata" },
      ],
    },
    { keyStorage: "literal" },
  );

  assert.equal(
    initialThinkingLevelForModel(agentDir, "effort-test", "high-max"),
    "high",
  );
  assert.equal(
    initialThinkingLevelForModel(agentDir, "effort-test", "four-levels"),
    "medium",
  );
  assert.equal(
    initialThinkingLevelForModel(agentDir, "effort-test", "no-level-metadata"),
    "medium",
  );
});

test("model-list normalization preserves available runtime metadata", () => {
  assert.deepEqual(
    normalizeModelListPayload({
      data: [
        {
          id: "reasoner-1",
          name: "Reasoner 1",
          context_window: 131072,
          max_output_tokens: 32768,
          input_modalities: ["text", "image"],
          reasoning_options: [
            { type: "effort", values: ["none", "high", "max"] },
          ],
          thinking_level_map: { high: "high", xhigh: "xhigh", max: null },
        },
      ],
    }),
    [
      {
        id: "reasoner-1",
        name: "Reasoner 1",
        reasoning: true,
        contextWindow: 131072,
        maxTokens: 32768,
        input: ["text", "image"],
        thinkingLevels: ["off", "high", "max"],
        thinkingLevelMap: { high: "high", xhigh: "xhigh", max: null },
      },
    ],
  );
});

test("provider Fetch keeps every model its own endpoint lists", async () => {
  // The provider entry's api/baseUrl already decide the SDK, so a model the
  // catalog has not indexed — or a catalog that never loaded because the
  // network was down — must not delete a model the provider itself returned.
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-sdk-family-"));
  writeFileSync(
    join(agentDir, "models-dev-cache.json"),
    JSON.stringify({
      "opencode-go": {
        api: "https://opencode.ai/zen/go/v1",
        npm: "@ai-sdk/openai-compatible",
        models: { "known-model": {} },
      },
    }),
    "utf-8",
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({
      data: [{ id: "known-model" }, { id: "released-last-week" }],
    }), { status: 200 });
  try {
    const fetched = await fetchProviderModelsFromDraft(agentDir, {
      provider: "opencode-go",
      baseUrl: "https://opencode.ai/zen/go/v1",
      api: "openai-completions",
      apiKey: "test-key",
    });
    assert.deepEqual(fetched.map((model) => model.id), [
      "known-model",
      "released-last-week",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider Fetch retries a 5xx once before giving up", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-fetch-retry-"));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response("upstream hiccup", { status: 503 })
      : new Response(JSON.stringify({ data: [{ id: "after-retry" }] }), {
          status: 200,
        });
  };
  try {
    const fetched = await fetchProviderModelsFromDraft(agentDir, {
      provider: "opencode-go",
      baseUrl: "https://opencode.ai/zen/go/v1",
      api: "openai-completions",
      apiKey: "test-key",
    });
    assert.equal(calls, 2);
    assert.deepEqual(fetched.map((model) => model.id), ["after-retry"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenCode Go Fetch keeps only models for the selected SDK family", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-sdk-family-"));
  writeFileSync(
    join(agentDir, "models-dev-cache.json"),
    JSON.stringify({
      "opencode-go": {
        api: "https://opencode.ai/zen/go/v1",
        npm: "@ai-sdk/openai-compatible",
        models: {
          "openai-model": {
            name: "OpenAI Model",
            reasoning: true,
            reasoning_options: [
              { type: "effort", values: ["low", "high"] },
            ],
            modalities: { input: ["text", "image", "video"] },
            limit: { context: 1000000, output: 65536 },
          },
          "anthropic-model": { provider: { npm: "@ai-sdk/anthropic" } },
        },
      },
      "another-openai-provider": {
        npm: "@ai-sdk/openai-compatible",
        models: { "new-openai-model": {} },
      },
    }),
    "utf-8",
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: [
          { id: "openai-model" },
          { id: "anthropic-model" },
          { id: "new-openai-model" },
        ],
      }),
      { status: 200 },
    );
  try {
    const openai = await fetchProviderModelsFromDraft(agentDir, {
      provider: "opencode-go-openai",
      baseUrl: "https://opencode.ai/zen/go/v1",
      api: "openai-completions",
      apiKey: "test-key",
    });
    const anthropic = await fetchProviderModelsFromDraft(agentDir, {
      provider: "opencode-go-anthropic",
      baseUrl: "https://opencode.ai/zen/go",
      api: "anthropic-messages",
      apiKey: "test-key",
    });
    assert.deepEqual(openai, [
      {
        id: "openai-model",
        name: "OpenAI Model",
        reasoning: true,
        availableThinkingLevels: ["low", "high"],
        input: ["text", "image"],
        contextWindow: 1000000,
        maxTokens: 65536,
      },
      { id: "new-openai-model", name: "new-openai-model" },
    ]);
    assert.deepEqual(anthropic.map((model) => model.id), ["anthropic-model"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenCode Go Fetch uses bundled families without waiting for models.dev", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-sdk-family-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: [{ id: "minimax-m3" }, { id: "kimi-k3" }, { id: "future-model" }],
      }),
      { status: 200 },
    );
  try {
    const anthropic = await fetchProviderModelsFromDraft(agentDir, {
      provider: "opencode-go-anthropic",
      baseUrl: "https://opencode.ai/zen/go",
      api: "anthropic-messages",
      apiKey: "test-key",
    });
    const openai = await fetchProviderModelsFromDraft(agentDir, {
      provider: "opencode-go-openai",
      baseUrl: "https://opencode.ai/zen/go/v1",
      api: "openai-completions",
      apiKey: "test-key",
    });
    assert.deepEqual(anthropic.map((model) => model.id), ["minimax-m3", "future-model"]);
    assert.deepEqual(openai.map((model) => model.id), ["kimi-k3", "future-model"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("asset registry lists safe sorted slugs and resolves known assets", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-assets-"));
  const rolePresets = join(root, "role-presets");
  const souls = join(root, "soul");
  const kb = join(root, "kb");
  mkdirSync(join(kb, "urban"), { recursive: true });
  mkdirSync(join(kb, ".hidden"), { recursive: true });
  mkdirSync(rolePresets, { recursive: true });
  mkdirSync(souls, { recursive: true });
  writeFileSync(join(rolePresets, "zeta_role.md"), "z", "utf-8");
  writeFileSync(join(rolePresets, "alpha.md"), "a", "utf-8");
  writeFileSync(join(rolePresets, ".hidden.md"), "h", "utf-8");
  writeFileSync(join(rolePresets, "ignore.txt"), "x", "utf-8");
  writeFileSync(join(souls, "soul-latest.md"), "latest", "utf-8");
  writeFileSync(join(souls, ".hidden.md"), "h", "utf-8");
  writeFileSync(join(souls, "ignore.txt"), "x", "utf-8");

  assert.deepEqual(listRolePresets(rolePresets), [
    { slug: "alpha", displayName: "Alpha" },
    { slug: "zeta_role", displayName: "Zeta Role" },
  ]);
  assert.deepEqual(listKbDomains(kb), [
    { slug: "urban", displayName: "Urban" },
  ]);
  assert.deepEqual(listSouls(souls), [
    { slug: "soul-latest", displayName: "Soul Latest" },
  ]);
  assert.equal(
    resolveRolePresetSlug(rolePresets, "alpha"),
    join(rolePresets, "alpha.md"),
  );
  assert.equal(resolveRolePresetSlug(rolePresets, "../alpha"), null);
  assert.equal(
    resolveSoulSlug(souls, "soul-latest"),
    join(souls, "soul-latest.md"),
  );
  assert.equal(resolveSoulSlug(souls, "../soul"), null);
  assert.equal(isKnownKbDomain(kb, "urban"), true);
  assert.equal(isKnownKbDomain(kb, "all"), true);
  assert.equal(isKnownKbDomain(kb, "../urban"), false);
});

test("local config active model resolves and loads as a Pi custom model", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-pi-config-"));
  await
  upsertProvider(
    agentDir,
    {
      name: "minimax",
      baseUrl: "https://api.minimaxi.com/anthropic/v1",
      api: "anthropic-messages",
      apiKey: "sk-test",
      models: [{ id: "minimax-m3" }],
    },
    { keyStorage: "literal" },
  );
  await setActive(agentDir, "minimax", "minimax-m3");

  const runtimeConfig = getRuntimeModelConfig(agentDir);
  assert.deepEqual(runtimeConfig, {
    modelProvider: "minimax",
    modelId: "minimax-m3",
    modelsPath: join(agentDir, "models.json"),
    authPath: join(agentDir, "auth.json"),
  });

  const runtime = await ModelRuntime.create({
    authPath: runtimeConfig.authPath,
    modelsPath: runtimeConfig.modelsPath,
  });
  assert.ok(runtime.getModel("minimax", "minimax-m3"));
});

test("local config runtime ignores literal-key marker when auth key is missing", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-pi-config-"));
  await
  upsertProvider(
    agentDir,
    {
      name: "minimax",
      baseUrl: "https://api.minimaxi.com/anthropic/v1",
      api: "anthropic-messages",
      apiKey: "sk-test",
      models: [{ id: "minimax-m3" }],
    },
    { keyStorage: "literal" },
  );
  await setActive(agentDir, "minimax", "minimax-m3");
  await
  upsertProvider(
    agentDir,
    {
      name: "minimax",
      baseUrl: "https://api.minimaxi.com/anthropic/v1",
      api: "anthropic-messages",
      models: [{ id: "minimax-m3" }],
    },
    { clearKey: true },
  );

  assert.deepEqual(getRuntimeModelConfig(agentDir), {});
});

test("local config resolves a built-in model with OAuth and no custom provider block", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-pi-config-"));
  writeFileSync(
    join(agentDir, "auth.json"),
    JSON.stringify({
      xai: { type: "oauth", access: "test", refresh: "test", expires: 0 },
    }),
    "utf-8",
  );
  await setActive(agentDir, "xai", "grok-4.5");

  assert.deepEqual(getRuntimeModelConfig(agentDir), {
    modelProvider: "xai",
    modelId: "grok-4.5",
    modelsPath: join(agentDir, "models.json"),
    authPath: join(agentDir, "auth.json"),
  });

  const failedRefresh = await getVerifiedConfigStatus(
    agentDir,
    async () => false,
  );
  assert.equal(failedRefresh.activeUsable, false);
  assert.match(failedRefresh.activeIssue ?? "", /could not be refreshed/);

  const unauthorizedRefresh = await getVerifiedConfigStatus(agentDir, async () => {
    throw new Error("OAuth refresh failed: HTTP 401");
  });
  assert.equal(unauthorizedRefresh.activeUsable, false);
  assert.match(unauthorizedRefresh.activeIssue ?? "", /401.*Reconnect/);

  const successfulRefresh = await getVerifiedConfigStatus(
    agentDir,
    async () => true,
  );
  assert.equal(successfulRefresh.activeUsable, true);

  const timedOutRefresh = await getVerifiedConfigStatus(
    agentDir,
    () => new Promise(() => {}),
    5,
  );
  assert.equal(timedOutRefresh.activeUsable, false);
  assert.match(timedOutRefresh.activeIssue ?? "", /verified in time/);
});

test("OAuth provider keeps the exact user-saved model list across normal reads", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-pi-config-"));
  writeFileSync(
    join(agentDir, "auth.json"),
    JSON.stringify({
      xai: {
        type: "oauth",
        access: "test",
        refresh: "test",
        expires: Date.now() + 60 * 60_000, // Pi 0.84 refreshes under 5 min of validity; keep valid so stubs only serve model lists
      },
    }),
    "utf-8",
  );

  await upsertProvider(agentDir, {
    name: "xai",
    baseUrl: "https://api.x.ai/v1",
    api: "openai-responses",
    models: [{ id: "grok-4.6" }],
  });
  assert.deepEqual(
    listProviders(agentDir).find((provider) => provider.name === "xai")?.models.map(
      (model) => model.id,
    ),
    ["grok-4.6"],
  );

  await setActive(agentDir, "xai", "grok-4.6");
  const runtimeConfig = getRuntimeModelConfig(agentDir);
  assert.equal(runtimeConfig.modelId, "grok-4.6");
  const runtime = await ModelRuntime.create({
    authPath: runtimeConfig.authPath,
    modelsPath: runtimeConfig.modelsPath,
  });
  assert.ok(runtime.getModel("xai", "grok-4.6"));
  assert.deepEqual(
    JSON.parse(readFileSync(join(agentDir, "models.json"), "utf-8")).providers.xai.models.map(
      (model: { id: string }) => model.id,
    ),
    ["grok-4.6"],
  );
});

test("xAI OAuth Fetch keeps remote models absent from the bundled catalog", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-pi-config-"));
  writeFileSync(
    join(agentDir, "auth.json"),
    JSON.stringify({
      xai: {
        type: "oauth",
        access: "test",
        refresh: "test",
        expires: Date.now() + 60 * 60_000, // Pi 0.84 refreshes under 5 min of validity; keep valid so stubs only serve model lists
      },
    }),
    "utf-8",
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ data: [{ id: "grok-4.6" }] }), { status: 200 });
  try {
    assert.deepEqual(
      (await fetchProviderModels(agentDir, "xai")).map((model) => model.id),
      ["grok-4.6"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("local config refuses to activate a keyless provider", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-pi-config-"));
  await
  upsertProvider(agentDir, {
    name: "opencode-go",
    models: [{ id: "mimo-v2.5-pro" }],
  });

  await assert.rejects(
    () => setActive(agentDir, "opencode-go", "mimo-v2.5-pro"),
    /needs a saved API key or env-var key/,
  );
  const status = getConfigStatus(agentDir);
  assert.equal(status.anyUsable, false);
  assert.equal(status.activeUsable, false);
});

test("local config preserves uncredentialed custom model lists", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-pi-config-"));
  await
  upsertProvider(
    agentDir,
    {
      name: "mmx-test",
      baseUrl: "https://api.minimaxi.com/anthropic/v1",
      api: "anthropic-messages",
      apiKey: "sk-test",
      models: [{ id: "MiniMax-M3" }],
    },
    { keyStorage: "literal" },
  );
  const modelsPath = join(agentDir, "models.json");
  const modelsFile = JSON.parse(readFileSync(modelsPath, "utf-8")) as {
    providers: Record<string, unknown>;
  };
  modelsFile.providers.mmx = {
    baseUrl: "https://api.minimaxi.com/anthropic/v1",
    api: "anthropic-messages",
    models: [{ id: "MiniMax-M3" }],
  };
  writeFileSync(modelsPath, `${JSON.stringify(modelsFile, null, 2)}\n`, "utf-8",);
  await setActive(agentDir, "mmx-test", "MiniMax-M3");

  const runtimeConfig = getRuntimeModelConfig(agentDir);
  assert.deepEqual(runtimeConfig, {
    modelProvider: "mmx-test",
    modelId: "MiniMax-M3",
    modelsPath,
    authPath: join(agentDir, "auth.json"),
  });
  const repaired = JSON.parse(readFileSync(modelsPath, "utf-8")) as {
    providers: Record<string, unknown>;
  };
  assert.equal("mmx" in repaired.providers, true);

  const runtime = await ModelRuntime.create({
    authPath: runtimeConfig.authPath,
    modelsPath: runtimeConfig.modelsPath,
  });
  assert.ok(runtime.getModel("mmx-test", "MiniMax-M3"));
});

test("local config normalizes Anthropic-compatible runtime base URLs", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-pi-config-"));
  await
  upsertProvider(
    agentDir,
    {
      name: "mmx-test",
      baseUrl: "https://api.minimaxi.com/anthropic/v1",
      api: "anthropic-messages",
      apiKey: "sk-test",
      models: [{ id: "MiniMax-M3" }],
    },
    { keyStorage: "literal" },
  );
  await setActive(agentDir, "mmx-test", "MiniMax-M3");

  const modelsPath = join(agentDir, "models.json");
  assert.deepEqual(getRuntimeModelConfig(agentDir), {
    modelProvider: "mmx-test",
    modelId: "MiniMax-M3",
    modelsPath,
    authPath: join(agentDir, "auth.json"),
  });
  const modelsFile = JSON.parse(readFileSync(modelsPath, "utf-8")) as {
    providers: Record<string, { baseUrl?: string }>;
  };
  assert.equal(
    modelsFile.providers["mmx-test"].baseUrl,
    "https://api.minimaxi.com/anthropic",
  );
});

test("core records resource discovery mode in the assembly manifest", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-resources-"));
  const dirs = createSessionDirs(root);
  const appContextPath = join(root, "ALTTHEORY.md");
  const soulPath = join(root, "soul-latest.md");
  const rolePresets = join(root, "role-presets");
  const kb = join(root, "kb");
  const skillsDir = join(root, "skills");
  const instructionPath = join(root, "study.rules");
  mkdirSync(rolePresets, { recursive: true });
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(appContextPath, "Test app context", "utf-8");
  writeFileSync(soulPath, "Test soul", "utf-8");
  writeFileSync(join(rolePresets, "role-conceptual-theory-companion-latest.md"), "Conceptual theory role", "utf-8",);
  writeFileSync(
    join(skillsDir, "summary.md"),
    "---\nname: summary-test\ndescription: Test summary skill\n---\nSummarize.",
    "utf-8",
  );
  writeFileSync(instructionPath, "Do not overextend.", "utf-8");

  const result = await createAltTheorySession({
    ...dirs,
    appContextPath,
    soulPath,
    rolePresetPath: join(rolePresets, "role-conceptual-theory-companion-latest.md",),
    rolePresetSlug: "role-conceptual-theory-companion-latest",
    kbDir: kb,
    kbDomain: "ep-core",
    resourceDiscovery: "internal",
    skillsDir,
    customInstructionPath: instructionPath,
    customInstructionRef: "study.rules",
  });

  try {
    assert.deepEqual(result.manifest.resourceDiscovery, {
      mode: "internal",
      skillsDir: resolve(skillsDir),
    });
    assert.equal(result.manifest.customInstruction.ref, "study.rules");
    assert.match(result.manifest.customInstruction.sha256 ?? "", /^[a-f0-9]{64}$/,);
    assert.deepEqual(
      result.manifest.skills.map((skill) => skill.name),
      ["summary-test"],
    );
    assert.match(result.session.agent.state.systemPrompt, /Do not overextend/);
    assert.match(result.session.agent.state.systemPrompt, /summary-test/);
    const manifest = JSON.parse(
      readFileSync(join(dirs.recordsDir, "assembly-manifest.json"), "utf-8"),
    );
    assert.deepEqual(manifest.resourceDiscovery, {
      mode: "internal",
      skillsDir: resolve(skillsDir),
    });
  } finally {
    result.session.dispose();
  }
});

test("read-only keeps the Work prompt, adds its permission note, and drops the shell", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-prompt-mode-"));
  const dirs = createSessionDirs(root);
  const appContextPath = join(root, "ALTTHEORY.md");
  const soulPath = join(root, "soul-latest.md");
  const rolePresets = join(root, "role-presets");
  const kb = join(root, "kb");
  mkdirSync(rolePresets, { recursive: true });
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  writeFileSync(appContextPath, "Test app context", "utf-8");
  writeFileSync(soulPath, "Test soul", "utf-8");
  writeFileSync(join(rolePresets, "role-conceptual-theory-companion-latest.md"), "Conceptual theory role", "utf-8",);

  const result = await createAltTheorySession({
    ...dirs,
    appContextPath,
    soulPath,
    rolePresetPath: join(rolePresets, "role-conceptual-theory-companion-latest.md",),
    rolePresetSlug: "role-conceptual-theory-companion-latest",
    kbDir: kb,
    kbDomain: "ep-core",
    altMode: "read-only",
    resourceDiscovery: "clean",
  });

  try {
    const prompt = result.session.agent.state.systemPrompt;
    assert.match(prompt, /Alt Theory Application Context/);
    assert.match(prompt, /Test app context/);
    assert.match(prompt, /Soul/);
    assert.match(prompt, /Role/);
    assert.match(prompt, /Alt Theory governs from here/);
    assert.match(prompt, /Permission: Read-only/);
    assert.deepEqual(
      result.session.getActiveToolNames().filter((name) => ["bash", "edit", "write"].includes(name)).sort(),
      ["edit", "write"],
    );
    assert.equal(result.manifest.altMode, "read-only");
    await result.setAltMode("work");
    assert.ok(result.session.getActiveToolNames().includes("bash"));
    assert.doesNotMatch(result.session.agent.state.systemPrompt, /Permission: Read-only/);
  } finally {
    result.session.dispose();
  }
});

test("core allows no soul and no role prompt layers", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-no-soul-role-"));
  const dirs = createSessionDirs(root);
  const appContextPath = join(root, "ALTTHEORY.md");
  const kb = join(root, "kb");
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  writeFileSync(appContextPath, "No optional layers app context", "utf-8");

  const result = await createAltTheorySession({
    ...dirs,
    appContextPath,
    soulPath: null,
    soulSlug: null,
    rolePresetPath: null,
    rolePresetSlug: null,
    kbDir: kb,
    kbDomain: "ep-core",
    resourceDiscovery: "clean",
  });

  try {
    const prompt = result.session.agent.state.systemPrompt;
    assert.match(prompt, /Alt Theory Application Context/);
    assert.doesNotMatch(prompt, /## Soul/);
    assert.doesNotMatch(prompt, /## Role/);
    assert.equal(result.manifest.soul.slug, null);
    assert.equal(result.manifest.soul.path, null);
    assert.equal(result.manifest.rolePreset.slug, null);
    assert.equal(result.manifest.rolePreset.path, null);
  } finally {
    result.session.dispose();
  }
});

test("openAltTheorySession opens existing JSONL and reports runtime drift", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-open-existing-"));
  const dataDir = join(root, "data");
  const rolePresets = join(root, "role-presets");
  const kb = join(root, "kb");
  const appContextPath = join(root, "ALTTHEORY.md");
  const soulPath = join(root, "soul-latest.md");
  const modelsPath = join(root, "models.json");

  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(rolePresets, { recursive: true });
  writeFileSync(appContextPath, "Open existing app context", "utf-8");
  writeFileSync(soulPath, "Open existing soul", "utf-8");
  writeFileSync(join(rolePresets, "role-conceptual-theory-companion-latest.md"), "Conceptual theory role", "utf-8",);
  writeFileSync(join(rolePresets, "alternate.md"), "Alternate role", "utf-8");
  writeFileSync(
    modelsPath,
    JSON.stringify({
      providers: {
        "test-provider": {
          baseUrl: "https://example.invalid/anthropic",
          api: "anthropic-messages",
          apiKey: "TEST_PROVIDER_API_KEY",
          models: [
            {
              id: "test-model",
              reasoning: false,
              input: ["text"],
              contextWindow: 4096,
              maxTokens: 1024,
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
              },
            },
          ],
        },
      },
    }),
    "utf-8",
  );

  const dirs = createSessionDirs(dataDir, "session-open-existing");
  const fresh = await createAltTheorySession({
    ...dirs,
    appContextPath,
    soulPath,
    rolePresetPath: join(rolePresets, "role-conceptual-theory-companion-latest.md",),
    rolePresetSlug: "role-conceptual-theory-companion-latest",
    kbDir: kb,
    kbDomain: "ep-core",
    modelsPath,
    modelProvider: "test-provider",
    modelId: "test-model",
    runtimeApiKey: "runtime-only-test-key",
  });

  const sessionFile = fresh.session.sessionFile;
  assert.ok(sessionFile);
  try {
    fresh.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "existing session context" }],
      api: "openai-completions",
      provider: "test-provider",
      model: "test-model",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    });
  } finally {
    fresh.session.dispose();
  }

  const manifestPath = join(dirs.recordsDir, "assembly-manifest.json");
  const originalManifestText = readFileSync(manifestPath, "utf-8");
  const originalManifest = JSON.parse(originalManifestText);
  const sessionRootEntriesBefore = readdirSync(join(dataDir, "sessions"));

  const opened = await openAltTheorySession({
    ...dirs,
    sessionFile,
    originalManifest,
    appContextPath,
    soulPath,
    rolePresetPath: join(rolePresets, "alternate.md"),
    rolePresetSlug: "alternate",
    kbDir: kb,
    kbDomain: "all",
    modelsPath,
    modelProvider: "test-provider",
    modelId: "test-model",
    runtimeApiKey: "runtime-only-test-key",
  });

  try {
    assert.equal(opened.session.sessionId, "session-open-existing");
    const context = opened.session.sessionManager.buildSessionContext();
    assert.equal(
      context.messages.at(-1)?.content?.[0]?.text,
      "existing session context",
    );
    assert.equal(opened.manifest.openedFrom, "existing");
    assert.equal(opened.manifest.rolePreset.slug, "alternate");
    assert.equal(opened.manifest.kb.domain, "all");
    assert.ok(
      opened.resumeWarnings.some((warning) =>
        warning.includes("role preset differs"),
      ),
    );
    assert.ok(
      opened.resumeWarnings.some((warning) =>
        warning.includes("KB domain differs"),
      ),
    );
    assert.equal(readFileSync(manifestPath, "utf-8"), originalManifestText);
    const resumeManifest = JSON.parse(
      readFileSync(join(dirs.recordsDir, "resume-manifest.json"), "utf-8"),
    );
    assert.equal(resumeManifest.openedFrom, "existing");
    assert.equal(resumeManifest.resumedFrom.rolePresetSlug, "role-conceptual-theory-companion-latest",);
    assert.deepEqual(
      readdirSync(join(dataDir, "sessions")),
      sessionRootEntriesBefore,
    );
  } finally {
    opened.session.dispose();
  }
});

test("buildSessionMetrics combines counters with Pi-native statistics", () => {
  const metrics = buildSessionMetrics(
    {
      getSessionStats: () => ({
        sessionFile: "session.jsonl",
        sessionId: "session-test",
        userMessages: 1,
        assistantMessages: 1,
        toolCalls: 2,
        toolResults: 2,
        totalMessages: 4,
        tokens: {
          input: 10,
          output: 5,
          cacheRead: 3,
          cacheWrite: 2,
          total: 20,
        },
        cost: 0.01,
        contextUsage: {
          tokens: 20,
          contextWindow: 100,
          percent: 20,
        },
      }),
    },
    { turnCount: 1, toolCallCount: 2, messageCount: 1 },
  );

  assert.equal(metrics.turnCount, 1);
  assert.equal(metrics.tokens.total, 20);
  assert.equal(metrics.contextUsage?.percent, 20);

  const root = mkdtempSync(join(tmpdir(), "alt-theory-metrics-"));
  const recordsDir = join(root, "records");
  const path = persistSessionMetrics(recordsDir, metrics);
  assert.equal(path, resolve(recordsDir, "session-metrics.json"));
  assert.deepEqual(JSON.parse(readFileSync(path, "utf-8")), metrics);
});

test("session events are append-only structured records without message bodies", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-events-"));
  appendSessionEvent(root, {
    sessionId: "session-test",
    type: "session_created",
    details: { rolePresetSlug: "role-conceptual-theory-companion-latest" },
  });
  appendSessionEvent(root, {
    sessionId: "session-test",
    type: "kb_selected",
    details: { kbDomain: "ep-core" },
  });

  const raw = readFileSync(join(root, "session-events.jsonl"), "utf-8");
  const events = raw
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    events.map((event) => event.type),
    ["session_created", "kb_selected"],
  );
  assert.equal(raw.includes("message"), false);
  assert.ok(events.every((event) => event.eventId && event.timestamp));
});

test("session catalog and detail expose complete and incomplete sessions", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-session-catalog-"));
  const dataDir = join(root, "data");
  const assetRoot = join(root, "assets");
  const rolePresets = join(assetRoot, "role-presets");
  const kb = join(assetRoot, "kb");
  const appContextPath = join(assetRoot, "ALTTHEORY.md");
  const soulPath = join(assetRoot, "soul-latest.md");
  const modelsPath = join(root, "models.json");

  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(rolePresets, { recursive: true });
  writeFileSync(appContextPath, "Catalog test app context", "utf-8");
  writeFileSync(soulPath, "Catalog test soul", "utf-8");
  writeFileSync(join(rolePresets, "role-conceptual-theory-companion-latest.md"), "Conceptual theory role", "utf-8",);
  writeFileSync(
    modelsPath,
    JSON.stringify({
      providers: {
        "test-provider": {
          baseUrl: "https://example.invalid/anthropic",
          api: "anthropic-messages",
          apiKey: "TEST_PROVIDER_API_KEY",
          models: [
            {
              id: "test-model",
              reasoning: false,
              input: ["text"],
              contextWindow: 4096,
              maxTokens: 1024,
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
              },
            },
          ],
        },
      },
    }),
    "utf-8",
  );

  const completeDirs = createSessionDirs(dataDir, "session-complete");
  const complete = await createAltTheorySession({
    ...completeDirs,
    appContextPath,
    soulPath,
    rolePresetPath: join(rolePresets, "role-conceptual-theory-companion-latest.md",),
    rolePresetSlug: "role-conceptual-theory-companion-latest",
    kbDir: kb,
    kbDomain: "ep-core",
    modelsPath,
    modelProvider: "test-provider",
    modelId: "test-model",
    runtimeApiKey: "runtime-only-test-key",
  });
  try {
    complete.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text: "catalog preview text" }],
      timestamp: Date.now(),
    });
    complete.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "catalog preview text" }],
      api: "openai-completions",
      provider: "test-provider",
      model: "test-model",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    });
    persistSessionMetrics(completeDirs.recordsDir, {
      turnCount: 1,
      toolCallCount: 0,
      messageCount: 1,
      tokens: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
      cost: 0,
      contextUsage: null,
    });
    appendSessionEvent(completeDirs.recordsDir, {
      sessionId: "session-complete",
      type: "session_created",
      details: { kbDomain: "ep-core" },
    });
  } finally {
    complete.session.dispose();
  }

  mkdirSync(join(dataDir, "sessions", "session-incomplete"), {
    recursive: true,
  });
  const emptyV4Dirs = createSessionDirs(dataDir, "session-v4-empty");
  const emptyV4 = await createAltTheorySession({
    ...emptyV4Dirs,
    appContextPath,
    soulPath,
    rolePresetPath: join(rolePresets, "role-conceptual-theory-companion-latest.md",),
    rolePresetSlug: "role-conceptual-theory-companion-latest",
    kbDir: kb,
    kbDomain: "ep-core",
    modelsPath,
    modelProvider: "test-provider",
    modelId: "test-model",
    runtimeApiKey: "runtime-only-test-key",
  });
  try {
    writeFoundationRecords({
      sessionRoot: emptyV4Dirs.sessionRoot,
      recordsDir: emptyV4Dirs.recordsDir,
      manifest: emptyV4.manifest,
    });
  } finally {
    emptyV4.session.dispose();
  }
  writeFileSync(
    join(completeDirs.recordsDir, "discussion-summary.md"),
    "# Summary\n",
    "utf-8",
  );
  writeFileSync(
    join(completeDirs.writeDir, "workspace-note.txt"),
    "workspace note",
    "utf-8",
  );

  const summaries = listSessionSummaries(dataDir).sessions;
  const completeSummary = summaries.find(
    (session) => session.sessionId === "session-complete",
  );
  const incompleteSummary = summaries.find(
    (session) => session.sessionId === "session-incomplete",
  );
  const emptyV4Summary = summaries.find(
    (session) => session.sessionId === "session-v4-empty",
  );
  assert.equal(completeSummary?.status, "available");
  assert.equal(completeSummary?.rolePresetSlug, "role-conceptual-theory-companion-latest",);
  assert.equal(completeSummary?.kbDomain, "ep-core");
  assert.equal(completeSummary?.provider, "test-provider");
  assert.equal(completeSummary?.model, "test-model");
  assert.equal(completeSummary?.messageCount, 1);
  assert.equal(incompleteSummary?.status, "incomplete");
  assert.equal(incompleteSummary?.hasManifest, false);
  assert.equal(incompleteSummary?.hasSessionFile, false);
  assert.equal(emptyV4Summary, undefined);
  assert.equal(
    getSessionRootForRequest(dataDir, ".bad").status,
    "invalid"
  );

  const directDetail = readSessionDetail(dataDir, "session-complete");
  assert.equal((directDetail?.pi.entryCount ?? 0) > 0, true);
  assert.equal(directDetail?.pi.contextMessageCount, 2);
  assert.equal(
    directDetail?.transcriptPreview.at(-1)?.text,
    "catalog preview text",
  );
  assert.equal(directDetail?.events.count, 1);
  const directFiles = listSessionTextFiles(dataDir, "session-complete").files;
  assert.ok(
    directFiles.some(
      (file) => file.root === "records" && file.path === "discussion-summary.md",
    ),
  );
  assert.equal(
    readSessionTextFile(
      dataDir,
      "session-complete",
      "workspace",
      "workspace-note.txt",
    ).content,
    "workspace note",
  );
  assert.equal(
    writeSessionTextFile(
      dataDir,
      "session-complete",
      "records",
      "discussion-summary.md",
      "# Updated\n",
    ).content,
    "# Updated\n",
  );
  assert.throws(
    () =>
      writeSessionTextFile(
        dataDir,
        "session-complete",
        "records",
        "../escape.md",
        "bad",
      ),
    /inside the selected session root/,
  );

  const instance = createAltTheoryServer({
    dataDir,
    appContextPath,
    soulPath,
    rolePresetsDir: rolePresets,
    kbDir: kb,
  });
  await new Promise<void>((resolveListen) => {
    instance.httpServer.listen(0, "127.0.0.1", resolveListen);
  });
  const address = instance.httpServer.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const listResponse = await fetch(`${baseUrl}/api/sessions`);
    const listJson = await listResponse.json();
    assert.equal(listJson.sessions.length >= 2, true);
    assert.ok(
      listJson.sessions.some(
        (session: any) => session.sessionId === "session-complete",
      ),
    );
    assert.equal(
      listJson.sessions.find((session: any) => session.sessionId === "session-complete")?.snippet,
      "catalog preview text",
    );
    const searchResponse = await fetch(`${baseUrl}/api/sessions/search-content?query=preview%20catalog`);
    assert.equal(searchResponse.status, 200);
    assert.ok((await searchResponse.json()).sessionIds.includes("session-complete"));

    const detailResponse = await fetch(
      `${baseUrl}/api/sessions/session-complete`,
    );
    const detailJson = await detailResponse.json();
    assert.equal(detailJson.session.sessionId, "session-complete");
    assert.equal(detailJson.pi.contextMessageCount, 2);
    assert.equal(
      detailJson.transcriptPreview.at(-1).text,
      "catalog preview text",
    );

    const incompleteDetailResponse = await fetch(
      `${baseUrl}/api/sessions/session-incomplete`,
    );
    assert.equal(incompleteDetailResponse.status, 200);
    const incompleteDetailJson = await incompleteDetailResponse.json();
    assert.equal(incompleteDetailJson.session.status, "incomplete");
    assert.equal(incompleteDetailJson.effectiveConfig, null);

    const invalidResponse = await fetch(`${baseUrl}/api/sessions/.bad`);
    assert.equal(invalidResponse.status, 400);

    const missingResponse = await fetch(`${baseUrl}/api/sessions/missing`);
    assert.equal(missingResponse.status, 404);

    const filesResponse = await fetch(
      `${baseUrl}/api/sessions/session-complete/files?root=records`,
    );
    const filesJson = await filesResponse.json();
    assert.ok(
      filesJson.files.some(
        (file: any) => file.path === "discussion-summary.md",
      ),
    );

    const contentResponse = await fetch(
      `${baseUrl}/api/sessions/session-complete/files/content?root=records&path=discussion-summary.md`,
    );
    const contentJson = await contentResponse.json();
    assert.equal(contentJson.content, "# Updated\n");

    const missingContentResponse = await fetch(
      `${baseUrl}/api/sessions/session-complete/files/content?root=records&path=ui-alias.json`,
    );
    assert.equal(missingContentResponse.status, 404);

    const saveResponse = await fetch(
      `${baseUrl}/api/sessions/session-complete/files/content`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root: "records",
          path: "discussion-summary.md",
          content: "# Saved over REST\n",
        }),
      },
    );
    assert.equal(saveResponse.status, 200);
    assert.equal(
      readFileSync(join(completeDirs.recordsDir, "discussion-summary.md"), "utf-8",),
      "# Saved over REST\n",
    );

    const escapeResponse = await fetch(
      `${baseUrl}/api/sessions/session-complete/files/content`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root: "records",
          path: "../escape.md",
          content: "bad",
        }),
      },
    );
    assert.equal(escapeResponse.status, 400);

    const deleteResponse = await fetch(
      `${baseUrl}/api/sessions/session-complete`,
      { method: "DELETE" },
    );
    assert.equal(deleteResponse.status, 200);
    const deleteJson = await deleteResponse.json();
    assert.equal(deleteJson.deleted.recordType, "deleted-session");
    assert.equal(existsSync(join(completeDirs.recordsDir, "deleted.json")), true,);

    const listAfterDelete = await fetch(`${baseUrl}/api/sessions`);
    const listAfterDeleteJson = await listAfterDelete.json();
    assert.equal(
      listAfterDeleteJson.sessions.some(
        (session: any) => session.sessionId === "session-complete",
      ),
      false,
    );
    const recoverableDetail = await fetch(
      `${baseUrl}/api/sessions/session-complete`,
    );
    assert.equal(recoverableDetail.status, 200);
    assert.ok((await recoverableDetail.json()).session.deletedAt);
  } finally {
    await new Promise<void>((resolveClose) => {
      instance.wss.close(() => {
        instance.httpServer.close(() => resolveClose());
      });
    });
  }
});

test("a local server serves every conversation, whatever an old header or account file says", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-local-access-"));
  const dataDir = join(root, "data");
  const rolePresets = join(root, "role-presets");
  const souls = join(root, "soul");
  const kb = join(root, "kb");
  const appContextPath = join(root, "ALTTHEORY.md");
  mkdirSync(rolePresets, { recursive: true });
  mkdirSync(souls, { recursive: true });
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  writeFileSync(appContextPath, "Local access app context", "utf-8");
  writeFileSync(join(rolePresets, "role-conceptual-theory-companion-latest.md"), "Conceptual theory role", "utf-8");
  writeFileSync(join(souls, "soul-latest.md"), "Latest soul", "utf-8");
  // A data folder once used by the hosted study: an account store and a
  // header owned by someone else, marked private with a past expiry.
  mkdirSync(join(dataDir, "accounts"), { recursive: true });
  writeFileSync(join(dataDir, "accounts", "accounts.json"), JSON.stringify({ schemaVersion: 1, accounts: [] }));
  const service = new SessionService({
    dataDir,
    assetPaths: {
      rootDir: root,
      appContextPath,
      instructionsDir: join(root, "instructions"),
      skillsDir: join(root, "skills"),
      soulDir: souls,
      soulPath: join(souls, "soul-latest.md"),
      rolePresetsDir: rolePresets,
      kbDir: kb,
      piPromptTemplatesDir: resolve("agent-assets", "prompts", "pi"),
      modelsPath: null,
    },
    kbDir: kb,
    rolePresetsDir: rolePresets,
    soulDir: souls,
    legacySoulPath: join(souls, "soul-latest.md"),
    resourceDiscovery: "clean",
    instructionsDir: join(root, "instructions"),
    runLabel: null,
    testBatch: null,
  });
  const created = await service.createSession({
    rolePresetSlug: "role-conceptual-theory-companion-latest",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  const recordsDir = service.getManifest(created.sessionId).recordsDir;
  const workspacePath = service.getManifest(created.sessionId).sessionCwd;
  writeFileSync(join(workspacePath, "note.md"), "workspace note", "utf-8");
  persistSessionMetrics(recordsDir, {
    turnCount: 1,
    toolCallCount: 0,
    messageCount: 1,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost: 0,
    contextUsage: null,
  });
  await service.disposeAll();
  const headerPath = join(recordsDir, "session.json");
  writeFileSync(headerPath, JSON.stringify({
    ...JSON.parse(readFileSync(headerPath, "utf-8")),
    ownerAccountId: "p02",
    visibility: "private",
    retentionDueAt: "2026-01-01T00:00:00.000Z",
  }));

  const instance = createAltTheoryServer({ dataDir, appContextPath, soulDir: souls, rolePresetsDir: rolePresets, kbDir: kb });
  await new Promise<void>((resolveListen) => instance.httpServer.listen(0, "127.0.0.1", resolveListen));
  const address = instance.httpServer.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let ws: WebSocket | null = null;
  try {
    const list = await (await fetch(`${baseUrl}/api/sessions`)).json();
    assert.ok(list.sessions.some((session: { sessionId: string }) => session.sessionId === created.sessionId));
    assert.equal((await fetch(`${baseUrl}/api/sessions/${created.sessionId}`)).status, 200);
    const upload = new FormData();
    upload.append("file", new Blob(["local reference"], { type: "text/plain" }), "reference.txt");
    const uploaded = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/files/upload`, { method: "POST", body: upload });
    assert.equal(uploaded.status, 200);
    // Nothing sweeps it: the old expiry means nothing any more.
    assert.ok(existsSync(headerPath));

    // Workspace file routes: download, traversal refused, delete.
    const download = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/files/download?root=workspace&path=note.md`);
    assert.equal(download.status, 200);
    assert.equal(await download.text(), "workspace note");
    const traversal = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/files/download?root=workspace&path=../session.json`);
    assert.equal(traversal.status, 400);
    const removed = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/files/content?root=workspace&path=note.md`, { method: "DELETE" });
    assert.equal(removed.status, 200);
    assert.equal(existsSync(join(workspacePath, "note.md")), false);

    // A conversation in Trash cannot be opened over the socket.
    assert.equal((await fetch(`${baseUrl}/api/sessions/${created.sessionId}`, { method: "DELETE" })).status, 200);
    ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    const refused = new Promise<any>((resolveMessage) => {
      ws!.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "error") resolveMessage(message);
      });
    });
    await new Promise((resolveOpen) => ws!.once("open", resolveOpen));
    ws.send(JSON.stringify({ type: "open_session", payload: { sessionId: created.sessionId } }));
    assert.match((await refused).payload.failure.message, /Conversation is in Trash/);
  } finally {
    ws?.close();
    await new Promise<void>((resolveClose) => {
      instance.wss.close(() => {
        instance.httpServer.close(() => resolveClose());
      });
    });
  }
});

test("WebSocket open_session and Helper placement preserve the intended center state", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-ws-open-session-"));
  const dataDir = join(root, "data");
  const rolePresets = join(root, "role-presets");
  const kb = join(root, "kb");
  const appContextPath = join(root, "ALTTHEORY.md");
  const soulPath = join(root, "soul-latest.md");

  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(rolePresets, { recursive: true });
  writeFileSync(appContextPath, "WS open app context", "utf-8");
  writeFileSync(soulPath, "WS open soul", "utf-8");
  writeFileSync(join(rolePresets, "role-conceptual-theory-companion-latest.md"), "Conceptual theory role", "utf-8",);

  const existingDirs = createSessionDirs(dataDir, "session-ws-open");
  const existing = await createAltTheorySession({
    ...existingDirs,
    appContextPath,
    soulPath,
    rolePresetPath: join(rolePresets, "role-conceptual-theory-companion-latest.md",),
    rolePresetSlug: "role-conceptual-theory-companion-latest",
    kbDir: kb,
    kbDomain: "ep-core",
  });
  try {
    existing.session.sessionManager.appendMessage({
      role: "user",
      content: [
        {
          type: "text",
          text: "[Context: Search in /tmp/kb/ep-core/ unless user says otherwise.]\nhello before resume",
        },
      ],
      timestamp: Date.now(),
    });
    existing.session.sessionManager.appendMessage({
      role: "tool",
      content: [{ type: "text", text: "large tool output should not render" }],
      timestamp: Date.now(),
    } as any);
    existing.session.sessionManager.appendMessage({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "resume hidden reasoning" },
        { type: "text", text: "websocket existing context" },
      ],
      api: "openai-completions",
      provider: "test",
      model: "test",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    });
    persistSessionMetrics(existingDirs.recordsDir, {
      turnCount: 1,
      toolCallCount: 0,
      messageCount: 2,
      tokens: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
      cost: 0,
      contextUsage: null,
    });
  } finally {
    existing.session.dispose();
  }

  const instance = createAltTheoryServer({
    dataDir,
    appContextPath,
    soulPath,
    rolePresetsDir: rolePresets,
    kbDir: kb,
  });
  await new Promise<void>((resolveListen) => {
    instance.httpServer.listen(0, "127.0.0.1", resolveListen);
  });
  const address = instance.httpServer.address();
  assert.ok(address && typeof address === "object");

  function waitForType(ws: WebSocket, type: string): Promise<any> {
    return new Promise((resolveMessage, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for ${type}`)),
        10_000,
      );
      const listener = (data: WebSocket.RawData) => {
        const message = JSON.parse(data.toString());
        if (message.type === type) {
          clearTimeout(timer);
          ws.off("message", listener);
          resolveMessage(message);
        }
      };
      ws.on("message", listener);
    });
  }

  const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
  const initialDraftPromise = waitForType(ws, "session_draft");

  try {
    const initialDraft = await initialDraftPromise;
    assert.equal(initialDraft.payload.status, "draft");
    assert.equal(initialDraft.payload.rolePresetSlug, "role-conceptual-theory-companion-latest",);
    assert.equal(initialDraft.payload.currentDomain, "ep-core");
    const sessionRootsAfterConnect = readdirSync(join(dataDir, "sessions"));
    assert.deepEqual(sessionRootsAfterConnect, ["session-ws-open"]);

    const missingErrorPromise = waitForType(ws, "error");
    ws.send(
      JSON.stringify({
        type: "open_session",
        payload: { sessionId: "missing-session" },
      }),
    );
    const missingError = await missingErrorPromise;
    assert.match(missingError.payload.failure.message, /Unknown session id/);

    const stillCurrentPromise = waitForType(ws, "session_draft");
    ws.send(JSON.stringify({ type: "get_session_metadata" }));
    const stillCurrent = await stillCurrentPromise;
    assert.equal(stillCurrent.payload.status, "draft");

    const openedPromise = waitForType(ws, "session_opened");
    const transcriptPromise = waitForType(ws, "session_transcript");
    const metadataPromise = waitForType(ws, "session_metadata");
    const metricsPromise = waitForType(ws, "session_metrics");
    ws.send(
      JSON.stringify({
        type: "open_session",
        payload: { sessionId: "session-ws-open" },
      }),
    );
    const opened = await openedPromise;
    const transcript = await transcriptPromise;
    const metadata = await metadataPromise;
    const metrics = await metricsPromise;

    assert.equal(opened.payload.sessionId, "session-ws-open");
    assert.equal(opened.payload.openedFrom, "existing");
    assert.equal(metadata.payload.sessionId, "session-ws-open");
    assert.equal(metadata.payload.openedFrom, "existing");
    assert.deepEqual(
      transcript.payload.messages.map((message: any) => ({
        role: message.role,
        text: message.text,
        toolType: message.toolType,
      })),
      [
        { role: "user", text: "hello before resume", toolType: undefined },
        {
          role: "tool",
          text: "large tool output should not render",
          toolType: "result",
        },
        {
          role: "assistant",
          text: "websocket existing context",
          toolType: undefined,
        },
      ],
    );
    assert.equal(
      transcript.payload.messages.find((message: any) => message.role === "tool",)
        ?.toolType,
      "result",
    );
    assert.equal(
      transcript.payload.messages.find((message: any) => message.role === "assistant",)
        ?.thinking,
      "resume hidden reasoning",
    );
    assert.equal(metrics.payload.messageCount, 2);
    assert.deepEqual(
      readdirSync(join(dataDir, "sessions")).sort(),
      sessionRootsAfterConnect.sort(),
    );

    const eventTypes = readFileSync(
      join(existingDirs.recordsDir, "session-events.jsonl"),
      "utf-8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).type);
    assert.ok(eventTypes.includes("session_opened_existing"));
    assert.ok(eventTypes.includes("session_resumed"));

    const childCreatedPromise = waitForType(ws, "related_session_created");
    ws.send(
      JSON.stringify({
        type: "create_helper_session",
        payload: { parentSessionId: "session-ws-open" },
      }),
    );
    const childCreated = await childCreatedPromise;
    assert.equal(childCreated.payload.purpose, "helper");
    const childHeader = JSON.parse(
      readFileSync(
        join(
          dataDir,
          "sessions",
          childCreated.payload.sessionId,
          "records",
          "session.json",
        ),
        "utf-8",
      ),
    );
    assert.deepEqual(childHeader.forkedFrom, {
      sessionId: "session-ws-open",
      purpose: "helper",
    });

    const rootOpenedPromise = waitForType(ws, "session_opened");
    ws.send(
      JSON.stringify({
        type: "create_helper_session",
        payload: { parentSessionId: childCreated.payload.sessionId },
      }),
    );
    const rootOpened = await rootOpenedPromise;
    assert.notEqual(rootOpened.payload.sessionId, childCreated.payload.sessionId);
    const rootHeader = JSON.parse(
      readFileSync(
        join(
          dataDir,
          "sessions",
          rootOpened.payload.sessionId,
          "records",
          "session.json",
        ),
        "utf-8",
      ),
    );
    assert.equal(rootHeader.helper, true);
    assert.equal(rootHeader.forkedFrom, undefined);

    const fallbackOpenedPromise = waitForType(ws, "session_opened");
    ws.send(
      JSON.stringify({
        type: "create_helper_session",
        payload: { parentSessionId: "stale-helper-parent" },
      }),
    );
    const fallbackOpened = await fallbackOpenedPromise;
    assert.notEqual(fallbackOpened.payload.sessionId, rootOpened.payload.sessionId);
  } finally {
    ws.close();
    await new Promise<void>((resolveClose) => {
      instance.wss.close(() => {
        instance.httpServer.close(() => resolveClose());
      });
    });
  }
});

test("every socket on a conversation keeps its events after an idle instance swap", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-ws-two-sockets-"));
  const rolePresets = join(root, "role-presets");
  const kb = join(root, "kb");
  const appContextPath = join(root, "ALTTHEORY.md");
  const soulPath = join(root, "soul-latest.md");
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(rolePresets, { recursive: true });
  writeFileSync(appContextPath, "Two sockets app context", "utf-8");
  writeFileSync(soulPath, "Two sockets soul", "utf-8");
  writeFileSync(join(rolePresets, "role-conceptual-theory-companion-latest.md"), "Role", "utf-8");
  writeFileSync(join(rolePresets, "alternate.md"), "Alternate role", "utf-8");
  // Hermetic: no model configured, nothing read from the machine's Pi agent dir.
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(root, "pi-agent");
  mkdirSync(join(root, "pi-agent"), { recursive: true });
  const instance = createAltTheoryServer({
    dataDir: join(root, "data"),
    appContextPath,
    soulPath,
    rolePresetsDir: rolePresets,
    kbDir: kb,
  });
  await new Promise<void>((resolveListen) => {
    instance.httpServer.listen(0, "127.0.0.1", resolveListen);
  });
  const address = instance.httpServer.address();
  assert.ok(address && typeof address === "object");

  function waitFor(ws: WebSocket, match: (message: any) => boolean): Promise<any> {
    return new Promise((resolveMessage, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out")), 10_000);
      const listener = (data: WebSocket.RawData) => {
        const message = JSON.parse(data.toString());
        if (match(message)) {
          clearTimeout(timer);
          ws.off("message", listener);
          resolveMessage(message);
        }
      };
      ws.on("message", listener);
    });
  }

  const ws1 = new WebSocket(`ws://127.0.0.1:${address.port}`);
  const ws2 = new WebSocket(`ws://127.0.0.1:${address.port}`);
  try {
    await Promise.all([
      waitFor(ws1, (m) => m.type === "session_draft"),
      waitFor(ws2, (m) => m.type === "session_draft"),
    ]);
    // A root Helper materializes a conversation without a model run.
    const created = waitFor(ws1, (m) => m.type === "session_opened");
    ws1.send(JSON.stringify({ type: "create_helper_session", payload: {} }));
    const sessionId = (await created).payload.sessionId;
    const opened2 = waitFor(ws2, (m) => m.type === "session_opened");
    ws2.send(JSON.stringify({ type: "open_session", payload: { sessionId } }));
    await opened2;

    // The idle switch replaces the instance; the other socket hears it
    // without re-attaching (D6: it used to stay on the disposed instance).
    const switched2 = waitFor(
      ws2,
      (m) => m.type === "session_updated" && m.payload.rolePresetSlug === "alternate",
    );
    ws1.send(
      JSON.stringify({ type: "switch_role_preset", payload: { rolePresetSlug: "alternate" } }),
    );
    await switched2;
    // Later events of the replacement reach both sockets as well.
    const running1 = waitFor(ws1, (m) => m.type === "session_updated" && m.payload.status === "running");
    const running2 = waitFor(ws2, (m) => m.type === "session_updated" && m.payload.status === "running");
    const compacted = waitFor(ws2, (m) => m.type === "extension_notice");
    ws2.send(JSON.stringify({ type: "compact" }));
    await Promise.all([running1, running2, compacted]);

    // Request receipts: each id is answered exactly once, accepted or refused.
    const answers: any[] = [];
    ws1.on("message", (data) => {
      const message = JSON.parse(data.toString());
      const id = message.payload?.requestId;
      if (typeof id === "string" && id.startsWith("r-")) answers.push(message);
    });
    const sendRequest = (id: string, body: object) =>
      ws1.send(JSON.stringify({ ...body, requestId: id }));
    const openedAgain = waitFor(ws1, (m) => m.type === "request_done" && m.payload.requestId === "r-open");
    sendRequest("r-open", { type: "open_session", payload: { sessionId } });
    await openedAgain;
    sendRequest("r-missing", { type: "open_session", payload: { sessionId: "missing" } });
    sendRequest("r-role", { type: "switch_role_preset", payload: { rolePresetSlug: null } });
    const compactEnded = waitFor(ws1, (m) => m.type === "extension_notice");
    sendRequest("r-compact", { type: "compact" });
    await compactEnded;
    // Nothing to retry: refused before a run starts.
    sendRequest("r-retry", { type: "retry_latest" });
    await waitFor(ws1, (m) => m.payload?.requestId === "r-retry");
    await new Promise((settleDelay) => setTimeout(settleDelay, 300));
    const byId = new Map<string, string[]>();
    for (const answer of answers) {
      byId.set(answer.payload.requestId, [...(byId.get(answer.payload.requestId) ?? []), answer.type]);
    }
    assert.deepEqual(Object.fromEntries(byId), {
      "r-open": ["request_done"],
      "r-missing": ["error"],
      "r-role": ["request_done"],
      "r-compact": ["request_done"],
      "r-retry": ["error"],
    });
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    ws1.close();
    ws2.close();
    await new Promise<void>((resolveClose) => {
      instance.wss.close(() => {
        instance.httpServer.close(() => resolveClose());
      });
    });
  }
});

test("REST discovery lists assets; a connection holds no draft and greets with the defaults", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-server-"));
  const rolePresets = join(root, "role-presets");
  const souls = join(root, "soul");
  const kb = join(root, "kb");
  const instructions = join(root, "instructions");
  const skills = join(root, "skills");
  const appContextPath = join(root, "ALTTHEORY.md");
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(rolePresets, { recursive: true });
  mkdirSync(souls, { recursive: true });
  mkdirSync(instructions, { recursive: true });
  mkdirSync(skills, { recursive: true });
  writeFileSync(appContextPath, "Test app context", "utf-8");
  writeFileSync(join(souls, "soul-latest.md"), "Latest soul", "utf-8");
  writeFileSync(join(souls, "soul-test.md"), "Test soul", "utf-8");
  writeFileSync(
    join(rolePresets, "role-conceptual-theory-companion-latest.md"),
    "Conceptual theory role",
    "utf-8",
  );
  writeFileSync(
    join(rolePresets, "alternate.md"),
    "Alternate role",
    "utf-8"
  );
  writeFileSync(join(instructions, "default.md"), "Default instruction.", "utf-8",);
  writeFileSync(join(instructions, "study.rules"), "Stay bounded.", "utf-8");
  writeFileSync(
    join(skills, "summary.md"),
    "---\nname: conversation-summary\ndescription: Summary\n---\nSummarize.",
    "utf-8",
  );

  const instance = createAltTheoryServer({
    dataDir: join(root, "data"),
    appContextPath,
    soulDir: souls,
    rolePresetsDir: rolePresets,
    kbDir: kb,
    instructionsDir: instructions,
    skillsDir: skills,
    resourceDiscovery: "internal",
  });

  await new Promise<void>((resolveListen) => {
    instance.httpServer.listen(0, "127.0.0.1", resolveListen);
  });
  const address = instance.httpServer.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  function waitForType(ws: WebSocket, type: string): Promise<any> {
    return new Promise((resolveMessage, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for ${type}`)),
        10_000,
      );
      const listener = (data: WebSocket.RawData) => {
        const message = JSON.parse(data.toString());
        if (message.type === type) {
          clearTimeout(timer);
          ws.off("message", listener);
          resolveMessage(message);
        }
      };
      ws.on("message", listener);
    });
  }

  const ws1 = new WebSocket(`ws://127.0.0.1:${address.port}`);
  const ws2 = new WebSocket(`ws://127.0.0.1:${address.port}`);
  const draft1Promise = waitForType(ws1, "session_draft");
  const draft2Promise = waitForType(ws2, "session_draft");

  try {
    const rolePresetsResponse = await fetch(`${baseUrl}/api/role-presets`);
    assert.deepEqual(await rolePresetsResponse.json(), {
      rolePresets: [
        { slug: "alternate", displayName: "Alternate" },
        { slug: "role-conceptual-theory-companion-latest", displayName: "Role Conceptual Theory Companion Latest", },
      ],
    });
    const soulsResponse = await fetch(`${baseUrl}/api/souls`);
    assert.deepEqual(await soulsResponse.json(), {
      souls: [
        { slug: "soul-latest", displayName: "Soul Latest" },
        { slug: "soul-test", displayName: "Soul Test" },
      ],
    });
    const domainsResponse = await fetch(`${baseUrl}/api/kb-domains`);
    assert.deepEqual(await domainsResponse.json(), {
      domains: [
        { slug: "none", displayName: "Off" },
        { slug: "all", displayName: "All" },
        { slug: "ep-core", displayName: "Ep Core" },
      ],
    });
    const instructionsResponse = await fetch(`${baseUrl}/api/instruction-assets`,);
    assert.deepEqual(await instructionsResponse.json(), {
      instructions: [
        {
          ref: "default.md",
          displayName: "default.md",
          size: Buffer.byteLength("Default instruction."),
        },
        {
          ref: "study.rules",
          displayName: "study.rules",
          size: Buffer.byteLength("Stay bounded."),
        },
      ],
    });
    const skillsResponse = await fetch(`${baseUrl}/api/skills`);
    const skillsJson = await skillsResponse.json();
    const bundledSkill = skillsJson.skills.find(
      (skill: { name: string; source: string }) =>
        skill.name === "conversation-summary" && skill.source === "alt-theory",
    );
    assert.equal(bundledSkill?.enabled, true);
    const [draft1, draft2] = await Promise.all([
      draft1Promise,
      draft2Promise
    ]);
    assert.equal(draft1.payload.status, "draft");
    assert.equal(draft2.payload.status, "draft");
    assert.equal(draft1.payload.rolePresetSlug, "role-conceptual-theory-companion-latest",);
    assert.equal(draft1.payload.soulSlug, "soul-latest");
    assert.equal(draft1.payload.customInstructionRef, "default.md");
    assert.equal(existsSync(join(root, "data", "sessions")), false);

    // M2: a connection holds no draft. A setting sent before a conversation
    // exists is refused (the client keeps its draft and sends it with the
    // first message), and neither connection's defaults move.
    const refusedPromise = waitForType(ws1, "error");
    ws1.send(
      JSON.stringify({
        type: "switch_role_preset",
        payload: { rolePresetSlug: "alternate" },
      }),
    );
    assert.match((await refusedPromise).payload.failure.message, /materialized session is required/);
    const reopened1Promise = waitForType(ws1, "session_draft");
    ws1.send(JSON.stringify({ type: "new_session" }));
    const reopened1 = await reopened1Promise;
    const ws2DraftPromise = waitForType(ws2, "session_draft");
    ws2.send(JSON.stringify({ type: "get_session_metadata" }));
    const ws2Draft = await ws2DraftPromise;
    for (const draft of [reopened1, ws2Draft]) {
      assert.equal(draft.payload.currentDomain, "ep-core");
      assert.equal(draft.payload.rolePresetSlug, "role-conceptual-theory-companion-latest");
      assert.equal(draft.payload.soulSlug, "soul-latest");
      assert.equal(draft.payload.customInstructionRef, "default.md");
    }
    assert.equal(existsSync(join(root, "data", "sessions")), false);
  } finally {
    ws1.close();
    ws2.close();
    await new Promise<void>((resolveClose) => {
      instance.wss.close(() => {
        instance.httpServer.close(() => resolveClose());
      });
    });
  }
  assert.equal(existsSync(join(root, "data", "sessions")), false);
});

test("local mode stays usable without a model and refuses only the prompt", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-local-config-"));
  const dataDir = join(root, "data");
  const agentDir = join(root, "pi-agent");
  const rolePresets = join(root, "role-presets");
  const souls = join(root, "soul");
  const kb = join(root, "kb");
  const appContextPath = join(root, "ALTTHEORY.md");
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(join(agentDir, "skills", "local-test"), { recursive: true });
  mkdirSync(rolePresets, { recursive: true });
  mkdirSync(souls, { recursive: true });
  writeFileSync(appContextPath, "Local app context", "utf-8");
  writeFileSync(join(rolePresets, "role-conceptual-theory-companion-latest.md"), "Conceptual theory role", "utf-8",);
  writeFileSync(join(souls, "soul-latest.md"), "Latest soul", "utf-8");
  writeFileSync(
    join(agentDir, "skills", "local-test", "SKILL.md"),
    "---\nname: local-test\ndescription: Installed locally\n---\nUse this skill.",
    "utf-8",
  );

  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  const instance = createAltTheoryServer({
    dataDir,
    appContextPath,
    soulDir: souls,
    rolePresetsDir: rolePresets,
    kbDir: kb,
  });

  await new Promise<void>((resolveListen) => {
    instance.httpServer.listen(0, "127.0.0.1", resolveListen);
  });
  const address = instance.httpServer.address();
  assert.ok(address && typeof address === "object");

  function waitForType(ws: WebSocket, type: string): Promise<any> {
    return new Promise((resolveMessage, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for ${type}`)),
        10_000,
      );
      const listener = (data: WebSocket.RawData) => {
        const message = JSON.parse(data.toString());
        if (message.type === type) {
          clearTimeout(timer);
          ws.off("message", listener);
          resolveMessage(message);
        }
      };
      ws.on("message", listener);
    });
  }

  const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
  try {
    const draft = waitForType(ws, "session_draft");
    const skillsResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/skills`,
    );
    const skillsJson = await skillsResponse.json();
    const localSkill = skillsJson.skills.find(
      (skill: { name: string }) => skill.name === "local-test",
    );
    assert.equal(localSkill?.enabled, true);
    await draft;
    // Refused before a run starts: an error reply, not a run outcome.
    const refused = waitForType(ws, "error");
    ws.send(JSON.stringify({ type: "prompt", payload: "hello" }));
    const message = await refused;
    assert.match(message.payload.failure.message, /No model is selected/);
    assert.equal(existsSync(join(dataDir, "sessions")), true);
  } finally {
    ws.close();
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
    await new Promise<void>((resolveClose) => {
      instance.wss.close(() => {
        instance.httpServer.close(() => resolveClose());
      });
    });
  }
});

test("dev-debug composes configured Alt Theory skills with Pi discovery", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-debug-skills-"));
  const dirs = createSessionDirs(root);
  const appContextPath = join(root, "ALTTHEORY.md");
  const kb = join(root, "kb");
  const skillsDir = join(root, "skills");
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(appContextPath, "Debug skill context", "utf-8");
  writeFileSync(
    join(skillsDir, "summary.md"),
    "---\nname: alt-summary\ndescription: Alt summary\n---\nSummarize.",
    "utf-8",
  );

  const result = await createAltTheorySession({
    ...dirs,
    appContextPath,
    kbDir: kb,
    kbDomain: "ep-core",
    resourceDiscovery: "dev-debug",
    skillsDir,
  });
  try {
    assert.deepEqual(
      result.manifest.skills.map((skill) => skill.name),
      ["alt-summary"],
    );
    assert.match(result.session.agent.state.systemPrompt, /alt-summary/);
  } finally {
    result.session.dispose();
  }
});

test("a new conversation is created from the draft settings its first request carries", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-ws-draft-create-"));
  const dataDir = join(root, "data");
  const agentDir = join(root, "pi-agent");
  const rolePresets = join(root, "role-presets");
  const souls = join(root, "soul");
  const kb = join(root, "kb");
  const folder = join(root, "project");
  const appContextPath = join(root, "ALTTHEORY.md");
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(rolePresets, { recursive: true });
  mkdirSync(souls, { recursive: true });
  mkdirSync(folder, { recursive: true });
  writeFileSync(appContextPath, "Draft create app context", "utf-8");
  writeFileSync(join(rolePresets, "role-conceptual-theory-companion-latest.md"), "Conceptual theory role", "utf-8");
  writeFileSync(join(rolePresets, "tutor.md"), "Tutor role", "utf-8");
  writeFileSync(join(souls, "soul-latest.md"), "Latest soul", "utf-8");

  // Local mode with no model: the first prompt creates the conversation,
  // then its run is refused — enough to read what it was created with.
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const instance = createAltTheoryServer({
    dataDir,
    appContextPath,
    soulDir: souls,
    rolePresetsDir: rolePresets,
    kbDir: kb,
  });
  await new Promise<void>((resolveListen) => {
    instance.httpServer.listen(0, "127.0.0.1", resolveListen);
  });
  const address = instance.httpServer.address();
  assert.ok(address && typeof address === "object");

  const ws = new WebSocket(`ws://127.0.0.1:${(address as any).port}`);
  const inbox: any[] = [];
  const waiters: Array<{ match: (message: any) => boolean; resolve: (message: any) => void }> = [];
  ws.on("message", (data) => {
    const message = JSON.parse(data.toString());
    inbox.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.match(message)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    }
  });
  const next = (match: (message: any) => boolean) =>
    new Promise<any>((resolveMessage, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out")), 10_000);
      waiters.push({ match, resolve: (message) => { clearTimeout(timer); resolveMessage(message); } });
    });
  const answer = (requestId: string) =>
    next((message) => message.payload?.requestId === requestId);
  const sessionDirs = () =>
    existsSync(join(dataDir, "sessions")) ? readdirSync(join(dataDir, "sessions")).length : 0;

  try {
    // The greeting is the defaults only; nothing about a draft is held here.
    const greeting = await next((message) => message.type === "session_draft");
    // Default permission (Ask): work without Full Access.
    assert.equal(greeting.payload.mode, "work");
    assert.equal(greeting.payload.visibility, "no-export");
    assert.equal(greeting.payload.fullAccess, false);

    // describe_draft answers the thinking level for the draft's model.
    const described = next((message) => message.type === "session_draft");
    ws.send(JSON.stringify({
      type: "describe_draft",
      requestId: "describe",
      payload: { modelOverride: { provider: "test", modelId: "test-model", thinkingLevel: "high" } },
    }));
    assert.deepEqual((await described).payload.modelOverride, {
      provider: "test", modelId: "test-model", thinkingLevel: "high",
    });

    // Each invalid setting is refused and leaves no conversation behind.
    for (const [requestId, create, pattern] of [
      ["bad-visibility", { visibility: "private" }, /Invalid visibility/],
      ["bad-role", { rolePresetSlug: "no-such-role" }, /Unknown role preset/],
      ["bad-kb", { kbDomain: "no-such-kb" }, /Unknown KB domain/],
      ["bad-folder", { workspacePrimaryDir: join(root, "missing") }, /Main folder does not exist/],
    ] as const) {
      const refused = answer(requestId);
      ws.send(JSON.stringify({ type: "prompt", requestId, payload: "hello", create }));
      const reply = await refused;
      assert.equal(reply.type, "error", requestId);
      assert.match(reply.payload.failure.message, pattern);
      assert.equal(sessionDirs(), 0, `${requestId} left nothing behind`);
    }
    assert.equal(inbox.some((message) => message.type === "session_opened"), false);

    // A valid draft: the conversation starts with every setting it carries.
    const opened = next((message) => message.type === "session_opened");
    const refusedRun = answer("create");
    ws.send(JSON.stringify({
      type: "prompt",
      requestId: "create",
      payload: "hello",
      create: {
        // A draft saved before Understand was retired: reads as work.
        mode: "understand",
        fullAccess: true,
        rolePresetSlug: "tutor",
        kbDomain: "none",
        visibility: "exportable",
        studyTag: { studyId: "draft-study", batch: "a" },
        workspacePrimaryDir: folder,
      },
    }));
    const snapshot = (await opened).payload;
    assert.equal(snapshot.mode, "work");
    assert.equal(snapshot.fullAccess, true);
    assert.equal(snapshot.rolePresetSlug, "tutor");
    assert.equal(snapshot.currentDomain, "none");
    assert.equal(snapshot.visibility, "exportable");
    assert.deepEqual(snapshot.studyTag, { studyId: "draft-study", batch: "a" });
    assert.equal(snapshot.workspacePrimaryDir, folder);
    assert.match((await refusedRun).payload.failure.message, /No model is selected/);

    // The next draft starts from the defaults again: nothing carried over.
    const fresh = answer("new");
    const defaults = next((message) => message.type === "session_draft");
    ws.send(JSON.stringify({ type: "new_session", requestId: "new" }));
    assert.equal((await defaults).payload.mode, "work");
    assert.equal((await fresh).type, "request_done");
  } finally {
    ws.close();
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await new Promise<void>((resolveClose) => {
      instance.wss.close(() => {
        instance.httpServer.close(() => resolveClose());
      });
    });
  }
});
