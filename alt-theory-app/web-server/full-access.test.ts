/**
 * Full Access (v1.4.8) focused permission tests.
 *
 * Covers the plan's focused proof: mediation preserved when off, bypassed
 * when effective, restored when turned back off; enable rejected outside
 * work-capable modes; value retained-but-dormant across mode switches;
 * fresh sessions start off; Native Pi can enable. Since M2 (2026-09-24) the
 * value follows the conversation: header + session-event trace, restored on
 * reopen and instance swap, never inherited by a child.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join, resolve } from "path";
import test from "node:test";
import { createAltTheorySession } from "../core/alt-theory-core.js";
import { createSessionDirs } from "../core/data-dir.js";
import { createSecurityExtension } from "../core/security-extension.js";
import { SessionService } from "./session-service.js";
import { readV4SessionHeader } from "./session-records.js";

function setupFixture() {
  const root = mkdtempSync(join(tmpdir(), "alt-full-access-"));
  const dataDir = join(root, "data");
  const agentDir = join(root, "agent");
  const modelsPath = join(agentDir, "models.json");
  const authPath = join(agentDir, "auth.json");
  mkdirSync(join(root, "kb"), { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(root, "ALTTHEORY.md"), "Full access test context", "utf-8");
  writeFileSync(modelsPath, JSON.stringify({ providers: {
    test: {
      baseUrl: "https://example.test/v1",
      api: "openai-completions",
      apiKey: "test",
      models: [{ id: "test-model", contextWindow: 16_000, maxTokens: 4_000 }],
    },
  } }), "utf-8");
  writeFileSync(authPath, JSON.stringify({ test: { type: "api_key", key: "test-key" } }), "utf-8");
  return { root, dataDir, modelsPath, authPath };
}

function createTestService(
  fixture: ReturnType<typeof setupFixture>,
): SessionService {
  return new SessionService({
    localMode: true,
    dataDir: fixture.dataDir,
    assetPaths: {
      rootDir: fixture.root,
      appContextPath: join(fixture.root, "ALTTHEORY.md"),
      instructionsDir: join(fixture.root, "instructions"),
      skillsDir: join(fixture.root, "skills"),
      soulDir: join(fixture.root, "soul"),
      soulPath: join(fixture.root, "soul", "soul-latest.md"),
      rolePresetsDir: join(fixture.root, "role-presets"),
      kbDir: join(fixture.root, "kb"),
      piPromptTemplatesDir: resolve("agent-assets", "prompts", "pi"),
      modelsPath: null,
    },
    kbDir: join(fixture.root, "kb"),
    rolePresetsDir: join(fixture.root, "role-presets"),
    soulDir: join(fixture.root, "soul"),
    legacySoulPath: join(fixture.root, "soul", "soul-latest.md"),
    understandReadOnly: true,
    altMode: "understand",
    resourceDiscovery: "clean",
    skillsDir: join(fixture.root, "skills"),
    instructionsDir: join(fixture.root, "instructions"),
    runLabel: null,
    testBatch: null,
    resolveRuntimeModelConfig: () => ({
      modelProvider: "test",
      modelId: "test-model",
      modelsPath: fixture.modelsPath,
      authPath: fixture.authPath,
    }),
  });
}

/** One user + assistant exchange written straight to Pi (no provider). */
async function answerOnce(service: SessionService, sessionId: string): Promise<void> {
  const managed = (service as unknown as {
    sessions: Map<string, { session: { prompt: (text: string) => Promise<void>; sessionManager: { appendMessage(message: unknown): string } } }>;
  }).sessions.get(sessionId)!;
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
    managed.session.sessionManager.appendMessage({ role: "assistant", content: [{ type: "text", text: "ok" }], timestamp: Date.now() });
  };
  await service.runPrompt(sessionId, "hello").completion;
}

