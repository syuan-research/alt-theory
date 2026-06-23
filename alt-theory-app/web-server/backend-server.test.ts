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
import {
  AuthStorage,
  ModelRegistry,
} from "@mariozechner/pi-coding-agent";
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
  getSessionRootForRequest,
  listSessionTextFiles,
  listSessionSummaries,
  readSessionTextFile,
  readSessionDetail,
  writeSessionTextFile,
} from "./session-store.js";
import { writeFoundationRecords } from "./session-records.js";
import {
  hashLoginCode,
  writeAccountStore,
  type AccountRecord,
} from "./auth-accounts.js";
import {
  getConfigStatus,
  getRuntimeModelConfig,
  setActive,
  upsertProvider,
} from "./config-store.js";

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
  writeFileSync(join(souls, "soul.md"), "base", "utf-8");
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
    { slug: "soul", displayName: "Soul" },
    { slug: "soul-latest", displayName: "Soul Latest" },
  ]);
  assert.equal(
    resolveRolePresetSlug(rolePresets, "alpha"),
    join(rolePresets, "alpha.md")
  );
  assert.equal(resolveRolePresetSlug(rolePresets, "../alpha"), null);
  assert.equal(
    resolveSoulSlug(souls, "soul-latest"),
    join(souls, "soul-latest.md")
  );
  assert.equal(resolveSoulSlug(souls, "../soul"), null);
  assert.equal(isKnownKbDomain(kb, "urban"), true);
  assert.equal(isKnownKbDomain(kb, "all"), true);
  assert.equal(isKnownKbDomain(kb, "../urban"), false);
});

test("local config active model resolves and loads as a Pi custom model", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-pi-config-"));
  upsertProvider(
    agentDir,
    {
      name: "minimax",
      baseUrl: "https://api.minimaxi.com/anthropic/v1",
      api: "anthropic-messages",
      apiKey: "sk-test",
      models: [{ id: "minimax-m3" }],
    },
    { keyStorage: "literal" }
  );
  await setActive(agentDir, "minimax", "minimax-m3");

  const runtimeConfig = getRuntimeModelConfig(agentDir);
  assert.deepEqual(runtimeConfig, {
    modelProvider: "minimax",
    modelId: "minimax-m3",
    modelsPath: join(agentDir, "models.json"),
  });

  const registry = ModelRegistry.create(
    AuthStorage.create(join(agentDir, "auth.json")),
    runtimeConfig.modelsPath
  );
  assert.ok(registry.find("minimax", "minimax-m3"));
});

test("local config runtime ignores literal-key marker when auth key is missing", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-pi-config-"));
  upsertProvider(
    agentDir,
    {
      name: "minimax",
      baseUrl: "https://api.minimaxi.com/anthropic/v1",
      api: "anthropic-messages",
      apiKey: "sk-test",
      models: [{ id: "minimax-m3" }],
    },
    { keyStorage: "literal" }
  );
  await setActive(agentDir, "minimax", "minimax-m3");
  upsertProvider(
    agentDir,
    {
      name: "minimax",
      baseUrl: "https://api.minimaxi.com/anthropic/v1",
      api: "anthropic-messages",
      models: [{ id: "minimax-m3" }],
    },
    { clearKey: true }
  );

  assert.deepEqual(getRuntimeModelConfig(agentDir), {});
});

test("local config refuses to activate a keyless provider", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-pi-config-"));
  upsertProvider(agentDir, {
    name: "opencode-go",
    models: [{ id: "mimo-v2.5-pro" }],
  });

  await assert.rejects(
    () => setActive(agentDir, "opencode-go", "mimo-v2.5-pro"),
    /needs a saved API key or env-var key/
  );
  const status = getConfigStatus(agentDir);
  assert.equal(status.anyUsable, false);
  assert.equal(status.activeUsable, false);
});

test("local config removes stale invalid custom providers before runtime", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-pi-config-"));
  upsertProvider(
    agentDir,
    {
      name: "mmx-test",
      baseUrl: "https://api.minimaxi.com/anthropic/v1",
      api: "anthropic-messages",
      apiKey: "sk-test",
      models: [{ id: "MiniMax-M3" }],
    },
    { keyStorage: "literal" }
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
  writeFileSync(modelsPath, `${JSON.stringify(modelsFile, null, 2)}\n`, "utf-8");
  await setActive(agentDir, "mmx-test", "MiniMax-M3");

  const runtimeConfig = getRuntimeModelConfig(agentDir);
  assert.deepEqual(runtimeConfig, {
    modelProvider: "mmx-test",
    modelId: "MiniMax-M3",
    modelsPath,
  });
  const repaired = JSON.parse(readFileSync(modelsPath, "utf-8")) as {
    providers: Record<string, unknown>;
  };
  assert.equal("mmx" in repaired.providers, false);

  const registry = ModelRegistry.create(
    AuthStorage.create(join(agentDir, "auth.json")),
    runtimeConfig.modelsPath
  );
  assert.ok(registry.find("mmx-test", "MiniMax-M3"));
});

test("local config normalizes Anthropic-compatible runtime base URLs", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "alt-theory-pi-config-"));
  upsertProvider(
    agentDir,
    {
      name: "mmx-test",
      baseUrl: "https://api.minimaxi.com/anthropic/v1",
      api: "anthropic-messages",
      apiKey: "sk-test",
      models: [{ id: "MiniMax-M3" }],
    },
    { keyStorage: "literal" }
  );
  await setActive(agentDir, "mmx-test", "MiniMax-M3");

  const modelsPath = join(agentDir, "models.json");
  assert.deepEqual(getRuntimeModelConfig(agentDir), {
    modelProvider: "mmx-test",
    modelId: "MiniMax-M3",
    modelsPath,
  });
  const modelsFile = JSON.parse(readFileSync(modelsPath, "utf-8")) as {
    providers: Record<string, { baseUrl?: string }>;
  };
  assert.equal(
    modelsFile.providers["mmx-test"].baseUrl,
    "https://api.minimaxi.com/anthropic"
  );
});

