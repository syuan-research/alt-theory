/**
 * Replay tests (M1): real SessionService events, mapped the way the WS layer
 * maps them, drive the client's pure conversation transition. What they do
 * not cover — the real socket, mounting, render identity — is the desktop
 * smoke's job.
 *
 * `Window` plays one client window: its state, the events of the session it
 * follows, and the WS handler's request contract (request_done when the
 * service call returns, an error with the id when it throws — the contract
 * itself is tested at the WS level in backend-server.integration.ts).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { describeFailure } from "../core/failure.js";
import type { ClientMessageBody } from "../frontend/src/api/types.js";
import {
  displayMessages,
  initialConversationState,
  isBusy,
  isRunning,
  queuedTexts,
  recoveryOf,
  reduce,
  type ConversationInput,
  type ConversationState,
  type PendingRequest,
} from "../frontend/src/lib/conversation.js";
import { createTestService, setupFixture } from "./session-service.fixture.js";
import type { SessionService } from "./session-service.js";
import { toServerMessage } from "./websocket-protocol.js";

const selectors = {
  rolePresetSlug: "role-conceptual-theory-companion",
  kbDomain: "ep-core",
  soulSlug: "soul-latest",
};

let requestSeq = 0;

class Window {
  state: ConversationState = reduce(initialConversationState(), { type: "socket", status: "open" });
  private detach = () => {};
  constructor(private readonly service: SessionService) {}

  apply(input: ConversationInput) {
    this.state = reduce(this.state, input);
  }

  /** open_session as the WS layer answers it: attach, snapshot, rows, live replay. */
  open(sessionId: string) {
    this.detach();
    this.detach = this.service.attach(sessionId, (event) => {
      if (event.type === "approval_requested" || event.type === "approval_resolved") return;
      this.apply({ type: "server", message: toServerMessage(event) });
    });
    this.apply({ type: "server", message: { type: "session_opened", payload: this.service.getSnapshot(sessionId) } });
    this.apply({
      type: "server",
      message: { type: "session_transcript", payload: this.service.getTranscriptWindow(sessionId) },
    });
    for (const event of this.service.getLiveRun(sessionId)?.events ?? []) {
      this.apply({ type: "server", message: toServerMessage(event) });
    }
  }

  /** A request with a receipt; `act` is what the WS handler calls. */
  async ask(
    message: ClientMessageBody,
    act: () => unknown,
    extra: Partial<PendingRequest> = {},
  ): Promise<string> {
    const id = `r${++requestSeq}`;
    this.apply({ type: "request", request: { id, message, from: this.state.sessionId, ...extra } });
    try {
      await act();
      this.apply({ type: "server", message: { type: "request_done", payload: { requestId: id } } });
    } catch (error) {
      this.apply({
        type: "server",
        message: { type: "error", payload: { failure: describeFailure(error, message.type), requestId: id } },
      });
    }
    return id;
  }

  prompt(text: string, act: () => unknown, attachments: string[] = []) {
    return this.ask({ type: "prompt", payload: text }, act, {
      sentText: text,
      bubble: !isRunning(this.state),
      draftText: text,
      attachments,
    });
  }

  close() {
    this.detach();
    this.apply({ type: "socket", status: "closed" });
  }
}

/** What the window handed back to the drafts, and to which conversation's (M2). */
function returned(window: Window) {
  return window.state.draftOps.flatMap((op) =>
    op.kind === "return" ? [{ to: op.to, text: op.text, attachments: op.attachments }] : [],
  );
}

/** A Pi prompt that appends the turn's messages when released. */
function holdTurn(managed: any, answer = "answer") {
  let release!: () => void;
  managed.session.prompt = async (text: string) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
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
  return () => release();
}

async function setup() {
  const service = createTestService(setupFixture());
  const created = await service.createSession(selectors);
  const managed = (service as any).sessions.get(created.sessionId);
  return { service, sessionId: created.sessionId, managed, internal: service as any };
}

