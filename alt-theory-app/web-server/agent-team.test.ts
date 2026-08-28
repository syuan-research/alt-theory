import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import test from "node:test";
import { SessionService } from "./session-service.js";
import {
  appendAgentMail,
  formatEnvelopeForContext,
  markAgentMailDelivered,
  parseAgentMailFragment,
  readAgentMail,
  undeliveredAgentMail,
  type AgentMailEnvelope,
} from "./agent-mail.js";
import {
  clampSubagentMode,
  createAgentTeamTools,
} from "./agent-team.js";
import { DEFAULT_SUBAGENT_CONFIG } from "./subagent-config.js";
import { readV4SessionHeader } from "./session-records.js";
import { readSessionDetail } from "./session-store.js";

function setupFixture() {
  const root = mkdtempSync(join(tmpdir(), "alt-theory-agent-team-"));
  const dataDir = join(root, "data");
  const rolePresetsDir = join(root, "role-presets");
  const soulDir = join(root, "soul");
  const kbDir = join(root, "kb");
  const skillsDir = join(root, "skills");
  const instructionsDir = join(root, "instructions");
  const agentDir = join(root, "agent");
  const modelsPath = join(agentDir, "models.json");
  const authPath = join(agentDir, "auth.json");
  const appContextPath = join(root, "ALTTHEORY.md");
  const piPromptTemplatesDir = resolve("agent-assets", "prompts", "pi");
  mkdirSync(rolePresetsDir, { recursive: true });
  mkdirSync(soulDir, { recursive: true });
  mkdirSync(join(kbDir, "ep-core"), { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(instructionsDir, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(modelsPath, JSON.stringify({ providers: { test: {
    baseUrl: "https://example.test/v1",
    api: "openai-completions",
    models: [
      { id: "model", name: "Test model", contextWindow: 16_000, maxTokens: 4_000 },
      { id: "model-a", name: "Test model A", contextWindow: 16_000, maxTokens: 4_000 },
      { id: "model-b", name: "Test model B", contextWindow: 16_000, maxTokens: 4_000 },
      { id: "model-c", name: "Test model C", contextWindow: 16_000, maxTokens: 4_000 },
    ],
  } } }), "utf-8");
  writeFileSync(authPath, JSON.stringify({ test: { type: "api_key", key: "test-key" } }), "utf-8");
  writeFileSync(appContextPath, "Agent team app context", "utf-8");
  writeFileSync(join(rolePresetsDir, "role-a.md"), "Role A", "utf-8");
  writeFileSync(join(soulDir, "soul-latest.md"), "Latest soul", "utf-8");
  return {
    root,
    dataDir,
    rolePresetsDir,
    soulDir,
    kbDir,
    skillsDir,
    instructionsDir,
    appContextPath,
    piPromptTemplatesDir,
    modelsPath,
    authPath,
  };
}

function createTestService(fixture: ReturnType<typeof setupFixture>) {
  return new SessionService({
    dataDir: fixture.dataDir,
    assetPaths: {
      rootDir: fixture.root,
      appContextPath: fixture.appContextPath,
      instructionsDir: fixture.instructionsDir,
      skillsDir: fixture.skillsDir,
      soulDir: fixture.soulDir,
      soulPath: join(fixture.soulDir, "soul-latest.md"),
      rolePresetsDir: fixture.rolePresetsDir,
      kbDir: fixture.kbDir,
      piPromptTemplatesDir: fixture.piPromptTemplatesDir,
      modelsPath: fixture.modelsPath,
    },
    kbDir: fixture.kbDir,
    rolePresetsDir: fixture.rolePresetsDir,
    soulDir: fixture.soulDir,
    legacySoulPath: join(fixture.soulDir, "soul-latest.md"),
    understandReadOnly: true,
    altMode: "understand",
    resourceDiscovery: "clean",
    skillsDir: fixture.skillsDir,
    instructionsDir: fixture.instructionsDir,
    runLabel: null,
    testBatch: null,
    resolveRuntimeModelConfig: () => ({
      modelProvider: "test",
      modelId: "model",
      modelsPath: fixture.modelsPath,
      authPath: fixture.authPath,
    }),
  });
}

const SELECTORS = {
  rolePresetSlug: "role-a",
  kbDomain: "ep-core",
  soulSlug: "soul-latest",
};

type StubbableManaged = {
  busy: boolean;
  subagentParentId: string | null;
  subagentConfig: { agents: Array<{ id: string; model: string }> };
  session: {
    prompt(text: string): Promise<void>;
    steer(text: string): Promise<void>;
    sessionManager: { appendMessage(message: unknown): string };
  };
  manifest: { recordsDir: string };
};

function managedOf(service: SessionService, sessionId: string): StubbableManaged {
  return (
    service as unknown as { sessions: Map<string, StubbableManaged> }
  ).sessions.get(sessionId)!;
}

function stubEchoPrompt(managed: StubbableManaged, answer: string): string[] {
  const prompts: string[] = [];
  managed.session.prompt = async (text: string) => {
    prompts.push(text);
    managed.session.sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    });
    managed.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: answer }],
      timestamp: Date.now(),
    });
  };
  return prompts;
}

