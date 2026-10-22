import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { writeAppSettings, readAppSettings } from "./app-settings.js";
import { readV4SessionHeader } from "./session-records.js";
import { createTestService, setupFixture } from "./session-service.fixture.js";
import type { SessionServiceEvent } from "./session-service.js";

const selectors = { rolePresetSlug: null, kbDomain: "none", soulSlug: null };

/** The fixture plus a second configured model, so a chain has somewhere to go. */
function fixtureWithTwoModels() {
  const fixture = setupFixture();
  const modelsPath = fixture.runtimeModelConfig.modelsPath;
  const models = JSON.parse(readFileSync(modelsPath, "utf-8"));
  models.providers.test.models.push({ id: "second-model", contextWindow: 16_000, maxTokens: 4_000 });
  writeFileSync(modelsPath, JSON.stringify(models), "utf-8");
  return fixture;
}

const reply = (text: string) => ({
  role: "assistant",
  content: [{ type: "text", text }],
  stopReason: "stop",
  timestamp: Date.now(),
});

test("smart approval lives in the header and stays stored under read-only", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession(selectors, { mode: "work" });
  assert.equal(created.smartApproval, false);
  const on = await service.setSmartApproval(created.sessionId, true);
  assert.equal(on.smartApproval, true);
  const records = join(fixture.dataDir, "sessions", created.sessionId, "records");
  assert.equal(readV4SessionHeader(records)?.smartApproval, true);
  const dormant = await service.switchMode(created.sessionId, "read-only");
  assert.equal(dormant.smartApproval, true, "held, not cleared");
  const off = await service.setSmartApproval(created.sessionId, false);
  assert.equal(off.smartApproval, false);
  assert.equal(readV4SessionHeader(records)?.smartApproval, undefined);
});

test("inheritance cap: a Full or smart parent's children start on smart approval, never Full", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const full = await service.createSession(selectors, { mode: "work", fullAccess: true });
  const side = await service.forkSession(full.sessionId, "side");
  assert.equal(side.fullAccess, false);
  assert.equal(side.smartApproval, true, "Full → smart");
  const smart = await service.createSession(selectors, { mode: "work", smartApproval: true });
  assert.equal((await service.forkSession(smart.sessionId, "fork")).smartApproval, true, "smart → smart");
  const ask = await service.createSession(selectors, { mode: "work" });
  assert.equal((await service.forkSession(ask.sessionId, "side")).smartApproval, false, "Ask → Ask");
  // Later parent changes do not reach existing children.
  await service.setFullAccess(full.sessionId, false);
  assert.equal(service.getSnapshot(side.sessionId).smartApproval, true);
});

test("strict smart approval: stored as \"strict\", kept on reopen, passed on to children", async () => {
  const fixture = setupFixture();
  let service = createTestService(fixture);
  const created = await service.createSession(selectors, { mode: "work", smartApproval: "strict" });
  assert.equal(created.smartApproval, "strict");
  const records = join(fixture.dataDir, "sessions", created.sessionId, "records");
  assert.equal(readV4SessionHeader(records)?.smartApproval, "strict");
  // Ordinary ↔ strict is a change even though both are "on".
  assert.equal((await service.setSmartApproval(created.sessionId, true)).smartApproval, true);
  assert.equal(readV4SessionHeader(records)?.smartApproval, true);
  await service.setSmartApproval(created.sessionId, "strict");
  // One finished turn, so the conversation can be reopened from disk.
  const managed = (service as unknown as {
    sessions: Map<string, { session: { prompt: (text: string) => Promise<void>; sessionManager: { appendMessage: (message: unknown) => void } } }>;
  }).sessions.get(created.sessionId)!;
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
    managed.session.sessionManager.appendMessage(reply("done"));
  };
  await service.runPrompt(created.sessionId, "hello").completion;
  await service.disposeAll();
  service = createTestService(fixture);
  assert.equal((await service.openSession(created.sessionId, selectors)).smartApproval, "strict");
  assert.equal((await service.forkSession(created.sessionId, "side")).smartApproval, "strict", "strict → strict");
  // A Full parent's dormant strict profile is not inherited: its children start on ordinary smart approval.
  const full = await service.createSession(selectors, { mode: "work", fullAccess: true, smartApproval: "strict" });
  assert.equal((await service.forkSession(full.sessionId, "side")).smartApproval, true);
  await service.disposeAll();
});

