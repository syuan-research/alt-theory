import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import test from "node:test";
import { appendAgentMail, undeliveredAgentMail } from "./agent-mail.js";
import {
  RUNTIME_HIGH_WATER,
  RUNTIME_IDLE_MS,
  RUNTIME_LRU_MIN_IDLE_MS,
  RUNTIME_TARGET,
} from "./limits.js";
import { pickReclaims, type RuntimeView } from "./runtime-retention.js";
import { createTestService, setupFixture } from "./session-service.fixture.js";
import type { SessionService } from "./session-service.js";

const NOW = 10 * RUNTIME_IDLE_MS;
const view = (over: Partial<RuntimeView> = {}): RuntimeView => ({
  sessionId: "s",
  listeners: 0,
  idle: true,
  hold: 0,
  pendingApprovals: 0,
  queuedSubagent: false,
  activeChildren: false,
  idleSince: NOW - RUNTIME_IDLE_MS,
  onDisk: true,
  ...over,
});

test("an unwatched idle runtime past the idle time is reclaimed", () => {
  assert.deepEqual(pickReclaims([view()], NOW), ["s"]);
});

for (const [clause, over] of [
  ["a window follows it", { listeners: 1 }],
  ["a turn is running", { idle: false }],
  ["settle / replacement is in flight", { hold: 1 }],
  ["an approval is pending", { pendingApprovals: 1 }],
  ["it is a subagent waiting for a slot", { queuedSubagent: true }],
  ["it is a lead with an active subagent", { activeChildren: true }],
  ["it has not been idle long enough", { idleSince: NOW - RUNTIME_IDLE_MS + 1 }],
  ["Pi has not written its history yet", { onDisk: false }],
] as const) {
  test(`not reclaimed while ${clause}`, () => {
    assert.deepEqual(pickReclaims([view(over)], NOW), []);
  });
}

test("above the high water the longest-idle releasable go first, down to the target", () => {
  const fresh = NOW - RUNTIME_LRU_MIN_IDLE_MS;
  const views = Array.from({ length: RUNTIME_HIGH_WATER + 1 }, (_, i) =>
    view({ sessionId: `s${i}`, idleSince: fresh - i * 1000 }),
  );
  // One busy runtime and one just opened are never taken.
  views.push(view({ sessionId: "busy", idle: false, idleSince: 0 }));
  views.push(view({ sessionId: "new", idleSince: NOW }));
  const picked = pickReclaims(views, NOW);
  assert.equal(views.length - picked.length, RUNTIME_TARGET);
  assert.ok(!picked.includes("busy") && !picked.includes("new"));
  // Oldest idle first: s12, s11, …
  assert.deepEqual(picked.slice(0, 2), [`s${RUNTIME_HIGH_WATER}`, `s${RUNTIME_HIGH_WATER - 1}`]);
});

test("at or below the high water nothing goes before the idle time", () => {
  const views = Array.from({ length: RUNTIME_HIGH_WATER }, (_, i) =>
    view({ sessionId: `s${i}`, idleSince: NOW - RUNTIME_LRU_MIN_IDLE_MS }),
  );
  assert.deepEqual(pickReclaims(views, NOW), []);
});

// ---------------------------------------------------------------- service

const SELECTORS = {
  rolePresetSlug: "role-conceptual-theory-companion",
  kbDomain: "ep-core",
  soulSlug: "soul-latest",
};

type Internals = {
  sessions: Map<string, {
    session: {
      prompt(text: string): Promise<void>;
      sessionFile?: string;
      sessionManager: { appendMessage(message: unknown): string };
    };
  }>;
};
const internals = (service: SessionService) => service as unknown as Internals;

function stubAnswers(service: SessionService, sessionId: string, fail = false) {
  const managed = internals(service).sessions.get(sessionId)!;
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
    managed.session.sessionManager.appendMessage({ role: "assistant", content: [{ type: "text", text: `answer:${text}` }], timestamp: Date.now() });
    if (fail) throw new Error("provider down");
  };
}