test("replay: a normal send — pending bubble, running, one-step hand-over to the settled rows", async () => {
  const { service, sessionId, managed, internal } = await setup();
  const window = new Window(service);
  try {
    window.open(sessionId);
    const release = holdTurn(managed, "the answer");
    await window.prompt("question", () => service.runPrompt(sessionId, "question"));
    assert.equal(isRunning(window.state), true);
    assert.equal(isBusy(window.state), false, "accepted: the receipt ended the wait");
    assert.equal(displayMessages(window.state).at(-1)?.text, "question");
    internal.handleAgentEvent(managed, {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "the ans" },
    });
    assert.equal(window.state.turn.parts.length, 1);
    release();
    await managed.runSettlement;
    assert.equal(isRunning(window.state), false);
    assert.deepEqual(window.state.turn.parts, []);
    assert.deepEqual(
      displayMessages(window.state).map((row) => [row.role, row.text, Boolean(row.rowId)]),
      [
        ["user", "question", true],
        ["assistant", "the answer", true],
      ],
    );
  } finally {
    await service.disposeAll();
  }
});

test("replay: a refused send (no model selected) puts the text back and shows why", async () => {
  const { service, sessionId, managed } = await setup();
  const window = new Window(service);
  try {
    window.open(sessionId);
    Object.defineProperty(managed.session, "model", { get: () => undefined, configurable: true });
    await window.prompt("hello", () => service.runPrompt(sessionId, "hello"));
    assert.equal(isRunning(window.state), false);
    assert.equal(isBusy(window.state), false);
    assert.equal(displayMessages(window.state).length, 0);
    assert.deepEqual(returned(window), [{ to: sessionId, text: "hello", attachments: [] }]);
    assert.equal(window.state.notice?.body.kind, "refused");
  } finally {
    await service.disposeAll();
  }
});

test("replay: a provider failure ends the run with Continue offered", async () => {
  const { service, sessionId, managed, internal } = await setup();
  const window = new Window(service);
  try {
    window.open(sessionId);
    managed.session.prompt = async (text: string) => {
      managed.session.sessionManager.appendMessage({
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      });
      managed.session.state.errorMessage = "fetch failed: ECONNRESET";
      internal.handleAgentEvent(managed, { type: "agent_end" });
    };
    await window.prompt("hello", () => service.runPrompt(sessionId, "hello"));
    await managed.runSettlement;
    assert.equal(isRunning(window.state), false);
    assert.equal(recoveryOf(window.state)?.canContinue, true);
    assert.equal(window.state.notice?.body.kind, "run-failed");
    await window.ask({ type: "continue_latest" }, () => {
      holdTurn(managed);
      return service.continueLatestFromBreakpoint(sessionId);
    });
    assert.equal(recoveryOf(window.state), null, "the old Continue goes the moment the run begins");
  } finally {
    await service.disposeAll();
  }
});

test("replay: Stop hands the queued text back to the conversation it was typed in", async () => {
  const { service, sessionId, managed, internal } = await setup();
  const window = new Window(service);
  try {
    window.open(sessionId);
    const release = holdTurn(managed);
    await window.prompt("long turn", () => service.runPrompt(sessionId, "long turn"));
    managed.session.steer = async () => {};
    await window.prompt("and this", () => service.queuePrompt(sessionId, "and this", ["a.md"], "steer"), ["a.md"]);
    internal.handleAgentEvent(managed, { type: "queue_update", steering: ["and this"], followUp: [] });
    assert.deepEqual(queuedTexts(window.state), ["and this"]);
    managed.session.clearQueue = () => ({ steering: ["and this"], followUp: [] });
    managed.session.abort = async () => release();
    await window.ask({ type: "abort" }, () => service.abort(sessionId, "user_stop", "user_abort"));
    await managed.runSettlement;
    assert.equal(isRunning(window.state), false);
    assert.deepEqual(queuedTexts(window.state), []);
    assert.deepEqual(returned(window), [{ to: sessionId, text: "and this", attachments: ["a.md"] }]);
    // The hand-back names itself, so two windows of the conversation give
    // the one shared draft one copy (lib/draft takes an id once).
    const op = window.state.draftOps.find((entry) => entry.kind === "return");
    assert.ok(op?.kind === "return" && op.once, "the hand-back carries its id");
    assert.equal(window.state.notice, null, "the user's own Stop needs no words");
  } finally {
    await service.disposeAll();
  }
});