async function waitFor(predicate: () => boolean, ms = 4000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.ok(predicate(), "condition not reached in time");
}

// ---------------------------------------------------------------------------
// Stateless helpers
// ---------------------------------------------------------------------------

test("clampSubagentMode: children inherit the parent's Alt mode, clamped to it", () => {
  assert.equal(clampSubagentMode("understand", "work"), "understand");
  assert.equal(clampSubagentMode("understand", undefined), "understand");
  assert.equal(clampSubagentMode("work", "work"), "work");
  assert.equal(clampSubagentMode("work", undefined), "work");
  assert.equal(clampSubagentMode("work", "understand"), "understand");
});

test("createAgentTeamTools lets spawned agents delegate and message their parent", () => {
  const bridge = {} as never;
  const leadNames = createAgentTeamTools(bridge, "s1", "lead").map((t) => t.name);
  assert.deepEqual(leadNames, [
    "spawn_agent",
    "send_to_agent",
    "check_agent",
    "wait_for_agents",
    "interrupt_agent",
    "list_agents",
  ]);
  const subagentNames = createAgentTeamTools(bridge, "s2", "subagent").map(
    (t) => t.name,
  );
  assert.deepEqual(subagentNames, [
    "spawn_agent",
    "send_to_agent",
    "check_agent",
    "wait_for_agents",
    "interrupt_agent",
    "list_agents",
    "message_parent",
  ]);
});

test("agent mail roundtrips, marks delivered, and parses fragments", () => {
  const recordsDir = mkdtempSync(join(tmpdir(), "agent-mail-"));
  const envelope: AgentMailEnvelope = {
    at: "2026-07-28T00:00:00.000Z",
    from: "child-1",
    to: "parent-1",
    kind: "lifecycle",
    event: "completed",
    body: "done: the answer",
    delivered: false,
  };
  appendAgentMail(recordsDir, envelope);
  assert.equal(undeliveredAgentMail(recordsDir).length, 1);
  markAgentMailDelivered(recordsDir);
  assert.equal(undeliveredAgentMail(recordsDir).length, 0);
  assert.equal(readAgentMail(recordsDir).length, 1);

  const fragment = formatEnvelopeForContext(envelope, "subagent-1");
  const parsed = parseAgentMailFragment(fragment);
  assert.deepEqual(parsed, {
    fromLabel: "subagent-1",
    event: "completed",
    body: "done: the answer",
  });
  assert.equal(parseAgentMailFragment("plain user text"), null);
});

// ---------------------------------------------------------------------------
// Service integration
// ---------------------------------------------------------------------------

test("spawnSubagent creates a subagent child with clamped mode, alias, and spawned mail", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  try {
    const parent = await service.createSession(SELECTORS);
    stubEchoPrompt(managedOf(service, parent.sessionId), "parent answer");
    const spawned = await service.spawnSubagent(parent.sessionId, {
      message: "summarize the docs",
      name: "docs-subagent",
      mode: "work",
    });
    assert.match(spawned.report, /Spawned subagent "docs-subagent"/);
    assert.match(spawned.report, /understand mode/); // Understand clamps Work

    const child = managedOf(service, spawned.sessionId);
    assert.equal(child.subagentParentId, parent.sessionId);
    const header = readV4SessionHeader(child.manifest.recordsDir);
    assert.deepEqual(header?.forkedFrom, {
      sessionId: parent.sessionId,
      purpose: "subagent",
    });
    const parentMail = readAgentMail(
      managedOf(service, parent.sessionId).manifest.recordsDir,
    );
    assert.ok(
      parentMail.some(
        (envelope) =>
          envelope.kind === "lifecycle" && envelope.event === "spawned",
      ),
    );
    // The subagent resolves by its alias.
    const resolved = (
      service as unknown as {
        resolveSubagentId(parentId: string, agent: string): string;
      }
    ).resolveSubagentId(parent.sessionId, "docs-subagent");
    assert.equal(resolved, spawned.sessionId);
  } finally {
    await service.disposeAll();
  }
});