test("write-enabled core exposes write without edit/bash and writes notes", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-write-"));
  const dirs = createSessionDirs(root);
  const appContextPath = join(root, "ALTTHEORY.md");
  const soulPath = join(root, "soul.md");
  const rolePresets = join(root, "role-presets");
  const kb = join(root, "kb");
  const modelsPath = join(root, "models.json");
  mkdirSync(rolePresets, { recursive: true });
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  writeFileSync(appContextPath, "Write test app context", "utf-8");
  writeFileSync(soulPath, "Write test soul", "utf-8");
  writeFileSync(join(rolePresets, "default.md"), "Write test role", "utf-8");
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
    "utf-8"
  );
  const projectRoot = process.cwd();
  const result = await createAltTheorySession({
    ...dirs,
    appContextPath,
    soulPath,
    rolePresetPath: join(rolePresets, "default.md"),
    rolePresetSlug: "default",
    kbDir: kb,
    piPromptTemplatesDir: resolve(projectRoot, "agent-assets", "prompts", "pi"),
    modelsPath,
    modelProvider: "test-provider",
    modelId: "test-model",
    runtimeApiKey: "runtime-only-test-key",
    runLabel: "manual-uat-qwen",
    testBatch: "2026-06-12-smoke",
    readOnly: false,
  });

  try {
    const toolNames = result.session.agent.state.tools.map((tool) => tool.name);
    assert.deepEqual(toolNames.sort(), [
      "find",
      "grep",
      "ls",
      "read",
      "write",
    ]);
    assert.match(result.session.agent.state.systemPrompt, /Write Policy/);
    assert.match(
      result.session.agent.state.systemPrompt,
      /Alt Theory Application Context/
    );
    assert.match(result.session.agent.state.systemPrompt, /Role Preset/);
    assert.match(result.session.agent.state.systemPrompt, /workspace/);
    assert.ok(
      result.session.promptTemplates.some((prompt) => prompt.name === "alt_theo")
    );
    assert.ok(result.session.sessionFile);
    assert.equal(result.manifest.provider, "test-provider");
    assert.equal(result.manifest.model, "test-model");
    assert.equal(result.manifest.runLabel, "manual-uat-qwen");
    assert.equal(result.manifest.testBatch, "2026-06-12-smoke");
    assert.equal(result.manifest.appContext.exists, true);
    assert.equal(result.manifest.soul.exists, true);
    assert.equal(result.manifest.rolePreset.slug, "default");
    assert.equal(existsSync(result.session.sessionFile), false);
    result.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "synthetic persistence check" }],
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
    assert.equal(existsSync(result.session.sessionFile), true);

    const writeTool = result.session.agent.state.tools.find(
      (tool) => tool.name === "write"
    );
    assert.ok(writeTool);
    const notePath = join(dirs.writeDir, "smoke.md");
    await writeTool.execute("write-smoke", {
      path: notePath,
      content: "# Backend write smoke\n",
    });
    assert.equal(readFileSync(notePath, "utf-8"), "# Backend write smoke\n");
    assert.ok(result.manifest.writableRoots.includes(resolve(dirs.writeDir)));
    assert.ok(result.manifest.writableRoots.includes(resolve("runs/local-assets")));
    await assert.rejects(
      () =>
        writeTool.execute("write-outside", {
          path: join(root, "outside.md"),
          content: "outside",
        }),
      /outside Alt Theory writable roots/
    );
    await assert.rejects(
      () =>
        writeTool.execute("write-escape", {
          path: join(dirs.writeDir, "..", "escape.md"),
          content: "escape",
        }),
      /outside Alt Theory writable roots|resolves outside Alt Theory writable roots/
    );
    await assert.rejects(
      () =>
        writeTool.execute("write-source", {
          path: resolve("alt-theory-app", "core", "alt-theory-core.ts"),
          content: "source overwrite attempt",
        }),
      /outside Alt Theory writable roots|resolves outside Alt Theory writable roots/
    );
    assert.ok(
      existsSync(join(dirs.recordsDir, "assembly-manifest.json"))
    );
  } finally {
    result.session.dispose();
  }
});

test("core records resource discovery mode in the assembly manifest", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-resources-"));
  const dirs = createSessionDirs(root);
  const appContextPath = join(root, "ALTTHEORY.md");
  const soulPath = join(root, "soul.md");
  const rolePresets = join(root, "role-presets");
  const kb = join(root, "kb");
  const skillsDir = join(root, "skills");
  const instructionPath = join(root, "study.rules");
  mkdirSync(rolePresets, { recursive: true });
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(appContextPath, "Test app context", "utf-8");
  writeFileSync(soulPath, "Test soul", "utf-8");
  writeFileSync(join(rolePresets, "default.md"), "Default role", "utf-8");
  writeFileSync(
    join(skillsDir, "summary.md"),
    "---\nname: summary-test\ndescription: Test summary skill\n---\nSummarize.",
    "utf-8"
  );
  writeFileSync(instructionPath, "Do not overextend.", "utf-8");

  const result = await createAltTheorySession({
    ...dirs,
    appContextPath,
    soulPath,
    rolePresetPath: join(rolePresets, "default.md"),
    rolePresetSlug: "default",
    kbDir: kb,
    kbDomain: "ep-core",
    readOnly: true,
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
    assert.match(result.manifest.customInstruction.sha256 ?? "", /^[a-f0-9]{64}$/);
    assert.deepEqual(
      result.manifest.skills.map((skill) => skill.name),
      ["summary-test"]
    );
    assert.match(result.session.agent.state.systemPrompt, /Do not overextend/);
    assert.match(result.session.agent.state.systemPrompt, /summary-test/);
    const manifest = JSON.parse(
      readFileSync(join(dirs.recordsDir, "assembly-manifest.json"), "utf-8")
    );
    assert.deepEqual(manifest.resourceDiscovery, {
      mode: "internal",
      skillsDir: resolve(skillsDir),
    });
  } finally {
    result.session.dispose();
  }
});