test("reviewer chain: model → fallback → conversation model at low, each fallback announced", async () => {
  const fixture = fixtureWithTwoModels();
  const service = createTestService(fixture);
  const created = await service.createSession(selectors, { mode: "work", smartApproval: true });
  writeAppSettings(fixture.dataDir, {
    ...readAppSettings(fixture.dataDir),
    approvalReviewer: { model: "test/second-model:medium", fallbackModels: ["test/second-model:high"] },
  });
  const events: SessionServiceEvent[] = [];
  service.attach(created.sessionId, (event) => events.push(event));
  const managed = (service as any).sessions.get(created.sessionId);
  const tried: string[] = [];
  managed.session.modelRuntime.completeSimple = async (model: { id: string }, _context: unknown, options: { reasoning?: string }) => {
    tried.push(`${model.id}:${options.reasoning}`);
    if (model.id === "second-model") throw new Error("quota exhausted");
    return reply('{"outcome":"allow","reason":"the analysis the user asked for"}');
  };
  const verdict = await (service as any).reviewAction(
    created.sessionId,
    {
      toolName: "bash",
      input: { command: "python analyze.py" },
      cwd: "/tmp",
      title: "Run command: python analyze.py",
      entries: [],
      readableFile: () => null,
    },
    { toolCallId: "c1", priorDenials: 0 },
  );
  assert.deepEqual(tried, ["second-model:medium", "second-model:high", "test-model:low"]);
  assert.equal(verdict.outcome, "allow");
  assert.equal(verdict.model, "test/test-model · low");
  const notices = events.filter((event) => event.type === "extension_notice");
  assert.equal(notices.length, 2, "one notice per fallback");
  assert.match((notices[0] as any).payload.message, /second-model · medium did not answer \(quota exhausted\)/);

  // Every level failing (or answering unreadably) hands the action to the user.
  managed.session.modelRuntime.completeSimple = async () => reply("I think it is fine");
  const unavailable = await (service as any).reviewAction(
    created.sessionId,
    { toolName: "bash", input: { command: "x" }, cwd: "/tmp", title: "t", entries: [], readableFile: () => null },
    { toolCallId: "c2", priorDenials: 0 },
  );
  assert.deepEqual(unavailable, { outcome: "unavailable", reason: "the answer could not be read" });
});

test("auto-title chain: a failing pin falls back with a notice", async () => {
  const fixture = fixtureWithTwoModels();
  const service = createTestService(fixture);
  const created = await service.createSession(selectors, { mode: "work" });
  writeAppSettings(fixture.dataDir, {
    ...readAppSettings(fixture.dataDir),
    autoTitle: { enabled: true, model: { provider: "test", modelId: "second-model" }, fallbackModels: [] },
  });
  const events: SessionServiceEvent[] = [];
  service.attach(created.sessionId, (event) => events.push(event));
  const managed = (service as any).sessions.get(created.sessionId);
  managed.session.sessionManager.appendMessage({
    role: "user",
    content: [{ type: "text", text: "Help me plan the interview study." }],
    timestamp: Date.now(),
  });
  managed.session.modelRuntime.completeSimple = async (model: { id: string }, _context: unknown, options: { reasoning?: string }) => {
    assert.equal(options.reasoning, undefined);
    if (model.id === "second-model") return { ...reply(""), stopReason: "error", errorMessage: "model unavailable" };
    return reply("Planning the interview study");
  };
  await (service as any).maybeAutoTitle(managed);
  const alias = JSON.parse(readFileSync(join(managed.manifest.recordsDir, "ui-alias.json"), "utf-8")).alias;
  assert.equal(alias, "Planning the interview study");
  const notices = events.filter((event) => event.type === "extension_notice");
  assert.equal(notices.length, 1);
  assert.match((notices[0] as any).payload.message, /^Auto-name: test\/second-model · off did not answer \(model unavailable\)/);
});

test("reviewer recommendations: online first, the shipped copy when offline", async () => {
  const { reviewerRecommendations } = await import("./reviewer-recommendations.js");
  const presets = join(process.cwd(), "agent-assets", "model-presets");
  const offline = await reviewerRecommendations(presets, async () => {
    throw new Error("offline");
  });
  assert.equal(offline.source, "bundled");
  assert.deepEqual(offline.models, [
    { modelId: "gpt-6-luna", thinking: "low", tag: "preferred" },
    { modelId: "deepseek-flash", aliases: ["deepseek-v4-flash", "deepseek-v4-flash-vision-exp", "deepseek-v4.1-flash"], thinking: "low", tag: "preferred" },
  ]);
  const online = await reviewerRecommendations(presets, async () => ({
    schemaVersion: 1,
    updatedAt: "2026-10-01",
    models: [{ modelId: "next-model", thinking: "low", tag: "faster" }, { modelId: 3 }],
  }));
  assert.deepEqual(online, {
    updatedAt: "2026-10-01",
    models: [{ modelId: "next-model", thinking: "low", tag: "faster" }],
    source: "online",
  });
});