test("replay: interrupt-and-send delivers the selection once and runs it", async () => {
  const { service, sessionId, managed, internal } = await setup();
  const window = new Window(service);
  try {
    window.open(sessionId);
    const releaseOld = holdTurn(managed);
    await window.prompt("old", () => service.runPrompt(sessionId, "old"));
    // Pi's own queue: the card comes from its queue_update.
    await window.prompt("selected", () => service.queuePrompt(sessionId, "selected", undefined, "steer"));
    assert.deepEqual(queuedTexts(window.state), ["selected"]);
    managed.session.abort = async () => {
      managed.session.prompt = async (text: string) => {
        internal.handleAgentEvent(managed, { type: "message_start", message: { role: "user", content: text } });
        managed.session.sessionManager.appendMessage({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
        managed.session.sessionManager.appendMessage({ role: "assistant", content: [{ type: "text", text: "new" }], timestamp: Date.now() });
      };
      releaseOld();
    };
    await window.ask({ type: "send_queued_now", payload: { text: "selected" } }, () =>
      service.interruptAndSend(sessionId, "selected"),
    );
    await managed.runSettlement;
    assert.equal(isRunning(window.state), false);
    const users = displayMessages(window.state).filter((row) => row.role === "user").map((row) => row.text);
    assert.equal(users.filter((text) => text === "selected").length, 1);
    assert.equal(isBusy(window.state), false);
  } finally {
    await service.disposeAll();
  }
});

test("replay: compaction runs as a run and publishes its boundary", async () => {
  const { service, sessionId, managed } = await setup();
  const window = new Window(service);
  try {
    managed.session.sessionManager.appendMessage({ role: "user", content: [{ type: "text", text: "old" }], timestamp: Date.now() });
    window.open(sessionId);
    let finish!: () => void;
    managed.session.compact = async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      managed.session.sessionManager.appendCompaction("summary of old", managed.session.sessionManager.getLeafId(), 10);
    };
    let compaction!: Promise<unknown>;
    await window.ask({ type: "compact" }, () => {
      compaction = service.compact(sessionId);
    });
    assert.equal(isRunning(window.state), true);
    assert.equal(isBusy(window.state), false);
    finish();
    await compaction;
    assert.equal(isRunning(window.state), false);
    assert.ok(window.state.messages.some((row) => row.marker === "compaction"));
  } finally {
    await service.disposeAll();
  }
});

test("replay: idle and deferred asset switches reach both windows of the conversation", async () => {
  const { service, sessionId, managed } = await setup();
  const one = new Window(service);
  const two = new Window(service);
  try {
    one.open(sessionId);
    two.open(sessionId);
    await one.ask({ type: "switch_role_preset", payload: { rolePresetSlug: "alternate" } }, () =>
      service.switchAssetSelectors(sessionId, { rolePresetSlug: "alternate" }),
    );
    assert.equal(two.state.snapshot?.rolePresetSlug, "alternate");
    assert.equal(two.state.messages.length, one.state.messages.length, "rows survive the swap");

    const live = (service as any).sessions.get(sessionId);
    assert.notEqual(live, managed, "the instance was replaced");
    const release = holdTurn(live);
    await one.prompt("turn", () => service.runPrompt(sessionId, "turn"));
    await two.ask({ type: "switch_soul", payload: { soulSlug: "soul-test" } }, () =>
      service.switchAssetSelectors(sessionId, { soulSlug: "soul-test" }),
    );
    assert.equal(one.state.snapshot?.pending?.soulSlug, "soul-test");
    release();
    await live.runSettlement;
    for (const window of [one, two]) {
      assert.equal(isRunning(window.state), false);
      assert.equal(window.state.snapshot?.soulSlug, "soul-test");
      assert.equal(window.state.settledRuns, 1, "run_completed reached this window");
    }
  } finally {
    await service.disposeAll();
  }
});

test("replay: Stop with a pending role switch still ends the turn in the window", async () => {
  const { service, sessionId, managed, internal } = await setup();
  const window = new Window(service);
  try {
    window.open(sessionId);
    const release = holdTurn(managed);
    await window.prompt("long turn", () => service.runPrompt(sessionId, "long turn"));
    internal.handleAgentEvent(managed, {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "partial" },
    });
    await window.ask({ type: "switch_role_preset", payload: { rolePresetSlug: "alternate" } }, () =>
      service.switchAssetSelectors(sessionId, { rolePresetSlug: "alternate" }),
    );
    // Pi's order: Stop settles (and replaces the instance) before the run's
    // own finally reaches finishRun.
    managed.session.abort = async () => {};
    await window.ask({ type: "abort" }, () => service.abort(sessionId, "user_stop", "user_abort"));
    assert.notEqual((service as any).sessions.get(sessionId), managed, "replaced at Stop's settle");
    release();
    await managed.runSettlement;
    assert.equal(window.state.settledRuns, 1, "run_failed reached the window through the live instance");
    assert.deepEqual(window.state.turn.parts, []);
    assert.equal(window.state.snapshot?.rolePresetSlug, "alternate");
    assert.equal(recoveryOf(window.state)?.outcome, "interrupted");
  } finally {
    await service.disposeAll();
  }
});