test("waitForSubagents honors the run abort signal instead of blocking until timeout", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  try {
    const parent = await service.createSession(SELECTORS);
    const child = await service.createSession(SELECTORS, {
      forkedFrom: { sessionId: parent.sessionId, purpose: "subagent" },
    });
    managedOf(service, child.sessionId).busy = true;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 150);
    const startedAt = Date.now();
    const report = await service.waitForSubagents(
      parent.sessionId,
      null,
      10,
      controller.signal,
    );
    assert.ok(
      Date.now() - startedAt < 5000,
      "an aborted signal must release the wait before the timeout",
    );
    assert.match(report, /user's stop/);
    // The stop releases the wait; it must not stop the watched subagent.
    assert.equal(managedOf(service, child.sessionId).busy, true);
  } finally {
    await service.disposeAll();
  }
});

test("a spawned agent can spawn its own direct child", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  try {
    const root = await service.createSession(SELECTORS);
    const child = await service.createSession(SELECTORS, {
      forkedFrom: { sessionId: root.sessionId, purpose: "subagent" },
    });
    const grandchild = await service.spawnSubagent(child.sessionId, {
      message: "explore the follow-up track",
      name: "follow-up",
    });
    assert.equal(managedOf(service, grandchild.sessionId).subagentParentId, child.sessionId);
  } finally {
    await service.disposeAll();
  }
});

test("subagent completion mails the lead and wakes it with a recorded notification turn", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  try {
    const parent = await service.createSession(SELECTORS);
    const parentManaged = managedOf(service, parent.sessionId);
    const parentPrompts = stubEchoPrompt(parentManaged, "noted");

    const child = await service.createSession(SELECTORS, {
      forkedFrom: { sessionId: parent.sessionId, purpose: "subagent" },
    });
    const childManaged = managedOf(service, child.sessionId);
    stubEchoPrompt(childManaged, "subagent answer");

    (
      service as unknown as {
        startSubagentRun(id: string, prompt: string, notify: boolean): string;
      }
    ).startSubagentRun(child.sessionId, "do the task", true);

    await waitFor(() =>
      readAgentMail(parentManaged.manifest.recordsDir).some(
        (envelope) => envelope.event === "completed",
      ),
    );
    const completed = readAgentMail(parentManaged.manifest.recordsDir).find(
      (envelope) => envelope.event === "completed",
    );
    assert.equal(completed?.body, "subagent answer");
    assert.equal(completed?.delivered, true);

    // The wake ran as a real recorded turn on the parent with the tagged
    // fragment; the transcript renders it as an agent-team system line.
    await waitFor(() => parentPrompts.length === 1);
    assert.match(parentPrompts[0], /^<agent-team-mail /);
    await waitFor(() => !parentManaged.busy);
    const transcript =
      readSessionDetail(fixture.dataDir, parent.sessionId)?.transcript ?? [];
    const line = transcript.find((message) => message.marker === "agent-team");
    assert.ok(line, "agent-team transcript line missing");
    assert.match(line!.text, /completed/);
    assert.ok(
      !transcript.some(
        (message) =>
          message.role === "user" && message.text.includes("<agent-team-mail"),
      ),
      "tagged fragment must not render as a user bubble",
    );
  } finally {
    await service.disposeAll();
  }
});