test("alt-only prompt mode replaces Pi base system prompt", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-prompt-mode-"));
  const dirs = createSessionDirs(root);
  const appContextPath = join(root, "ALTTHEORY.md");
  const soulPath = join(root, "soul.md");
  const rolePresets = join(root, "role-presets");
  const kb = join(root, "kb");
  mkdirSync(rolePresets, { recursive: true });
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  writeFileSync(appContextPath, "Test app context", "utf-8");
  writeFileSync(soulPath, "Test soul", "utf-8");
  writeFileSync(join(rolePresets, "default.md"), "Default role", "utf-8");

  const result = await createAltTheorySession({
    ...dirs,
    appContextPath,
    soulPath,
    rolePresetPath: join(rolePresets, "default.md"),
    rolePresetSlug: "default",
    kbDir: kb,
    kbDomain: "ep-core",
    readOnly: true,
    promptMode: "alt-only",
    resourceDiscovery: "clean",
  });

  try {
    const prompt = result.session.agent.state.systemPrompt;
    assert.match(prompt, /Alt Theory Application Context/);
    assert.match(prompt, /Test app context/);
    assert.match(prompt, /Soul/);
    assert.match(prompt, /Role Preset/);
    assert.match(prompt, /operating inside the Pi harness/);
    assert.match(prompt, /do not describe yourself as Pi/);
    assert.match(prompt, /read: read file contents/);
    assert.doesNotMatch(prompt, /expert coding assistant operating inside pi/i);
    assert.doesNotMatch(prompt, /Pi documentation/i);
    assert.doesNotMatch(prompt, /Available skills/i);
    assert.equal(result.manifest.promptMode, "alt-only");
  } finally {
    result.session.dispose();
  }
});

