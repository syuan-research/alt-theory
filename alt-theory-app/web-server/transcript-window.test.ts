import assert from "node:assert/strict";
import test from "node:test";
import { TRANSCRIPT_TAIL_ROWS } from "./limits.js";
import { createTestService, setupFixture } from "./session-service.fixture.js";
import type { SessionService, SessionServiceEvent } from "./session-service.js";

const SELECTORS = {
  rolePresetSlug: "role-conceptual-theory-companion",
  kbDomain: "ep-core",
  soulSlug: "soul-latest",
};

function stubAnswers(service: SessionService, sessionId: string) {
  const managed = (service as unknown as {
    sessions: Map<string, { session: { prompt(text: string): Promise<void>; sessionManager: { appendMessage(message: unknown): string } } }>;
  }).sessions.get(sessionId)!;
  managed.session.prompt = async (text: string) => {
    managed.session.sessionManager.appendMessage({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
    managed.session.sessionManager.appendMessage({ role: "assistant", content: [{ type: "text", text: `answer:${text}` }], timestamp: Date.now() });
  };
}

test("a long conversation opens with its tail, pages up to the start, and a turn carries only its rows", async () => {
  const service = createTestService(setupFixture());
  const { sessionId } = await service.createSession(SELECTORS);
  stubAnswers(service, sessionId);
  const turns = TRANSCRIPT_TAIL_ROWS; // two rows a turn: twice the tail
  for (let n = 0; n < turns; n++) await service.runPrompt(sessionId, `q${n}`).completion;
  const full = service.getTranscript(sessionId);

  const window = service.getTranscriptWindow(sessionId);
  assert.equal(window.hasMore, true);
  assert.equal(window.messages[0].role, "user");
  assert.ok(window.messages.length >= TRANSCRIPT_TAIL_ROWS && window.messages.length < full.length);
  assert.deepEqual(window.messages, full.slice(full.length - window.messages.length));
  assert.equal(window.userRows.length, turns);
  assert.equal(window.userRows[0].preview, "q0");

  let loaded = window.messages;
  let hasMore = window.hasMore;
  while (hasMore) {
    const page = service.getTranscriptPage(sessionId, loaded[0].rowId!, 25)!;
    loaded = [...page.messages, ...loaded];
    hasMore = page.hasMore;
  }
  assert.deepEqual(loaded, full);
  assert.equal(service.getTranscriptPage(sessionId, "live-user", 25), null);

  const events: SessionServiceEvent[] = [];
  const detach = service.attach(sessionId, (event) => events.push(event));
  await service.runPrompt(sessionId, "one more").completion;
  const completed = events.find((event) => event.type === "run_completed");
  assert.ok(completed?.type === "run_completed");
  assert.equal(completed.payload.after, full.at(-1)!.rowId);
  assert.deepEqual(completed.payload.rows.map((row) => row.text), ["one more", "answer:one more"]);

  // A rewind sends every window back to the tail.
  service.deleteLatest(sessionId);
  const rewound = events.findLast((event) => event.type === "session_transcript");
  assert.ok(rewound?.type === "session_transcript");
  assert.equal(rewound.payload.hasMore, true);
  assert.deepEqual(rewound.payload.messages.at(-1), full.at(-1));
  detach();
  await service.disposeAll();
});

test("a tool row carries a bounded result; the whole result is read from the history on demand", async () => {
  const { readToolResultText } = await import("./session-store.js");
  const fixture = setupFixture();
  const service = createTestService(fixture);
  const { sessionId } = await service.createSession(SELECTORS);
  const big = `${"head ".repeat(10_000)}MIDDLE${" tail".repeat(10_000)}`;
  const managed = (service as unknown as {
    sessions: Map<string, { session: { prompt(text: string): Promise<void>; sessionManager: { appendMessage(message: unknown): string } } }>;
  }).sessions.get(sessionId)!;
  managed.session.prompt = async (text: string) => {
    const append = (message: unknown) => managed.session.sessionManager.appendMessage(message);
    append({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
    append({ role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "bash", arguments: { command: "cat big" } }], timestamp: Date.now() });
    append({ role: "toolResult", toolCallId: "call-1", toolName: "bash", content: [{ type: "text", text: big }], isError: false, timestamp: Date.now() });
    append({ role: "assistant", content: [{ type: "text", text: "done" }], timestamp: Date.now() });
  };
  await service.runPrompt(sessionId, "read it").completion;
  const row = service.getTranscript(sessionId).find((message) => message.toolCallId === "call-1")!;
  assert.equal(row.truncated, true);
  assert.ok(row.text.length < big.length && !row.text.includes("MIDDLE"));
  assert.equal(readToolResultText(fixture.dataDir, sessionId, "call-1"), big);
  assert.equal(readToolResultText(fixture.dataDir, sessionId, "no-such-call"), null);
  await service.disposeAll();
});