/** A conversation with one finished turn, reopened in a fresh service (a resume). */
async function resumedConversation(fail = false) {
  const fixture = setupFixture();
  const first = createTestService(fixture);
  const created = await first.createSession(SELECTORS);
  stubAnswers(first, created.sessionId, fail);
  await first.runPrompt(created.sessionId, "hello").completion.catch(() => {});
  await first.disposeAll();
  const service = createTestService(fixture);
  await service.openSession(created.sessionId, SELECTORS);
  const recordsDir = service.getManifest(created.sessionId).recordsDir;
  const piFile = internals(service).sessions.get(created.sessionId)!.session.sessionFile!;
  return { service, sessionId: created.sessionId, recordsDir, piFile };
}

const LATER = () => Date.now() + RUNTIME_IDLE_MS + 1;

test("reopening a reclaimed conversation is silent and changes no file", async () => {
  const { service, sessionId, recordsDir, piFile } = await resumedConversation();
  const files = [
    piFile,
    join(recordsDir, "session-events.jsonl"),
    join(recordsDir, "session.json"),
    join(recordsDir, "resume-manifest.json"),
    join(recordsDir, "config-events.jsonl"),
  ].filter((file) => existsSync(file));
  assert.ok(files.length >= 4);
  const bytes = () => files.map((file) => readFileSync(file, "utf-8"));
  const before = bytes();
  const snapshot = service.getSnapshot(sessionId);
  const transcript = service.getTranscript(sessionId);

  for (let round = 0; round < 2; round++) {
    assert.deepEqual(await service.reclaimIdleRuntimes(LATER()), [sessionId]);
    assert.equal(internals(service).sessions.has(sessionId), false);
    assert.deepEqual(await service.openSession(sessionId, SELECTORS), snapshot);
    assert.deepEqual(service.getTranscript(sessionId), transcript);
  }
  assert.deepEqual(bytes(), before);
  await service.disposeAll();
});

test("a new conversation reclaimed and reopened keeps openedFrom and writes no resume manifest", async () => {
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const created = await service.createSession(SELECTORS);
  stubAnswers(service, created.sessionId);
  await service.runPrompt(created.sessionId, "hello").completion;
  const snapshot = service.getSnapshot(created.sessionId);
  const { recordsDir } = service.getManifest(created.sessionId);
  await service.reclaimIdleRuntimes(LATER());
  assert.deepEqual(await service.openSession(created.sessionId, SELECTORS), snapshot);
  assert.equal(snapshot.openedFrom, "new");
  assert.equal(existsSync(join(recordsDir, "resume-manifest.json")), false);
  await service.disposeAll();
});

test("concurrent opens of one closed conversation build one runtime", async () => {
  const { service, sessionId } = await resumedConversation();
  await service.reclaimIdleRuntimes(LATER());
  const spy = service as unknown as { openFromDisk: (...args: unknown[]) => Promise<unknown> };
  const openFromDisk = spy.openFromDisk.bind(service);
  let builds = 0;
  spy.openFromDisk = (...args) => {
    builds++;
    return openFromDisk(...args);
  };
  const [a, b] = await Promise.all([
    service.openSession(sessionId, SELECTORS),
    service.openSession(sessionId, SELECTORS),
  ]);
  assert.deepEqual(a, b);
  assert.equal(builds, 1);
  await service.disposeAll();
});

test("mail that arrived while reclaimed is delivered on reopen", async () => {
  const { service, sessionId, recordsDir } = await resumedConversation();
  await service.reclaimIdleRuntimes(LATER());
  appendAgentMail(recordsDir, {
    at: new Date().toISOString(),
    from: "user",
    to: sessionId,
    kind: "message",
    body: "while you were out",
    delivered: false,
  });
  await service.openSession(sessionId, SELECTORS);
  assert.deepEqual(undeliveredAgentMail(recordsDir), []);
  await service.disposeAll();
});

test("a failed conversation keeps its list mark while reclaimed", async () => {
  const { service, sessionId } = await resumedConversation(true);
  assert.equal(service.sessionActivity().get(sessionId), "failed");
  await service.reclaimIdleRuntimes(LATER());
  assert.equal(service.sessionActivity().get(sessionId), "failed");
  const heard: string[] = [];
  service.attachActivity((event) => heard.push(event.status));
  service.listChanged(sessionId);
  assert.deepEqual(heard, ["failed"]);
  await service.disposeAll();
});