test("message_parent blocker steers a busy lead", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  try {
    const parent = await service.createSession(SELECTORS);
    const parentManaged = managedOf(service, parent.sessionId);
    const child = await service.createSession(SELECTORS, {
      forkedFrom: { sessionId: parent.sessionId, purpose: "subagent" },
    });

    const steered: string[] = [];
    parentManaged.busy = true;
    parentManaged.session.steer = async (text: string) => {
      steered.push(text);
    };

    const reply = await service.messageParent(
      child.sessionId,
      "need the config path",
      "blocker",
    );
    assert.match(reply, /Blocker sent/);
    assert.equal(steered.length, 1);
    assert.match(steered[0], /event="input-requested"/);
    assert.match(steered[0], /need the config path/);
    const mail = readAgentMail(parentManaged.manifest.recordsDir);
    assert.equal(mail.at(-1)?.delivered, true);
  } finally {
    await service.disposeAll();
  }
});

test("mail for a closed lead stays undelivered and is injected on reopen", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  try {
    const parent = await service.createSession(SELECTORS);
    const parentManaged = managedOf(service, parent.sessionId);
    const parentRecordsDir = parentManaged.manifest.recordsDir;
    stubEchoPrompt(parentManaged, "first answer");
    await service.runPrompt(parent.sessionId, "first question").completion;
    const child = await service.createSession(SELECTORS, {
      forkedFrom: { sessionId: parent.sessionId, purpose: "subagent" },
    });

    // Close the lead, then let the subagent message it.
    (
      service as unknown as { sessions: Map<string, unknown> }
    ).sessions.delete(parent.sessionId);
    await service.messageParent(child.sessionId, "late update", "update");
    assert.equal(undeliveredAgentMail(parentRecordsDir).length, 1);

    await service.openSession(parent.sessionId, SELECTORS);
    assert.equal(undeliveredAgentMail(parentRecordsDir).length, 0);
    const transcript =
      readSessionDetail(fixture.dataDir, parent.sessionId)?.transcript ?? [];
    const line = transcript.find((message) => message.marker === "agent-team");
    assert.ok(line, "injected mail missing from transcript");
    assert.match(line!.text, /late update/);
  } finally {
    await service.disposeAll();
  }
});

test("sendToSubagent makes an idle subagent act immediately (owner 2026-08-07: no unread mail)", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  try {
    const parent = await service.createSession(SELECTORS);
    const child = await service.createSession(SELECTORS, {
      forkedFrom: { sessionId: parent.sessionId, purpose: "subagent" },
    });
    const childManaged = managedOf(service, child.sessionId);
    const prompts = stubEchoPrompt(childManaged, "chapter 1 done");
    await service.runPrompt(child.sessionId, "cover chapter 1").completion;
    const reply = await service.sendToSubagent(
      parent.sessionId,
      child.sessionId,
      "please also cover chapter 2",
    );
    assert.match(reply, /acting on your message now/);
    await waitFor(() => prompts.length === 2);
    assert.match(prompts[1], /chapter 2/);
  } finally {
    await service.disposeAll();
  }
});

test("formatEnvelopeForContext survives quotes in a subagent label", () => {
  const fragment = formatEnvelopeForContext(
    {
      at: new Date().toISOString(),
      from: "child-1",
      to: "parent-1",
      kind: "message",
      body: "hello",
      delivered: true,
    },
    'my "cool" subagent',
  );
  const parsed = parseAgentMailFragment(fragment);
  assert.ok(parsed, "fragment with quoted label must still parse");
  assert.equal(parsed!.fromLabel, "my 'cool' subagent");
  assert.equal(parsed!.body, "hello");
});

test("a queued subagent is not double-queued by send_to_agent and can be removed by interrupt", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  try {
    const parent = await service.createSession(SELECTORS);
    const subagents: string[] = [];
    const child = await service.createSession(SELECTORS, {
      forkedFrom: { sessionId: parent.sessionId, purpose: "subagent" },
    });
    subagents.push(child.sessionId);
    const queuedPrompts = stubEchoPrompt(managedOf(service, child.sessionId), "late");
    const svc = service as unknown as {
      startSubagentRun(id: string, prompt: string, notify: boolean): string;
      subagentQueue: unknown[];
      queuedSubagentIds: Set<string>;
      runningSubagentRuns: number;
    };
    svc.runningSubagentRuns = 10;
    assert.equal(svc.startSubagentRun(child.sessionId, "the task", false), "queued");

    // send_to_agent on a queued subagent must not queue a second run; the
    // message joins its context instead.
    const reply = await service.sendToSubagent(
      parent.sessionId,
      child.sessionId,
      "extra context",
    );
    assert.match(reply, /next turn/);
    assert.equal(svc.subagentQueue.length, 1);

    // interrupt_agent on a queued subagent removes it before it starts.
    const interrupted = await service.interruptSubagent(
      parent.sessionId,
      child.sessionId,
    );
    assert.match(interrupted, /Removed from the queue/);
    assert.equal(svc.subagentQueue.length, 0);
    assert.ok(!svc.queuedSubagentIds.has(child.sessionId));
    assert.equal(queuedPrompts.length, 0, "removed subagent must never start");
  } finally {
    await service.disposeAll();
  }
});