test("core allows no soul and no role preset prompt layers", async () => {
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
    readOnly: true,
    promptMode: "alt-only",
    resourceDiscovery: "clean",
  });

  try {
    const prompt = result.session.agent.state.systemPrompt;
    assert.match(prompt, /Alt Theory Application Context/);
    assert.doesNotMatch(prompt, /## Soul/);
    assert.doesNotMatch(prompt, /## Role Preset/);
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
  const soulPath = join(root, "soul.md");
  const modelsPath = join(root, "models.json");

  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(rolePresets, { recursive: true });
  writeFileSync(appContextPath, "Open existing app context", "utf-8");
  writeFileSync(soulPath, "Open existing soul", "utf-8");
  writeFileSync(join(rolePresets, "default.md"), "Default role", "utf-8");
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
    "utf-8"
  );

  const dirs = createSessionDirs(dataDir, "session-open-existing");
  const fresh = await createAltTheorySession({
    ...dirs,
    appContextPath,
    soulPath,
    rolePresetPath: join(rolePresets, "default.md"),
    rolePresetSlug: "default",
    kbDir: kb,
    kbDomain: "ep-core",
    modelsPath,
    modelProvider: "test-provider",
    modelId: "test-model",
    runtimeApiKey: "runtime-only-test-key",
    readOnly: true,
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
    readOnly: true,
  });

  try {
    assert.equal(opened.session.sessionId, "session-open-existing");
    const context = opened.session.sessionManager.buildSessionContext();
    assert.equal(
      context.messages.at(-1)?.content?.[0]?.text,
      "existing session context"
    );
    assert.equal(opened.manifest.openedFrom, "existing");
    assert.equal(opened.manifest.rolePreset.slug, "alternate");
    assert.equal(opened.manifest.kb.domain, "all");
    assert.ok(
      opened.resumeWarnings.some((warning) =>
        warning.includes("role preset differs")
      )
    );
    assert.ok(
      opened.resumeWarnings.some((warning) =>
        warning.includes("KB domain differs")
      )
    );
    assert.equal(readFileSync(manifestPath, "utf-8"), originalManifestText);
    const resumeManifest = JSON.parse(
      readFileSync(join(dirs.recordsDir, "resume-manifest.json"), "utf-8")
    );
    assert.equal(resumeManifest.openedFrom, "existing");
    assert.equal(resumeManifest.resumedFrom.rolePresetSlug, "default");
    assert.deepEqual(
      readdirSync(join(dataDir, "sessions")),
      sessionRootEntriesBefore
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
    { turnCount: 1, toolCallCount: 2, messageCount: 1 }
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
    details: { rolePresetSlug: "default" },
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
    ["session_created", "kb_selected"]
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
  const soulPath = join(assetRoot, "soul.md");
  const modelsPath = join(root, "models.json");

  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(rolePresets, { recursive: true });
  writeFileSync(appContextPath, "Catalog test app context", "utf-8");
  writeFileSync(soulPath, "Catalog test soul", "utf-8");
  writeFileSync(join(rolePresets, "default.md"), "Default role", "utf-8");
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
    "utf-8"
  );

  const completeDirs = createSessionDirs(dataDir, "session-complete");
  const complete = await createAltTheorySession({
    ...completeDirs,
    appContextPath,
    soulPath,
    rolePresetPath: join(rolePresets, "default.md"),
    rolePresetSlug: "default",
    kbDir: kb,
    kbDomain: "ep-core",
    modelsPath,
    modelProvider: "test-provider",
    modelId: "test-model",
    runtimeApiKey: "runtime-only-test-key",
    readOnly: true,
  });
  try {
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
    rolePresetPath: join(rolePresets, "default.md"),
    rolePresetSlug: "default",
    kbDir: kb,
    kbDomain: "ep-core",
    modelsPath,
    modelProvider: "test-provider",
    modelId: "test-model",
    runtimeApiKey: "runtime-only-test-key",
    readOnly: true,
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
    "utf-8"
  );
  writeFileSync(
    join(completeDirs.writeDir, "workspace-note.txt"),
    "workspace note",
    "utf-8"
  );

  const summaries = listSessionSummaries(dataDir).sessions;
  const completeSummary = summaries.find(
    (session) => session.sessionId === "session-complete"
  );
  const incompleteSummary = summaries.find(
    (session) => session.sessionId === "session-incomplete"
  );
  const emptyV4Summary = summaries.find(
    (session) => session.sessionId === "session-v4-empty"
  );
  assert.equal(completeSummary?.status, "available");
  assert.equal(completeSummary?.rolePresetSlug, "default");
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
  assert.equal(directDetail?.pi.contextMessageCount, 1);
  assert.equal(
    directDetail?.transcriptPreview.at(-1)?.text,
    "catalog preview text"
  );
  assert.equal(directDetail?.events.count, 1);
  const directFiles = listSessionTextFiles(dataDir, "session-complete").files;
  assert.ok(
    directFiles.some(
      (file) => file.root === "records" && file.path === "discussion-summary.md"
    )
  );
  assert.equal(
    readSessionTextFile(
      dataDir,
      "session-complete",
      "workspace",
      "workspace-note.txt"
    ).content,
    "workspace note"
  );
  assert.equal(
    writeSessionTextFile(
      dataDir,
      "session-complete",
      "records",
      "discussion-summary.md",
      "# Updated\n"
    ).content,
    "# Updated\n"
  );
  assert.throws(
    () =>
      writeSessionTextFile(
        dataDir,
        "session-complete",
        "records",
        "../escape.md",
        "bad"
      ),
    /inside the selected session root/
  );

  const instance = createAltTheoryServer({
    dataDir,
    appContextPath,
    soulPath,
    rolePresetsDir: rolePresets,
    kbDir: kb,
    readOnly: true,
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
        (session: any) => session.sessionId === "session-complete"
      )
    );

    const detailResponse = await fetch(
      `${baseUrl}/api/sessions/session-complete`
    );
    const detailJson = await detailResponse.json();
    assert.equal(detailJson.session.sessionId, "session-complete");
    assert.equal(detailJson.pi.contextMessageCount, 1);
    assert.equal(
      detailJson.transcriptPreview.at(-1).text,
      "catalog preview text"
    );

    const incompleteDetailResponse = await fetch(
      `${baseUrl}/api/sessions/session-incomplete`
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
      `${baseUrl}/api/sessions/session-complete/files?root=records`
    );
    const filesJson = await filesResponse.json();
    assert.ok(
      filesJson.files.some(
        (file: any) => file.path === "discussion-summary.md"
      )
    );

    const contentResponse = await fetch(
      `${baseUrl}/api/sessions/session-complete/files/content?root=records&path=discussion-summary.md`
    );
    const contentJson = await contentResponse.json();
    assert.equal(contentJson.content, "# Updated\n");

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
      }
    );
    assert.equal(saveResponse.status, 200);
    assert.equal(
      readFileSync(join(completeDirs.recordsDir, "discussion-summary.md"), "utf-8"),
      "# Saved over REST\n"
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
      }
    );
    assert.equal(escapeResponse.status, 400);

    const deleteResponse = await fetch(
      `${baseUrl}/api/sessions/session-complete`,
      { method: "DELETE" }
    );
    assert.equal(deleteResponse.status, 200);
    const deleteJson = await deleteResponse.json();
    assert.equal(deleteJson.deleted.recordType, "deleted-session");
    assert.equal(existsSync(join(completeDirs.recordsDir, "deleted.json")), true);

    const listAfterDelete = await fetch(`${baseUrl}/api/sessions`);
    const listAfterDeleteJson = await listAfterDelete.json();
    assert.equal(
      listAfterDeleteJson.sessions.some(
        (session: any) => session.sessionId === "session-complete"
      ),
      false
    );
    const recoverableDetail = await fetch(
      `${baseUrl}/api/sessions/session-complete`
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

test("auth routes support cookie round trip without leaking account secrets", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-auth-routes-"));
  const dataDir = join(root, "data");
  const now = "2026-06-16T00:00:00.000Z";
  const participant: AccountRecord = {
    schemaVersion: 1,
    accountId: "p01",
    displayLabel: "Participant 01",
    role: "participant",
    status: "active",
    loginCodeHash: hashLoginCode("code-123", "route-salt"),
    defaultRoleCondition: "conceptual-theory",
    defaultConsent: {
      researcherReadable: true,
      quoteAfterAnonymization: true,
    },
    createdAt: now,
    updatedAt: now,
  };
  writeAccountStore(dataDir, {
    schemaVersion: 1,
    accounts: [
      participant,
      {
        ...participant,
        accountId: "p02",
        displayLabel: "Participant 02",
        status: "disabled",
        loginCodeHash: hashLoginCode("disabled-code", "disabled-route-salt"),
      },
    ],
  });

  const instance = createAltTheoryServer({
    dataDir,
    readOnly: true,
  });
  await new Promise<void>((resolveListen) => {
    instance.httpServer.listen(0, "127.0.0.1", resolveListen);
  });
  const address = instance.httpServer.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const anonymous = await fetch(`${baseUrl}/api/auth/me`);
    assert.deepEqual(await anonymous.json(), {
      auth: {
        accountId: null,
        role: "anonymous",
        displayLabel: null,
        defaultRoleCondition: null,
        defaultConsent: null,
      },
      app: { mode: "hosted" },
      localConfig: null,
    });

    const wrong = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "missing", loginCode: "wrong" }),
    });
    assert.equal(wrong.status, 401);
    assert.deepEqual(await wrong.json(), { error: "Invalid account or code" });

    const disabled = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "p02", loginCode: "disabled-code" }),
    });
    assert.equal(disabled.status, 403);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "p01", loginCode: "code-123" }),
    });
    assert.equal(login.status, 200);
    const loginCookie = login.headers.get("set-cookie");
    assert.match(loginCookie ?? "", /alt_theory_auth=/);
    assert.match(loginCookie ?? "", /HttpOnly/);
    const loginJson = await login.json();
    assert.equal(loginJson.account.accountId, "p01");
    assert.equal(loginJson.account.defaultRoleCondition, "conceptual-theory");
    assert.equal(JSON.stringify(loginJson).includes("loginCodeHash"), false);

    const cookie = loginCookie?.split(";")[0] ?? "";
    const me = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    assert.deepEqual(await me.json(), {
      auth: {
        accountId: "p01",
        role: "participant",
        displayLabel: "Participant 01",
        defaultRoleCondition: "conceptual-theory",
        defaultConsent: {
          researcherReadable: true,
          quoteAfterAnonymization: true,
        },
      },
      app: { mode: "hosted" },
      localConfig: null,
    });

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);

    const afterLogout = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    const afterLogoutJson = await afterLogout.json();
    assert.equal(afterLogoutJson.auth.role, "anonymous");
  } finally {
    await new Promise<void>((resolveClose) => {
      instance.wss.close(() => {
        instance.httpServer.close(() => resolveClose());
      });
    });
  }
});