test("a conversation whose history is not on disk yet stays", async () => {
  const service = createTestService(setupFixture());
  await service.createSession(SELECTORS);
  assert.deepEqual(await service.reclaimIdleRuntimes(LATER()), []);
  await service.disposeAll();
});

test("a watched conversation is never reclaimed", async () => {
  const { service, sessionId } = await resumedConversation();
  const detach = service.attach(sessionId, () => {});
  assert.deepEqual(await service.reclaimIdleRuntimes(LATER()), []);
  detach();
  // Idle time counts from the last detach.
  assert.deepEqual(await service.reclaimIdleRuntimes(Date.now() + 1000), []);
  assert.deepEqual(await service.reclaimIdleRuntimes(LATER()), [sessionId]);
  await service.disposeAll();
});

// ------------------------------------------------- conversation grants (R1)

type ToolGate = {
  sessions: Map<string, {
    session: {
      agent: {
        beforeToolCall?: (input: {
          toolCall: { id: string; name: string; arguments: unknown };
          args: Record<string, unknown>;
        }) => Promise<{ block?: boolean } | undefined>;
      };
    };
  }>;
};

/** Asks for `rm -rf scratch`; answers the dialog with `choice` when one comes. */
async function askCommand(service: SessionService, sessionId: string, id: string, choice?: string) {
  const asked: string[] = [];
  const detach = service.attachApprovals((event) => {
    if (event.type === "approval_requested") asked.push(event.payload.approvalId);
  });
  const gate = (service as unknown as ToolGate).sessions.get(sessionId)!.session.agent.beforeToolCall!;
  const result = gate({ toolCall: { id, name: "bash", arguments: {} }, args: { command: "rm -rf scratch" } });
  for (let i = 0; i < 50 && asked.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
  if (asked.length && choice) service.respondApproval(sessionId, asked[0], { choice });
  else if (asked.length) service.respondApproval(sessionId, asked[0], { accept: false });
  detach();
  return { asked: asked.length > 0, result: await result };
}

test("a conversation grant survives reclaim, restart and replacement; read-only takes it back", async () => {
  const { APPROVAL_ALLOW_SESSION } = await import("../core/security-extension.js");
  const fixture = setupFixture();
  let service = createTestService(fixture);
  const { sessionId } = await service.createSession(SELECTORS);
  stubAnswers(service, sessionId);
  await service.runPrompt(sessionId, "hello").completion;
  const detach = service.attach(sessionId, () => {});
  assert.equal((await askCommand(service, sessionId, "g1", APPROVAL_ALLOW_SESSION)).asked, true);
  detach();

  await service.reclaimIdleRuntimes(LATER());
  await service.openSession(sessionId, SELECTORS);
  assert.deepEqual(await askCommand(service, sessionId, "g2"), { asked: false, result: undefined });

  await service.disposeAll();
  service = createTestService(fixture);
  await service.openSession(sessionId, SELECTORS);
  assert.deepEqual(await askCommand(service, sessionId, "g3"), { asked: false, result: undefined });

  await service.switchAssetSelectors(sessionId, { soulSlug: "soul-test" });
  assert.deepEqual(await askCommand(service, sessionId, "g4"), { asked: false, result: undefined });

  await service.switchMode(sessionId, "read-only");
  await service.switchMode(sessionId, "work");
  assert.equal((await askCommand(service, sessionId, "g5")).asked, true);
  await service.disposeAll();
});

test("moving a conversation to another folder drops path grants and keeps command grants", async () => {
  const { dropPathApprovals } = await import("../core/alt-theory-core.js");
  const { mkdtempSync, writeFileSync } = await import("fs");
  const { tmpdir } = await import("os");
  const dir = mkdtempSync(join(tmpdir(), "alt-theory-approvals-"));
  writeFileSync(
    join(dir, "approvals.json"),
    JSON.stringify({ schemaVersion: 1, keys: ["bash:rm", "read:/x", "db:/y.sqlite"], writableRoots: ["/z"] }),
  );
  dropPathApprovals(dir);
  const after = JSON.parse(readFileSync(join(dir, "approvals.json"), "utf-8"));
  assert.deepEqual(after, { schemaVersion: 1, keys: ["bash:rm"], writableRoots: [] });
});