// ---------------------------------------------------------------------------
// v1.4.7 — managed-session configuration boundary and initial-spawn gate
// ---------------------------------------------------------------------------

function writeSubagentProbeConfig(
  dataDir: string,
  primary: string,
  fallbackModels: string[],
): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    join(dataDir, "subagents.json"),
    JSON.stringify({
      schemaVersion: 1,
      defaultAgent: DEFAULT_SUBAGENT_CONFIG.defaultAgent,
      agents: [
        ...DEFAULT_SUBAGENT_CONFIG.agents,
        { id: "probe", model: primary, fallbackModels },
      ],
    }),
    "utf-8",
  );
}

test("an open parent validates spawns against its assembled subagent config snapshot", async () => {
  const fixture = setupFixture();
  writeSubagentProbeConfig(fixture.dataDir, "test/model-a", ["test/model-b"]);
  const service = createTestService(fixture);
  const svc = service as unknown as {
    runningSubagentRuns: number;
    drainSubagentQueue(): void;
    handleAgentEvent(managed: unknown, event: unknown): void;
  };
  try {
    const parent = await service.createSession(SELECTORS);
    stubEchoPrompt(managedOf(service, parent.sessionId), "parent answer");

    // The file changes to B after this parent was assembled.
    writeSubagentProbeConfig(fixture.dataDir, "test/model-c", []);

    // The open parent keeps snapshot A: B-only is rejected…
    assert.equal(
      managedOf(service, parent.sessionId).subagentConfig.agents.find(
        (agent) => agent.id === "probe",
      )?.model,
      "test/model-a",
    );
    await assert.rejects(
      service.spawnSubagent(parent.sessionId, {
        message: "task",
        agentType: "probe",
        model: "test/model-c",
      }),
      /not in the configured subagent candidates/,
    );

    // Queue the spawn so the child's first run starts only under stubs.
    svc.runningSubagentRuns = 10;
    const spawned = await service.spawnSubagent(parent.sessionId, {
      message: "task",
      agentType: "probe",
    });
    const childHeader = readV4SessionHeader(
      managedOf(service, spawned.sessionId).manifest.recordsDir,
    );
    assert.equal(childHeader?.modelOverride?.modelId, "model-a");
    assert.deepEqual(
      childHeader?.subagentExecution?.modelChain.map((entry) => entry.modelId),
      ["model-a", "model-b"],
    );

    // The initial model cannot start the child: it advances the snapshot
    // chain to model-b and completes — and the lead receives exactly one
    // terminal envelope; the fallback step itself is not an outcome.
    const childManaged = managedOf(service, spawned.sessionId);
    childManaged.session.getSessionStats = () => ({
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
    childManaged.session.prompt = async (text: string) => {
      childManaged.session.sessionManager.appendMessage({
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      });
      childManaged.session.state.errorMessage = "model-a unavailable";
      svc.handleAgentEvent(childManaged, { type: "agent_end" });
    };
    childManaged.session.agent.continue = async () => {
      childManaged.session.state.errorMessage = null;
      childManaged.session.sessionManager.appendMessage({
        role: "assistant",
        content: [{ type: "text", text: "recovered on model-b" }],
        timestamp: Date.now(),
      });
      svc.handleAgentEvent(childManaged, { type: "agent_end" });
    };
    svc.runningSubagentRuns = 0;
    svc.drainSubagentQueue();

    const parentMail = () =>
      readAgentMail(managedOf(service, parent.sessionId).manifest.recordsDir)
        .filter(
          (envelope) =>
            envelope.from === spawned.sessionId &&
            envelope.kind === "lifecycle" &&
            envelope.event !== "spawned",
        );
    await waitFor(() => parentMail().length === 1);
    assert.equal(parentMail()[0]!.event, "completed");
    assert.equal(childManaged.session.model.id, "model-b");

    // A parent assembled after the change uses the current file (B).
    const parentTwo = await service.createSession(SELECTORS);
    stubEchoPrompt(managedOf(service, parentTwo.sessionId), "parent answer");
    await assert.rejects(
      service.spawnSubagent(parentTwo.sessionId, {
        message: "task",
        agentType: "probe",
        model: "test/model-a",
      }),
      /not in the configured subagent candidates/,
    );
    svc.runningSubagentRuns = 10;
    const spawnedB = await service.spawnSubagent(parentTwo.sessionId, {
      message: "task",
      agentType: "probe",
    });
    assert.equal(
      readV4SessionHeader(
        managedOf(service, spawnedB.sessionId).manifest.recordsDir,
      )?.modelOverride?.modelId,
      "model-c",
    );

    // A parent assembled under A and then reopened re-reads the current
    // file: its snapshot is now B.
    await service.disposeAll();
    const reopenedService = createTestService(fixture);
    try {
      await reopenedService.openSession(parent.sessionId, SELECTORS);
      assert.equal(
        managedOf(reopenedService, parent.sessionId).subagentConfig.agents.find(
          (agent) => agent.id === "probe",
        )?.model,
        "test/model-c",
      );
    } finally {
      await reopenedService.disposeAll();
    }
  } finally {
    await service.disposeAll();
  }
});

test("the preset fallback chain exists only until the subagent first produces work", async () => {
  const fixture = setupFixture();
  writeSubagentProbeConfig(fixture.dataDir, "test/model-a", ["test/model-b"]);
  const service = createTestService(fixture);
  const svc = service as unknown as {
    tryModelFallback(managed: unknown, error: string): Promise<boolean>;
  };
  try {
    const parent = await service.createSession(SELECTORS);
    const child = await service.createSession(SELECTORS, {
      forkedFrom: { sessionId: parent.sessionId, purpose: "subagent" },
      modelOverride: { provider: "test", modelId: "model-a" },
      subagentExecution: {
        agentType: "probe",
        modelChain: [
          { provider: "test", modelId: "model-a" },
          { provider: "test", modelId: "model-b" },
        ],
      },
    });
    const managed = managedOf(service, child.sessionId) as unknown as {
      session: {
        model: { id: string };
        agent: { continue(): Promise<void> };
        sessionManager: {
          appendMessage(message: unknown): string;
          getBranch(): Array<{ type: string; message?: { role?: string } }>;
        };
      };
      manifest: { model: string; recordsDir: string };
      busy: boolean;
    };
    (managed.session.agent as unknown).continue = async () => {
      managed.session.sessionManager.appendMessage({
        role: "assistant",
        content: [{ type: "text", text: "recovered by fallback" }],
        timestamp: Date.now(),
      });
    };

    // Before first work: an unavailable initial model advances the chain.
    assert.equal(await svc.tryModelFallback(managed, "model-a unavailable"), true);
    assert.equal(managed.session.model.id, "model-b");
    assert.equal(managed.manifest.model, "model-b");

    // The child is alive now; a follow-up failure must not re-enter the chain.
    assert.equal(await svc.tryModelFallback(managed, "model-b also failing"), false);
    assert.equal(managed.session.model.id, "model-b");

    // Thinking-only output does not close the gate…
    const quietChild = await service.createSession(SELECTORS, {
      forkedFrom: { sessionId: parent.sessionId, purpose: "subagent" },
      modelOverride: { provider: "test", modelId: "model-a" },
      subagentExecution: {
        agentType: "probe",
        modelChain: [
          { provider: "test", modelId: "model-a" },
          { provider: "test", modelId: "model-b" },
        ],
      },
    });
    const quietManaged = managedOf(service, quietChild.sessionId);
    quietManaged.session.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "thinking", text: "internal deliberation only" }],
      timestamp: Date.now(),
    });
    quietManaged.session.agent.continue = async () => {};
    assert.equal(
      await svc.tryModelFallback(quietManaged, "model-a unavailable"),
      true,
      "thinking-only output must keep the initial chain available",
    );

    // …and a model outside the chain is not "before index zero".
    const outsiderChild = await service.createSession(SELECTORS, {
      forkedFrom: { sessionId: parent.sessionId, purpose: "subagent" },
      modelOverride: { provider: "test", modelId: "model" },
      subagentExecution: {
        agentType: "probe",
        modelChain: [
          { provider: "test", modelId: "model-a" },
          { provider: "test", modelId: "model-b" },
        ],
      },
    });
    const outsiderManaged = managedOf(service, outsiderChild.sessionId);
    outsiderManaged.session.agent.continue = async () => {};
    assert.equal(
      await svc.tryModelFallback(outsiderManaged, "whatever"),
      false,
      "a model not in the chain must not restart the chain at index zero",
    );
    assert.equal(outsiderManaged.session.model.id, "model");

    // A reopened child that had already produced work does not regain the gate.
    await service.disposeAll();
    const reopenedService = createTestService(fixture);
    try {
      await reopenedService.openSession(child.sessionId, SELECTORS);
      const reopenedManaged = managedOf(reopenedService, child.sessionId);
      reopenedManaged.session.agent.continue = async () => {};
      assert.equal(
        await (
          reopenedService as unknown as {
            tryModelFallback(managed: unknown, error: string): Promise<boolean>;
          }
        ).tryModelFallback(reopenedManaged, "model-b failing again"),
        false,
        "an already-alive reopened child must not re-enter the initial chain",
      );
      assert.equal(reopenedManaged.session.model.id, "model-b");
    } finally {
      await reopenedService.disposeAll();
    }
  } finally {
    await service.disposeAll();
  }
});

