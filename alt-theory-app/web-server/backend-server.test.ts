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
  createAltTheorySession,
  openAltTheorySession,
} from "../core/alt-theory-core.js";
import { createSessionDirs } from "../core/data-dir.js";
import {
  isKnownKbDomain,
  listKbDomains,
  listRolePresets,
  resolveRolePresetSlug,
} from "./asset-registry.js";
import { createAltTheoryServer } from "./server.js";
import {
  buildSessionMetrics,
  persistSessionMetrics,
} from "./session-metrics.js";
import { appendSessionEvent } from "./session-events.js";
import {
  getSessionRootForRequest,
  listSessionSummaries,
  readSessionDetail,
} from "./session-store.js";

test("asset registry lists safe sorted slugs and resolves known assets", () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-assets-"));
  const rolePresets = join(root, "role-presets");
  const kb = join(root, "kb");
  mkdirSync(join(kb, "urban"), { recursive: true });
  mkdirSync(join(kb, ".hidden"), { recursive: true });
  mkdirSync(rolePresets, { recursive: true });
  writeFileSync(join(rolePresets, "zeta_role.md"), "z", "utf-8");
  writeFileSync(join(rolePresets, "alpha.md"), "a", "utf-8");
  writeFileSync(join(rolePresets, ".hidden.md"), "h", "utf-8");
  writeFileSync(join(rolePresets, "ignore.txt"), "x", "utf-8");

  assert.deepEqual(listRolePresets(rolePresets), [
    { slug: "alpha", displayName: "Alpha" },
    { slug: "zeta_role", displayName: "Zeta Role" },
  ]);
  assert.deepEqual(listKbDomains(kb), [
    { slug: "urban", displayName: "Urban" },
  ]);
  assert.equal(
    resolveRolePresetSlug(rolePresets, "alpha"),
    join(rolePresets, "alpha.md")
  );
  assert.equal(resolveRolePresetSlug(rolePresets, "../alpha"), null);
  assert.equal(isKnownKbDomain(kb, "urban"), true);
  assert.equal(isKnownKbDomain(kb, "all"), true);
  assert.equal(isKnownKbDomain(kb, "../urban"), false);
});

test("write-enabled core exposes write without edit/bash and writes notes", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-write-"));
  const dirs = createSessionDirs(root);
  const modelsPath = join(root, "models.json");
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
    appContextPath: resolve(projectRoot, "agent-assets", "ALTTHEORY.md"),
    soulPath: resolve(projectRoot, "agent-assets", "soul.md"),
    rolePresetPath: resolve(
      projectRoot,
      "agent-assets",
      "role-presets",
      "default.md"
    ),
    rolePresetSlug: "default",
    kbDir: resolve(projectRoot, "agent-assets", "kb"),
    piPromptTemplatesDir: resolve(projectRoot, "agent-assets", "prompts", "pi"),
    modelsPath,
    modelProvider: "test-provider",
    modelId: "test-model",
    runtimeApiKey: "runtime-only-test-key",
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
    assert.ok(
      existsSync(join(dirs.recordsDir, "assembly-manifest.json"))
    );
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

  const summaries = listSessionSummaries(dataDir).sessions;
  const completeSummary = summaries.find(
    (session) => session.sessionId === "session-complete"
  );
  const incompleteSummary = summaries.find(
    (session) => session.sessionId === "session-incomplete"
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

    const invalidResponse = await fetch(`${baseUrl}/api/sessions/.bad`);
    assert.equal(invalidResponse.status, 400);

    const missingResponse = await fetch(`${baseUrl}/api/sessions/missing`);
    assert.equal(missingResponse.status, 404);
  } finally {
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
  const kb = join(root, "kb");
  const appContextPath = join(root, "ALTTHEORY.md");
  const soulPath = join(root, "soul.md");
  mkdirSync(join(kb, "ep-core"), { recursive: true });
  mkdirSync(rolePresets, { recursive: true });
  writeFileSync(appContextPath, "Test app context", "utf-8");
  writeFileSync(soulPath, "Test soul", "utf-8");
  writeFileSync(
    join(rolePresets, "default.md"),
    "Default role preset",
    "utf-8"
  );

  const instance = createAltTheoryServer({
    dataDir: join(root, "data"),
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
  const opened1Promise = waitForType(ws1, "session_opened");
  const opened2Promise = waitForType(ws2, "session_opened");

  try {
    const rolePresetsResponse = await fetch(`${baseUrl}/api/role-presets`);
    assert.deepEqual(await rolePresetsResponse.json(), {
      rolePresets: [{ slug: "default", displayName: "Default" }],
    });
    const domainsResponse = await fetch(`${baseUrl}/api/kb-domains`);
    assert.deepEqual(await domainsResponse.json(), {
      domains: [{ slug: "ep-core", displayName: "Ep Core" }],
    });

    const [opened1, opened2] = await Promise.all([
      opened1Promise,
      opened2Promise,
    ]);
    assert.notEqual(opened1.payload.sessionId, opened2.payload.sessionId);

    const metadataPromise = waitForType(ws1, "session_metadata");
    ws1.send(JSON.stringify({ type: "get_session_metadata" }));
    const metadata = await metadataPromise;
    assert.equal(metadata.payload.sessionId, opened1.payload.sessionId);
    assert.ok(
      existsSync(join(metadata.payload.recordsDir, "assembly-manifest.json"))
    );

    const metricsPromise = waitForType(ws1, "session_metrics");
    ws1.send(JSON.stringify({ type: "get_session_metrics" }));
    const metrics = await metricsPromise;
    assert.deepEqual(
      {
        turnCount: metrics.payload.turnCount,
        toolCallCount: metrics.payload.toolCallCount,
        messageCount: metrics.payload.messageCount,
      },
      { turnCount: 0, toolCallCount: 0, messageCount: 0 }
    );
    assert.equal(typeof metrics.payload.tokens.total, "number");

    ws1.send(
      JSON.stringify({ type: "switch_kb", payload: { domain: "all" } })
    );
    ws1.send(
      JSON.stringify({
        type: "switch_role_preset",
        payload: { rolePresetSlug: "default" },
      })
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
    const eventText = readFileSync(
      join(metadata.payload.recordsDir, "session-events.jsonl"),
      "utf-8"
    );
    const eventTypes = eventText
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).type);
    assert.ok(eventTypes.includes("session_created"));
    assert.ok(eventTypes.includes("kb_selected"));
    assert.ok(eventTypes.includes("role_preset_selected_next_session"));

    const reopened1Promise = waitForType(ws1, "session_opened");
    ws1.send(JSON.stringify({ type: "new_session" }));
    const reopened1 = await reopened1Promise;

    const reopened2Promise = waitForType(ws2, "session_opened");
    ws2.send(JSON.stringify({ type: "new_session" }));
    const reopened2 = await reopened2Promise;

    assert.equal(reopened1.payload.currentDomain, "all");
    assert.equal(reopened1.payload.rolePresetSlug, "default");
    assert.equal(reopened2.payload.currentDomain, "ep-core");
    assert.notEqual(reopened1.payload.sessionId, reopened2.payload.sessionId);
  } finally {
    ws1.close();
    ws2.close();
    await new Promise<void>((resolveClose) => {
      instance.wss.close(() => {
        instance.httpServer.close(() => resolveClose());
      });
    });
  }

  assert.ok(existsSync(join(root, "data", "sessions")));
});