test("session REST routes filter participant access and preserve researcher access", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-auth-filter-"));
  const dataDir = join(root, "data");
  const rolePresets = join(root, "role-presets");
  const souls = join(root, "soul");
  const kb = join(root, "kb");
  const appContextPath = join(root, "ALTTHEORY.md");
  const piPromptTemplatesDir = resolve("agent-assets", "prompts", "pi");
  const now = "2026-06-16T00:00:00.000Z";

  mkdirSync(rolePresets, { recursive: true });
  mkdirSync(souls, { recursive: true });
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  writeFileSync(appContextPath, "Auth filter app context", "utf-8");
  writeFileSync(join(rolePresets, "default.md"), "Default role", "utf-8");
  writeFileSync(join(souls, "soul-latest.md"), "Latest soul", "utf-8");

  writeAccountStore(dataDir, {
    schemaVersion: 1,
    accounts: [
      {
        schemaVersion: 1,
        accountId: "p01",
        displayLabel: "Participant 01",
        role: "participant",
        status: "active",
        loginCodeHash: hashLoginCode("p01-code", "p01-filter-salt"),
        defaultRoleCondition: "conceptual-theory",
        defaultConsent: {
          researcherReadable: true,
          quoteAfterAnonymization: true,
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        schemaVersion: 1,
        accountId: "researcher",
        displayLabel: "Researcher",
        role: "researcher",
        status: "active",
        loginCodeHash: hashLoginCode("research-code", "research-filter-salt"),
        defaultRoleCondition: null,
        defaultConsent: {
          researcherReadable: true,
          quoteAfterAnonymization: true,
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

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
      piPromptTemplatesDir,
      modelsPath: null,
    },
    kbDir: kb,
    rolePresetsDir: rolePresets,
    soulDir: souls,
    legacySoulPath: join(souls, "soul-latest.md"),
    readOnly: true,
    promptMode: "alt-only",
    resourceDiscovery: "clean",
    instructionsDir: join(root, "instructions"),
    runLabel: null,
    testBatch: null,
  });

  const p01Session = await service.createSession(
    { rolePresetSlug: "default", kbDomain: "ep-core", soulSlug: "soul-latest" },
    {
      ownerAccountId: "p01",
      roleCondition: "conceptual-theory",
      consentSnapshot: {
        researcherReadable: true,
        quoteAfterAnonymization: true,
        privateOverride: false,
      },
    }
  );
  const p01PrivateSession = await service.createSession(
    { rolePresetSlug: "default", kbDomain: "ep-core", soulSlug: "soul-latest" },
    {
      ownerAccountId: "p01",
      roleCondition: "conceptual-theory",
      visibility: "private",
      consentSnapshot: {
        researcherReadable: true,
        quoteAfterAnonymization: true,
        privateOverride: false,
      },
    }
  );
  const p01PrivateWorkspacePath =
    service.getManifest(p01PrivateSession.sessionId).sessionCwd;
  writeFileSync(
    join(p01PrivateWorkspacePath, "private-note.md"),
    "private workspace note",
    "utf-8"
  );
  const p02Session = await service.createSession(
    { rolePresetSlug: "default", kbDomain: "ep-core", soulSlug: "soul-latest" },
    {
      ownerAccountId: "p02",
      roleCondition: "metatheory-oriented",
      consentSnapshot: {
        researcherReadable: true,
        quoteAfterAnonymization: false,
        privateOverride: false,
      },
    }
  );
  const ownerlessSession = await service.createSession({
    rolePresetSlug: "default",
    kbDomain: "ep-core",
    soulSlug: "soul-latest",
  });
  for (const sessionId of [
    p01Session.sessionId,
    p01PrivateSession.sessionId,
    p02Session.sessionId,
    ownerlessSession.sessionId,
  ]) {
    persistSessionMetrics(service.getManifest(sessionId).recordsDir, {
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
  }
  await service.disposeAll();

  const instance = createAltTheoryServer({
    dataDir,
    appContextPath,
    soulDir: souls,
    rolePresetsDir: rolePresets,
    kbDir: kb,
    readOnly: true,
  });
  await new Promise<void>((resolveListen) => {
    instance.httpServer.listen(0, "127.0.0.1", resolveListen);
  });
  const address = instance.httpServer.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function loginCookie(accountId: string, loginCode: string): Promise<string> {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, loginCode }),
    });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie")?.split(";")[0] ?? "";
  }

  try {
    const anonymousList = await fetch(`${baseUrl}/api/sessions`);
    assert.equal(anonymousList.status, 401);

    const participantCookie = await loginCookie("p01", "p01-code");
    const participantList = await fetch(`${baseUrl}/api/sessions`, {
      headers: { Cookie: participantCookie },
    });
    const participantListJson = await participantList.json();
    assert.deepEqual(
      participantListJson.sessions.map((session: any) => session.sessionId),
      [p01PrivateSession.sessionId, p01Session.sessionId]
    );
    assert.equal(
      participantListJson.sessions[0].roleCondition,
      "conceptual-theory"
    );

    const ownDetail = await fetch(
      `${baseUrl}/api/sessions/${p01Session.sessionId}`,
      { headers: { Cookie: participantCookie } }
    );
    assert.equal(ownDetail.status, 200);
    const ownPrivateDetail = await fetch(
      `${baseUrl}/api/sessions/${p01PrivateSession.sessionId}`,
      { headers: { Cookie: participantCookie } }
    );
    assert.equal(ownPrivateDetail.status, 200);
    const privateDownload = await fetch(
      `${baseUrl}/api/sessions/${p01PrivateSession.sessionId}/files/download?root=workspace&path=private-note.md`,
      { headers: { Cookie: participantCookie } }
    );
    assert.equal(privateDownload.status, 200);
    assert.equal(await privateDownload.text(), "private workspace note");
    const privateTraversal = await fetch(
      `${baseUrl}/api/sessions/${p01PrivateSession.sessionId}/files/download?root=workspace&path=../session.json`,
      { headers: { Cookie: participantCookie } }
    );
    assert.equal(privateTraversal.status, 400);
    const privateDelete = await fetch(
      `${baseUrl}/api/sessions/${p01PrivateSession.sessionId}/files/content?root=workspace&path=private-note.md`,
      {
        method: "DELETE",
        headers: { Cookie: participantCookie },
      }
    );
    assert.equal(privateDelete.status, 200);
    assert.equal(
      existsSync(
        join(p01PrivateWorkspacePath, "private-note.md")
      ),
      false
    );
    const otherDetail = await fetch(
      `${baseUrl}/api/sessions/${p02Session.sessionId}`,
      { headers: { Cookie: participantCookie } }
    );
    assert.equal(otherDetail.status, 404);
    const ownerlessDetail = await fetch(
      `${baseUrl}/api/sessions/${ownerlessSession.sessionId}`,
      { headers: { Cookie: participantCookie } }
    );
    assert.equal(ownerlessDetail.status, 404);

    const researcherCookie = await loginCookie("researcher", "research-code");
    const researcherList = await fetch(`${baseUrl}/api/sessions`, {
      headers: { Cookie: researcherCookie },
    });
    const researcherListJson = await researcherList.json();
    assert.equal(researcherListJson.sessions.length, 4);
    assert.ok(
      researcherListJson.sessions.some(
        (session: any) => session.sessionId === ownerlessSession.sessionId
      )
    );
    assert.ok(
      researcherListJson.sessions.some(
        (session: any) =>
          session.sessionId === p01PrivateSession.sessionId &&
          session.visibility === "private"
      )
    );
    const researcherPrivateDetail = await fetch(
      `${baseUrl}/api/sessions/${p01PrivateSession.sessionId}`,
      { headers: { Cookie: researcherCookie } }
    );
    assert.equal(researcherPrivateDetail.status, 403);
    const researcherPrivateFile = await fetch(
      `${baseUrl}/api/sessions/${p01PrivateSession.sessionId}/files/content?root=workspace&path=private-note.md`,
      { headers: { Cookie: researcherCookie } }
    );
    assert.equal(researcherPrivateFile.status, 403);
    const researcherOwnerlessDetail = await fetch(
      `${baseUrl}/api/sessions/${ownerlessSession.sessionId}`,
      { headers: { Cookie: researcherCookie } }
    );
    assert.equal(researcherOwnerlessDetail.status, 200);
  } finally {
    await new Promise<void>((resolveClose) => {
      instance.wss.close(() => {
        instance.httpServer.close(() => resolveClose());
      });
    });
  }
});