test("explicit interrupt sends exactly one interrupted outcome and the child stays usable", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  try {
    const parent = await service.createSession(SELECTORS);
    const parentManaged = managedOf(service, parent.sessionId);
    stubEchoPrompt(parentManaged, "noted");
    const child = await service.createSession(SELECTORS, {
      forkedFrom: { sessionId: parent.sessionId, purpose: "subagent" },
    });
    const childManaged = managedOf(service, child.sessionId);

    let rejectPrompt!: (error: Error) => void;
    childManaged.session.prompt = (text: string) =>
      new Promise<void>((_resolve, reject) => {
        childManaged.session.sessionManager.appendMessage({
          role: "user",
          content: [{ type: "text", text }],
          timestamp: Date.now(),
        });
        rejectPrompt = reject;
      });
    childManaged.session.abort = async () => {
      const abortError = new Error("Operation aborted");
      abortError.name = "AbortError";
      rejectPrompt(abortError);
    };

    (
      service as unknown as {
        startSubagentRun(id: string, prompt: string, notify: boolean): string;
      }
    ).startSubagentRun(child.sessionId, "the bounded task", true);
    await waitFor(() => Boolean(childManaged.busy));
    await service.interruptSubagent(parent.sessionId, child.sessionId);

    const outcomes = () =>
      readAgentMail(parentManaged.manifest.recordsDir).filter(
        (envelope) =>
          envelope.kind === "lifecycle" &&
          envelope.from === child.sessionId &&
          envelope.event !== "spawned",
      );
    await waitFor(() => outcomes().length === 1);
    assert.equal(outcomes()[0]!.event, "interrupted");
    await waitFor(() => !childManaged.busy);

    // The child remains a usable conversation: a later message acts on it.
    childManaged.session.prompt = async (text: string) => {
      childManaged.session.sessionManager.appendMessage({
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      });
      childManaged.session.sessionManager.appendMessage({
        role: "assistant",
        content: [{ type: "text", text: "resumed after the break" }],
        timestamp: Date.now(),
      });
    };
    await service.sendToSubagent(parent.sessionId, child.sessionId, "continue");
    await waitFor(() =>
      readAgentMail(parentManaged.manifest.recordsDir).some(
        (envelope) =>
          envelope.kind === "lifecycle" &&
          envelope.from === child.sessionId &&
          envelope.event === "completed",
      ),
    );
    assert.equal(outcomes().length, 2, "one interrupted + one completed");
  } finally {
    await service.disposeAll();
  }
});