/** The Full Access trace in session-events.jsonl, in order. */
function fullAccessTrace(recordsDir: string): boolean[] {
  return readFileSync(join(recordsDir, "session-events.jsonl"), "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string; details?: { enabled?: boolean } })
    .filter((event) => event.type === "full_access_changed")
    .map((event) => event.details?.enabled === true);
}

const selectors = {
  rolePresetSlug: null,
  kbDomain: "none",
  soulSlug: null,
};

test("full access bypasses security-extension mediation; off restores it", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-full-access-ext-"));
  const writable = join(root, "writable");
  mkdirSync(writable, { recursive: true });
  let full = false;
  const factory = createSecurityExtension({
    sessionCwd: root,
    getWritableRoots: () => [{ path: writable, reason: "session-write" }],
    getReadableRoots: () => [{ path: writable, reason: "cwd" }],
    isFullAccess: () => full,
  });
  let handler: ((event: unknown, ctx: unknown) => Promise<unknown>) | null =
    null;
  factory({
    on: (event: string, h: typeof handler) => {
      if (event === "tool_call") handler = h;
    },
  } as never);
  assert.ok(handler, "extension registered its tool_call handler");

  const call = (toolName: string, input: Record<string, unknown>) =>
    handler!(
      { toolName, toolCallId: "tc1", input },
      { hasUI: false, ui: {}, signal: undefined },
    );

  // Off (ask mode): each mediation class fires — command blocklist,
  // write outside roots, sensitive-path read, read outside the workspace,
  // custom-tool SSRF.
  const sudoOff = (await call("bash", { command: "sudo rm -rf /" })) as
    | { block?: boolean }
    | undefined;
  assert.equal(sudoOff?.block, true, "sudo blocked while off");
  const writeOff = (await call("write", {
    path: join(root, "elsewhere", "x.txt"),
    content: "x",
  })) as { block?: boolean } | undefined;
  assert.equal(writeOff?.block, true, "outside-root write blocked while off");
  const sensitiveOff = (await call("read", {
    path: join(homedir(), ".ssh", "id_ed25519"),
  })) as { block?: boolean } | undefined;
  assert.equal(sensitiveOff?.block, true, "credential-path read blocked while off");
  const outsideOff = (await call("read", {
    path: join(tmpdir(), "outside-any-root.txt"),
  })) as { block?: boolean } | undefined;
  assert.equal(
    outsideOff?.block,
    true,
    "read outside workspace fails closed while off (no approval UI)",
  );
  const ssrfOff = (await call("web_fetch", {
    url: "http://169.254.169.254/latest/meta-data",
  })) as { block?: boolean } | undefined;
  assert.equal(ssrfOff?.block, true, "SSRF URL blocked while off");

  // Full effective: the shared handler returns without mediating at all.
  full = true;
  assert.equal(await call("bash", { command: "sudo rm -rf /" }), undefined);
  assert.equal(
    await call("write", { path: join(root, "elsewhere", "x.txt"), content: "x" }),
    undefined,
  );
  assert.equal(
    await call("read", { path: join(homedir(), ".ssh", "id_ed25519") }),
    undefined,
  );
  assert.equal(
    await call("read", { path: join(tmpdir(), "outside-any-root.txt") }),
    undefined,
  );
  assert.equal(
    await call("web_fetch", { url: "http://169.254.169.254/latest/meta-data" }),
    undefined,
  );

  // Back to ask: guards restored.
  full = false;
  const sudoAgain = (await call("bash", { command: "sudo rm -rf /" })) as
    | { block?: boolean }
    | undefined;
  assert.equal(sudoAgain?.block, true, "sudo blocked again after disabling");
});

test("full access lifetime on the managed session", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession(selectors);
  assert.equal(created.fullAccess, false, "starts off");

  // Enabling outside a work-capable mode is rejected by the server path.
  await assert.rejects(
    service.setFullAccess(created.sessionId, true),
    /Full access can only be enabled/,
  );

  // Work mode: enabling works and is projected in the snapshot.
  await service.switchMode(created.sessionId, "work");
  const on = await service.setFullAccess(created.sessionId, true);
  assert.equal(on.fullAccess, true);

  // The header holds it, and the change is traced.
  const recordsDir = join(fixture.dataDir, "sessions", created.sessionId, "records");
  assert.equal(readV4SessionHeader(recordsDir)?.fullAccess, true, "header holds it");
  assert.deepEqual(fullAccessTrace(recordsDir), [true]);

  // Understand keeps the value stored (dormant), not cleared…
  const dormant = await service.switchMode(created.sessionId, "understand");
  assert.equal(dormant.fullAccess, true, "retained while hidden in Understand");
  // …and Work restores it.
  const restored = await service.switchMode(created.sessionId, "work");
  assert.equal(restored.fullAccess, true);

  // Disabling is immediate, even from Understand, and leaves the header.
  await service.switchMode(created.sessionId, "understand");
  const off = await service.setFullAccess(created.sessionId, false);
  assert.equal(off.fullAccess, false);
  assert.equal(readV4SessionHeader(recordsDir)?.fullAccess, undefined, "header cleared");
  assert.deepEqual(fullAccessTrace(recordsDir), [true, false]);

  // Mid-run, an enable waits for the turn's end; turning it off before
  // then takes it back — it does not come true (or persist) at settle.
  await service.switchMode(created.sessionId, "work");
  const internal = service as unknown as {
    sessions: Map<string, { runState: { begin(): void; pendingChanges(): object } }>;
    settle(managed: unknown): Promise<unknown>;
  };
  const managed = internal.sessions.get(created.sessionId)!;
  managed.runState.begin();
  const waiting = await service.setFullAccess(created.sessionId, true);
  assert.equal(waiting.pending?.fullAccess, true, "held for the turn's end");
  const takenBack = await service.setFullAccess(created.sessionId, false);
  assert.equal(takenBack.pending?.fullAccess, undefined, "the pending enable is gone");
  await internal.settle(managed);
  assert.equal(service.getSnapshot(created.sessionId).fullAccess, false, "still off after the turn");
  assert.equal(readV4SessionHeader(recordsDir)?.fullAccess, undefined, "nothing persisted");
  assert.deepEqual(fullAccessTrace(recordsDir), [true, false]);

  // A new conversation starts off.
  const fresh = await service.createSession(selectors, { mode: "work" });
  assert.equal(fresh.fullAccess, false, "fresh runtime starts off");
});