test("WebSocket open_session replaces current state with an existing session", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-ws-open-session-"));
  const dataDir = join(root, "data");
  const rolePresets = join(root, "role-presets");
  const kb = join(root, "kb");
  const appContextPath = join(root, "ALTTHEORY.md");
  const soulPath = join(root, "soul.md");

  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(rolePresets, { recursive: true });
  writeFileSync(appContextPath, "WS open app context", "utf-8");
  writeFileSync(soulPath, "WS open soul", "utf-8");
  writeFileSync(join(rolePresets, "default.md"), "Default role", "utf-8");

  const existingDirs = createSessionDirs(dataDir, "session-ws-open");
  const existing = await createAltTheorySession({
    ...existingDirs,
    appContextPath,
    soulPath,
    rolePresetPath: join(rolePresets, "default.md"),
    rolePresetSlug: "default",
    kbDir: kb,
    kbDomain: "ep-core",
    readOnly: true,
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
    readOnly: true,
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
        10_000
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
    assert.equal(initialDraft.payload.rolePresetSlug, "default");
    assert.equal(initialDraft.payload.currentDomain, "ep-core");
    const sessionRootsAfterConnect = readdirSync(join(dataDir, "sessions"));
    assert.deepEqual(sessionRootsAfterConnect, ["session-ws-open"]);

    const missingErrorPromise = waitForType(ws, "error");
    ws.send(
      JSON.stringify({
        type: "open_session",
        payload: { sessionId: "missing-session" },
      })
    );
    const missingError = await missingErrorPromise;
    assert.match(missingError.payload.error, /Unknown session id/);

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
      })
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
      ]
    );
    assert.equal(
      transcript.payload.messages.find((message: any) => message.role === "tool")
        ?.toolType,
      "result"
    );
    assert.equal(
      transcript.payload.messages.find((message: any) => message.role === "assistant")
        ?.thinking,
      "resume hidden reasoning"
    );
    assert.equal(metrics.payload.messageCount, 2);
    assert.deepEqual(
      readdirSync(join(dataDir, "sessions")).sort(),
      sessionRootsAfterConnect.sort()
    );

    const eventTypes = readFileSync(
      join(existingDirs.recordsDir, "session-events.jsonl"),
      "utf-8"
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).type);
    assert.ok(eventTypes.includes("session_opened_existing"));
    assert.ok(eventTypes.includes("session_resumed"));
  } finally {
    ws.close();
    await new Promise<void>((resolveClose) => {
      instance.wss.close(() => {
        instance.httpServer.close(() => resolveClose());
      });
    });
  }
});

