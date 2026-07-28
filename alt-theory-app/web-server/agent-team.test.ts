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
  clampWorkerMode,
  createAgentTeamTools,
  resolveModelTier,
} from "./agent-team.js";
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
  const appContextPath = join(root, "ALTTHEORY.md");
  const piPromptTemplatesDir = resolve("agent-assets", "prompts", "pi");
  mkdirSync(rolePresetsDir, { recursive: true });
  mkdirSync(soulDir, { recursive: true });
  mkdirSync(join(kbDir, "ep-core"), { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(instructionsDir, { recursive: true });
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
      modelsPath: null,
    },
    kbDir: fixture.kbDir,
    rolePresetsDir: fixture.rolePresetsDir,
    soulDir: fixture.soulDir,
    legacySoulPath: join(fixture.soulDir, "soul-latest.md"),
    readOnly: true,
    promptMode: "alt-only",
    resourceDiscovery: "clean",
    skillsDir: fixture.skillsDir,
    instructionsDir: fixture.instructionsDir,
    runLabel: null,
    testBatch: null,
  });
}

const SELECTORS = {
  rolePresetSlug: "role-a",
  kbDomain: "ep-core",
  soulSlug: "soul-latest",
};

type StubbableManaged = {
  busy: boolean;
  workerParentId: string | null;
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
// Pure pieces
// ---------------------------------------------------------------------------

test("clampWorkerMode clamps children to the parent's capability mode", () => {
  assert.equal(clampWorkerMode("pure", "work"), "pure");
  assert.equal(clampWorkerMode("pure", undefined), "pure");
  assert.equal(clampWorkerMode("full", "work"), "full");
  assert.equal(clampWorkerMode("full", undefined), "pure");
  assert.equal(clampWorkerMode("full", "understand"), "pure");
});

test("resolveModelTier picks nearest cheaper/pricier usable model by cost", () => {
  const models = [
    { provider: "p", id: "small", cost: { input: 1, output: 2 } },
    { provider: "p", id: "mid", cost: { input: 3, output: 6 } },
    { provider: "p", id: "big", cost: { input: 10, output: 30 } },
    { provider: "p", id: "unpriced" },
  ];
  const current = { provider: "p", id: "mid" };
  assert.equal(resolveModelTier(models, current, "lower")?.id, "small");
  assert.equal(resolveModelTier(models, current, "higher")?.id, "big");
  assert.equal(resolveModelTier(models, current, "same"), null);
  assert.equal(
    resolveModelTier(models, { provider: "p", id: "big" }, "higher"),
    null,
  );
  assert.equal(
    resolveModelTier(models, { provider: "p", id: "unpriced" }, "lower"),
    null,
  );
});

test("createAgentTeamTools gives leads the full surface and workers message_parent only", () => {
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
  const workerNames = createAgentTeamTools(bridge, "s2", "worker").map(
    (t) => t.name,
  );
  assert.deepEqual(workerNames, ["message_parent"]);
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

  const fragment = formatEnvelopeForContext(envelope, "worker-1");
  const parsed = parseAgentMailFragment(fragment);
  assert.deepEqual(parsed, {
    fromLabel: "worker-1",
    event: "completed",
    body: "done: the answer",
  });
  assert.equal(parseAgentMailFragment("plain user text"), null);
});

// ---------------------------------------------------------------------------
// Service integration
// ---------------------------------------------------------------------------

test("spawnWorker creates a worker child with clamped mode, alias, and spawned mail", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  try {
    const parent = await service.createSession(SELECTORS);
    stubEchoPrompt(managedOf(service, parent.sessionId), "parent answer");
    const spawned = await service.spawnWorker(parent.sessionId, {
      task: "summarize the docs",
      name: "docs-worker",
      mode: "work",
    });
    assert.match(spawned.report, /Spawned worker "docs-worker"/);
    assert.match(spawned.report, /understand mode/); // pure parent clamps work->understand

    const child = managedOf(service, spawned.sessionId);
    assert.equal(child.workerParentId, parent.sessionId);
    const header = readV4SessionHeader(child.manifest.recordsDir);
    assert.deepEqual(header?.forkedFrom, {
      sessionId: parent.sessionId,
      purpose: "worker",
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
    // The worker resolves by its alias.
    const resolved = (
      service as unknown as {
        resolveWorkerId(parentId: string, agent: string): string;
      }
    ).resolveWorkerId(parent.sessionId, "docs-worker");
    assert.equal(resolved, spawned.sessionId);
  } finally {
    await service.disposeAll();
  }
});

test("worker completion mails the lead and wakes it with a recorded notification turn", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  try {
    const parent = await service.createSession(SELECTORS);
    const parentManaged = managedOf(service, parent.sessionId);
    const parentPrompts = stubEchoPrompt(parentManaged, "noted");

    const child = await service.createSession(SELECTORS, {
      forkedFrom: { sessionId: parent.sessionId, purpose: "worker" },
    });
    const childManaged = managedOf(service, child.sessionId);
    stubEchoPrompt(childManaged, "worker answer");

    (
      service as unknown as {
        startWorkerRun(id: string, prompt: string, notify: boolean): string;
      }
    ).startWorkerRun(child.sessionId, "do the task", true);

    await waitFor(() =>
      readAgentMail(parentManaged.manifest.recordsDir).some(
        (envelope) => envelope.event === "completed",
      ),
    );
    const completed = readAgentMail(parentManaged.manifest.recordsDir).find(
      (envelope) => envelope.event === "completed",
    );
    assert.equal(completed?.body, "worker answer");
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
      forkedFrom: { sessionId: parent.sessionId, purpose: "worker" },
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
      forkedFrom: { sessionId: parent.sessionId, purpose: "worker" },
    });

    // Close the lead, then let the worker message it.
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

test("sendToWorker queues a message for an idle worker without starting a turn", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  try {
    const parent = await service.createSession(SELECTORS);
    const child = await service.createSession(SELECTORS, {
      forkedFrom: { sessionId: parent.sessionId, purpose: "worker" },
    });
    const childManaged = managedOf(service, child.sessionId);
    stubEchoPrompt(childManaged, "chapter 1 done");
    await service.runPrompt(child.sessionId, "cover chapter 1").completion;
    const reply = await service.sendToWorker(
      parent.sessionId,
      child.sessionId,
      "please also cover chapter 2",
      false,
    );
    assert.match(reply, /next turn/);
    assert.ok(!childManaged.busy);
    const transcript =
      readSessionDetail(fixture.dataDir, child.sessionId)?.transcript ?? [];
    const line = transcript.find((message) => message.marker === "agent-team");
    assert.ok(line, "queued mail missing from child transcript");
    assert.match(line!.text, /^lead: /);
  } finally {
    await service.disposeAll();
  }
});