test("full access follows the conversation across restart and instance swap, never into a child", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession(selectors, { mode: "work" });
  await service.setFullAccess(created.sessionId, true);

  // An idle role switch assembles a new instance: it keeps the value.
  mkdirSync(join(fixture.root, "role-presets"), { recursive: true });
  writeFileSync(join(fixture.root, "role-presets", "tutor.md"), "# Tutor\n", "utf-8");
  const swapped = await service.switchAssetSelectors(created.sessionId, { rolePresetSlug: "tutor" });
  assert.equal(swapped.deferred, false);
  assert.equal(swapped.snapshot.fullAccess, true, "kept across the instance swap");
  assert.equal(swapped.snapshot.mode, "work", "an empty conversation keeps its mode too");

  // With history, a swap reopens the Pi file: still on.
  await answerOnce(service, created.sessionId);
  const again = await service.switchAssetSelectors(created.sessionId, { rolePresetSlug: null });
  assert.equal(again.snapshot.fullAccess, true, "kept across a swap with history");

  // A restart (a new service over the same data) reopens it on.
  await service.disposeAll();
  const restarted = createTestService(fixture);
  const reopened = await restarted.openSession(created.sessionId, selectors);
  assert.equal(reopened.fullAccess, true, "restored from the header");

  // Children start without it — the header field is never copied.
  const child = await restarted.forkSession(created.sessionId, "fork");
  assert.equal(child.fullAccess, false, "a branch does not inherit");
  const childRecords = join(fixture.dataDir, "sessions", child.sessionId, "records");
  assert.equal(readV4SessionHeader(childRecords)?.fullAccess, undefined);
  const side = await restarted.createRelatedSession(created.sessionId, "side");
  assert.equal(side.fullAccess, false, "BTW does not inherit");
});

test("native pi can enable full access", async () => {
  const fixture = setupFixture();
  mkdirSync(fixture.dataDir, { recursive: true });
  writeFileSync(
    join(fixture.dataDir, "app-settings.json"),
    JSON.stringify({ schemaVersion: 1, runtimeMode: "native-pi" }),
    "utf-8",
  );
  const service = createTestService(fixture);
  const created = await service.createSession(selectors);
  const on = await service.setFullAccess(created.sessionId, true);
  assert.equal(on.fullAccess, true);
});

test("draft full access applies when the conversation materializes", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  // Work draft + full access: the assembled runtime starts with it on.
  const created = await service.createSession(selectors, {
    mode: "work",
    fullAccess: true,
  });
  assert.equal(created.fullAccess, true);
  const records = join(fixture.dataDir, "sessions", created.sessionId, "records");
  assert.equal(readV4SessionHeader(records)?.fullAccess, true, "created into the header");
  // A draft that went back to Understand keeps the choice dormant (the same
  // rule as a live switch), instead of failing the first message.
  const dormant = await service.createSession(selectors, { mode: "understand", fullAccess: true });
  assert.equal(dormant.fullAccess, true, "held");
  const back = await service.switchMode(dormant.sessionId, "work");
  assert.equal(back.fullAccess, true, "effective once in Work");
});

test("full access is dormant in Understand, effective again back in Work", async () => {
  const root = mkdtempSync(join(tmpdir(), "alt-full-access-core-"));
  const kbDir = join(root, "kb");
  mkdirSync(kbDir, { recursive: true });
  writeFileSync(join(root, "ALTTHEORY.md"), "Dormancy test context", "utf-8");
  const runtime = await createAltTheorySession({
    ...createSessionDirs(join(root, "data"), "full-access-dormancy"),
    appContextPath: join(root, "ALTTHEORY.md"),
    kbDir,
    kbDomain: "none",
    understandReadOnly: true,
    altMode: "work",
    resourceDiscovery: "clean",
  });
  assert.equal(runtime.isFullAccessEffective(), false, "off by default");
  runtime.setFullAccess(true);
  assert.equal(runtime.isFullAccessEffective(), true, "effective in Work");
  await runtime.setAltMode("understand");
  assert.equal(runtime.getFullAccess(), true, "value retained");
  assert.equal(
    runtime.isFullAccessEffective(),
    false,
    "dormant while in Understand",
  );
  await runtime.setAltMode("work");
  assert.equal(
    runtime.isFullAccessEffective(),
    true,
    "effective again back in Work",
  );
});