test("replay: a window that joins mid-run sees the live turn, then the settled rows", async () => {
  const { service, sessionId, managed, internal } = await setup();
  const first = new Window(service);
  try {
    first.open(sessionId);
    const release = holdTurn(managed, "full answer");
    await first.prompt("question", () => service.runPrompt(sessionId, "question"));
    internal.handleAgentEvent(managed, {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "partial" },
    });
    // A reconnect is a re-open on a fresh socket: LiveRun replays the turn.
    const late = new Window(service);
    late.open(sessionId);
    assert.equal(isRunning(late.state), true);
    assert.deepEqual(late.state.turn.parts, [{ kind: "text", text: "partial" }]);
    assert.equal(late.state.messages.at(-1)?.text, "question", "the live-user row");
    release();
    await managed.runSettlement;
    assert.deepEqual(late.state.turn.parts, []);
    assert.deepEqual(
      late.state.messages.map((row) => row.text),
      ["question", "full answer"],
    );
  } finally {
    await service.disposeAll();
  }
});

test("replay: opening another conversation mid-run shows only that one", async () => {
  const { service, sessionId, managed, internal } = await setup();
  const other = await service.createSession(selectors);
  const window = new Window(service);
  try {
    window.open(sessionId);
    const release = holdTurn(managed);
    await window.prompt("busy here", () => service.runPrompt(sessionId, "busy here"));
    await window.ask({ type: "open_session", payload: { sessionId: other.sessionId } }, () =>
      window.open(other.sessionId),
    );
    internal.handleAgentEvent(managed, {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "elsewhere" },
    });
    assert.equal(window.state.sessionId, other.sessionId);
    assert.equal(isRunning(window.state), false);
    assert.deepEqual(window.state.turn.parts, []);
    assert.deepEqual(displayMessages(window.state), [], "the first conversation's bubble stays with it");
    release();
    await managed.runSettlement;
    assert.equal(window.state.settledRuns, 0);
  } finally {
    await service.disposeAll();
  }
});

test("replay: a send whose answer is lost with the socket is settled by the reopened rows", async () => {
  const { service, sessionId, managed } = await setup();
  const window = new Window(service);
  try {
    window.open(sessionId);
    const release = holdTurn(managed, "done");
    // The server took this one; the socket dropped before the receipt.
    window.apply({
      type: "request",
      request: { id: "lost-1", from: sessionId, message: { type: "prompt", payload: "reached" }, sentText: "reached", bubble: true, draftText: "reached" },
    });
    service.runPrompt(sessionId, "reached");
    // This one never reached the server.
    window.apply({
      type: "request",
      request: { id: "lost-2", from: sessionId, message: { type: "prompt", payload: "never sent" }, sentText: "never sent", bubble: true, draftText: "never sent" },
    });
    window.close();
    assert.equal(isBusy(window.state), false);
    release();
    await managed.runSettlement;
    // Reconnect: the re-open's rows decide.
    window.apply({ type: "socket", status: "open" });
    window.open(sessionId);
    assert.deepEqual(window.state.requests, []);
    assert.deepEqual(returned(window).map((entry) => entry.text), ["never sent"]);
    assert.equal(window.state.notice?.body.kind, "unsent");
    assert.deepEqual(
      displayMessages(window.state).map((row) => row.text),
      ["reached", "done"],
    );
  } finally {
    await service.disposeAll();
  }
});