test("WebSocket participant first send creates an owned role-conditioned session", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-ws-auth-owned-"));
  const dataDir = join(root, "data");
  const rolePresets = join(root, "role-presets");
  const souls = join(root, "soul");
  const kb = join(root, "kb");
  const appContextPath = join(root, "ALTTHEORY.md");
  const now = "2026-06-16T00:00:00.000Z";

  mkdirSync(rolePresets, { recursive: true });
  mkdirSync(souls, { recursive: true });
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  writeFileSync(appContextPath, "WS auth app context", "utf-8");
  writeFileSync(
    join(rolePresets, "role-conceptual-theory-companion.md"),
    "Conceptual theory role",
    "utf-8"
  );
  writeFileSync(join(souls, "soul-latest.md"), "Latest soul", "utf-8");
  writeAccountStore(dataDir, {
    schemaVersion: 1,
    accounts: [
      {
        schemaVersion: 1,
        accountId: "p01",
        displayLabel: "Participant 01",
        role: "participant",
        status: "active",
        loginCodeHash: hashLoginCode("p01-code", "p01-ws-salt"),
        defaultRoleCondition: "conceptual-theory",
        defaultConsent: {
          researcherReadable: true,
          quoteAfterAnonymization: false,
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  const originalRunPrompt = SessionService.prototype.runPrompt;
  (SessionService.prototype as any).runPrompt = function (
    sessionId: string
  ) {
    return {
      ids: {
        sessionId,
        branchId: "main",
        turnId: "turn-test",
        revisionId: "rev-test",
        runId: "run-test",
      },
      completion: Promise.resolve(),
      abort: async () => {},
    };
  };

  const instance = createAltTheoryServer({
    dataDir,
    appContextPath,
    soulDir: souls,
    rolePresetsDir: rolePresets,
    kbDir: kb,
    readOnly: true,
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
        10_000
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

  try {
    const anonymousWs = new WebSocket(`ws://127.0.0.1:${address.port}`);
    await waitForType(anonymousWs, "session_draft");
    const authRequiredPromise = waitForType(anonymousWs, "error");
    anonymousWs.send(JSON.stringify({ type: "prompt", payload: "hello" }));
    const authRequired = await authRequiredPromise;
    assert.equal(authRequired.payload.error, "Authentication required");
    assert.equal(authRequired.payload.code, "auth_required");
    anonymousWs.close();

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "p01", loginCode: "p01-code" }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`, {
      headers: { Cookie: cookie },
    });
    const draft = await waitForType(ws, "session_draft");
    assert.equal(
      draft.payload.rolePresetSlug,
      "role-conceptual-theory-companion"
    );
    assert.equal(draft.payload.visibility, "research");

    const privateDraftPromise = waitForType(ws, "session_draft");
    ws.send(
      JSON.stringify({
        type: "switch_visibility",
        payload: { visibility: "private" },
      })
    );
    const privateDraft = await privateDraftPromise;
    assert.equal(privateDraft.payload.visibility, "private");

    const openedPromise = waitForType(ws, "session_opened");
    ws.send(JSON.stringify({ type: "prompt", payload: "hello" }));
    const opened = await openedPromise;
    const sessionJson = JSON.parse(
      readFileSync(
        join(dataDir, "sessions", opened.payload.sessionId, "records", "session.json"),
        "utf-8"
      )
    );
    assert.equal(sessionJson.ownerAccountId, "p01");
    assert.equal(sessionJson.roleCondition, "conceptual-theory");
    assert.equal(sessionJson.visibility, "private");
    assert.match(sessionJson.retentionDueAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(sessionJson.consentSnapshot, {
      researcherReadable: false,
      quoteAfterAnonymization: false,
      privateOverride: true,
    });

    const researchUpdatePromise = waitForType(ws, "session_updated");
    ws.send(
      JSON.stringify({
        type: "switch_visibility",
        payload: { visibility: "research" },
      })
    );
    const researchUpdate = await researchUpdatePromise;
    assert.equal(researchUpdate.payload.visibility, "research");
    const researchSessionJson = JSON.parse(
      readFileSync(
        join(dataDir, "sessions", opened.payload.sessionId, "records", "session.json"),
        "utf-8"
      )
    );
    assert.equal(researchSessionJson.visibility, "research");
    assert.equal(researchSessionJson.retentionDueAt, null);
    assert.deepEqual(researchSessionJson.consentSnapshot, {
      researcherReadable: true,
      quoteAfterAnonymization: false,
      privateOverride: false,
    });
    ws.close();
  } finally {
    SessionService.prototype.runPrompt = originalRunPrompt;
    await new Promise<void>((resolveClose) => {
      instance.wss.close(() => {
        instance.httpServer.close(() => resolveClose());
      });
    });
  }
});

test("REST discovery and WebSocket sessions are connection-local", async () => {
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
    join(rolePresets, "default.md"),
    "Default role preset",
    "utf-8"
  );
  writeFileSync(
    join(rolePresets, "alternate.md"),
    "Alternate role preset",
    "utf-8"
  );
  writeFileSync(join(instructions, "study.rules"), "Stay bounded.", "utf-8");
  writeFileSync(
    join(skills, "summary.md"),
    "---\nname: conversation-summary\ndescription: Summary\n---\nSummarize.",
    "utf-8"
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
    readOnly: true,
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
        10_000
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
        { slug: "default", displayName: "Default" },
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
      domains: [{ slug: "ep-core", displayName: "Ep Core" }],
    });
    const instructionsResponse = await fetch(`${baseUrl}/api/instruction-assets`);
    assert.deepEqual(await instructionsResponse.json(), {
      instructions: [
        {
          ref: "study.rules",
          displayName: "study.rules",
          size: Buffer.byteLength("Stay bounded."),
        },
      ],
    });
    const skillsResponse = await fetch(`${baseUrl}/api/skills`);
    const skillsJson = await skillsResponse.json();
    assert.deepEqual(
      skillsJson.skills.map((skill: any) => ({
        name: skill.name,
        source: skill.source,
      })),
      [{ name: "conversation-summary", source: "alt-theory" }]
    );
    const emptyProjectsResponse = await fetch(`${baseUrl}/api/projects`);
    assert.deepEqual(await emptyProjectsResponse.json(), { projects: [] });
    const projectResponse = await fetch(
      `${baseUrl}/api/projects/manual-role-uat`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: "Manual Role UAT",
          defaults: {
            rolePresetSlug: "alternate",
            soulSlug: "soul-test",
            kbDomain: "ep-core",
            modelId: "mimo-v2.5-pro",
            customInstructionRef: "study.rules",
          },
          notes: "local test project",
        }),
      }
    );
    assert.equal(projectResponse.status, 200);
    const savedProject = await projectResponse.json();
    assert.equal(savedProject.projectId, "manual-role-uat");
    assert.equal(savedProject.defaults.rolePresetSlug, "alternate");
    const projectsResponse = await fetch(`${baseUrl}/api/projects`);
    const projectsJson = await projectsResponse.json();
    assert.deepEqual(
      projectsJson.projects.map((project: any) => ({
        projectId: project.projectId,
        displayName: project.displayName,
        defaults: project.defaults,
      })),
      [
        {
          projectId: "manual-role-uat",
          displayName: "Manual Role UAT",
          defaults: {
            rolePresetSlug: "alternate",
            soulSlug: "soul-test",
            kbDomain: "ep-core",
            modelId: "mimo-v2.5-pro",
            customInstructionRef: "study.rules",
          },
        },
      ]
    );

    const [draft1, draft2] = await Promise.all([
      draft1Promise,
      draft2Promise,
    ]);
    assert.equal(draft1.payload.status, "draft");
    assert.equal(draft2.payload.status, "draft");
    assert.equal(draft1.payload.rolePresetSlug, "default");
    assert.equal(draft1.payload.soulSlug, "soul-latest");
    assert.equal(existsSync(join(root, "data", "sessions")), false);

    const projectDraftPromise = waitForType(ws1, "session_draft");
    ws1.send(
      JSON.stringify({
        type: "switch_project",
        payload: { projectId: "manual-role-uat" },
      })
    );
    const projectDraft = await projectDraftPromise;
    assert.equal(projectDraft.payload.projectId, "manual-role-uat");
    assert.equal(projectDraft.payload.rolePresetSlug, "alternate");
    assert.equal(projectDraft.payload.soulSlug, "soul-test");
    assert.equal(projectDraft.payload.currentDomain, "ep-core");
    assert.equal(projectDraft.payload.customInstructionRef, "study.rules");
    assert.equal(existsSync(join(root, "data", "sessions")), false);

    const kbDraftPromise = waitForType(ws1, "session_draft");
    ws1.send(
      JSON.stringify({ type: "switch_kb", payload: { domain: "all" } })
    );
    const kbDraft = await kbDraftPromise;
    assert.equal(kbDraft.payload.currentDomain, "all");

    const soulDraftPromise = waitForType(ws1, "session_draft");
    ws1.send(
      JSON.stringify({
        type: "switch_soul",
        payload: { soulSlug: null },
      })
    );
    const soulDraft = await soulDraftPromise;
    assert.equal(soulDraft.payload.currentDomain, "all");
    assert.equal(soulDraft.payload.rolePresetSlug, "alternate");
    assert.equal(soulDraft.payload.soulSlug, null);

    const roleDraftPromise = waitForType(ws1, "session_draft");
    ws1.send(
      JSON.stringify({
        type: "switch_role_preset",
        payload: { rolePresetSlug: "alternate" },
      })
    );
    const roleDraft = await roleDraftPromise;
    assert.equal(roleDraft.payload.currentDomain, "all");
    assert.equal(roleDraft.payload.rolePresetSlug, "alternate");
    assert.equal(roleDraft.payload.soulSlug, null);

    const ws2DraftPromise = waitForType(ws2, "session_draft");
    ws2.send(JSON.stringify({ type: "get_session_metadata" }));
    const ws2Draft = await ws2DraftPromise;
    assert.equal(ws2Draft.payload.currentDomain, "ep-core");
    assert.equal(ws2Draft.payload.rolePresetSlug, "default");
    assert.equal(ws2Draft.payload.soulSlug, "soul-latest");

    const reopened1Promise = waitForType(ws1, "session_draft");
    ws1.send(JSON.stringify({ type: "new_session" }));
    const reopened1 = await reopened1Promise;

    const reopened2Promise = waitForType(ws2, "session_draft");
    ws2.send(JSON.stringify({ type: "new_session" }));
    const reopened2 = await reopened2Promise;

    assert.equal(reopened1.payload.currentDomain, "all");
    assert.equal(reopened1.payload.rolePresetSlug, "alternate");
    assert.equal(reopened1.payload.soulSlug, null);
    assert.equal(reopened2.payload.currentDomain, "ep-core");
    assert.equal(reopened2.payload.rolePresetSlug, "default");
    assert.equal(reopened2.payload.soulSlug, "soul-latest");
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

test("local mode refuses prompt materialization without usable active model", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-local-config-"));
  const dataDir = join(root, "data");
  const agentDir = join(root, "pi-agent");
  const rolePresets = join(root, "role-presets");
  const souls = join(root, "soul");
  const kb = join(root, "kb");
  const appContextPath = join(root, "ALTTHEORY.md");
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(rolePresets, { recursive: true });
  mkdirSync(souls, { recursive: true });
  writeFileSync(appContextPath, "Local app context", "utf-8");
  writeFileSync(join(rolePresets, "default.md"), "Default role", "utf-8");
  writeFileSync(join(souls, "soul-latest.md"), "Latest soul", "utf-8");

  const previousMode = process.env.ALT_THEORY_MODE;
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.ALT_THEORY_MODE = "local";
  process.env.PI_CODING_AGENT_DIR = agentDir;

  const instance = createAltTheoryServer({
    dataDir,
    appContextPath,
    soulDir: souls,
    rolePresetsDir: rolePresets,
    kbDir: kb,
    readOnly: true,
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
        10_000
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
    await waitForType(ws, "session_draft");
    const failed = waitForType(ws, "run_failed");
    ws.send(JSON.stringify({ type: "prompt", payload: "hello" }));
    const message = await failed;
    assert.match(message.payload.error, /No usable local model is active/);
    assert.equal(existsSync(join(dataDir, "sessions")), false);
  } finally {
    ws.close();
    if (previousMode === undefined) {
      delete process.env.ALT_THEORY_MODE;
    } else {
      process.env.ALT_THEORY_MODE = previousMode;
    }
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
    "utf-8"
  );

  const result = await createAltTheorySession({
    ...dirs,
    appContextPath,
    kbDir: kb,
    kbDomain: "ep-core",
    readOnly: true,
    resourceDiscovery: "dev-debug",
    skillsDir,
  });
  try {
    assert.deepEqual(
      result.manifest.skills.map((skill) => skill.name),
      ["alt-summary"]
    );
    assert.match(result.session.agent.state.systemPrompt, /alt-summary/);
  } finally {
    result.session.dispose();
  }
});
