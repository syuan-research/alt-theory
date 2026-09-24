import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServerMessage, SessionDraftSnapshot, SessionSnapshot, TranscriptMessage } from "@/api/types";
import {
  displayMessages,
  initialConversationState,
  isBusy,
  queuedTexts,
  recoveryOf,
  reduce,
  type ConversationInput,
  type ConversationState,
  type PendingRequest,
} from "./conversation.ts";

const snap = (patch: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  sessionId: "s1",
  status: "idle",
  currentDomain: "ep-core",
  rolePresetSlug: null,
  soulSlug: null,
  messageCount: 0,
  ...patch,
});
const draft: SessionDraftSnapshot = {
  status: "draft",
  visibility: "no-export",
  currentDomain: "ep-core",
  rolePresetSlug: null,
  soulSlug: null,
  mode: "understand",
};
const rows = (...texts: Array<[TranscriptMessage["role"], string]>): TranscriptMessage[] =>
  texts.map(([role, text], index) => ({ role, text, timestamp: null, rowId: `e${index}:0` }));
const server = (message: ServerMessage): ConversationInput => ({ type: "server", message });
const request = (
  id: string,
  message: PendingRequest["message"],
  extra: Partial<PendingRequest> = {},
): ConversationInput => ({ type: "request", request: { id, message, from: "s1", ...extra } });
const prompt = (id: string, text: string, extra: Partial<PendingRequest> = {}) =>
  request(id, { type: "prompt", payload: text }, { sentText: text, bubble: true, draftText: text, ...extra });
const play = (inputs: ConversationInput[], start: ConversationState = initialConversationState()) =>
  inputs.reduce(reduce, start);
/** The text handed back, by the draft it goes to. */
const returns = (state: ConversationState) =>
  state.draftOps.flatMap((op) =>
    op.kind === "return" ? [{ to: op.to, text: op.text, attachments: op.attachments }] : [],
  );
const openedS1: ConversationInput[] = [
  { type: "socket", status: "open" },
  server({ type: "session_opened", payload: snap() }),
  server({ type: "session_transcript", payload: { messages: rows(["user", "hi"], ["assistant", "hello"]) } }),
];

test("a send shows a pending bubble; accepted it stays; the turn's end swaps it for the rows in one step", () => {
  let state = play([...openedS1, prompt("r1", "next")]);
  assert.equal(isBusy(state), true);
  assert.deepEqual(displayMessages(state).at(-1), {
    role: "user",
    text: "next",
    timestamp: null,
    rowId: "local:r1",
    pending: true,
  });
  state = play(
    [
      server({ type: "session_updated", payload: snap({ status: "running" }) }),
      server({ type: "request_done", payload: { requestId: "r1" } }),
      server({ type: "assistant_delta", payload: { text: "stream" } }),
    ],
    state,
  );
  assert.equal(isBusy(state), false);
  assert.equal(displayMessages(state).at(-1)?.pending, false);
  assert.equal(state.turn.parts.length, 1);
  const settled = rows(["user", "hi"], ["assistant", "hello"], ["user", "next"], ["assistant", "stream"]);
  state = play([server({ type: "run_completed", payload: { snapshot: snap(), messages: settled } })], state);
  // One transition: no state in which the stream is gone and the rows not yet in.
  assert.deepEqual(state.turn.parts, []);
  assert.deepEqual(displayMessages(state), settled);
  assert.equal(state.settledRuns, 1);
});

test("a refused send takes its bubble back and hands the text and files to its conversation's draft", () => {
  const state = play([
    ...openedS1,
    prompt("r1", "hello\n\n(Attachments: a.md)", { draftText: "hello", attachments: ["a.md"] }),
    server({
      type: "error",
      payload: {
        requestId: "r1",
        failure: { operation: "prompt", kind: "unknown", message: "No model is selected.", retryable: false },
      },
    }),
  ]);
  assert.equal(displayMessages(state).length, 2);
  assert.deepEqual(returns(state), [{ to: "s1", text: "hello", attachments: ["a.md"] }]);
  assert.equal(state.notice?.body.kind, "refused");
  assert.equal(isBusy(state), false);
});

test("a send lost with the socket is settled by the re-opened rows: there → sent, missing → back to the editor", () => {
  const lost = play([...openedS1, prompt("r1", "landed"), prompt("r2", "vanished"), { type: "socket", status: "closed" }]);
  assert.deepEqual(lost.requests.map((entry) => entry.status), ["unknown", "unknown"]);
  assert.equal(isBusy(lost), false);
  const back = play(
    [
      { type: "socket", status: "open" },
      server({ type: "session_draft", payload: draft }),
      server({ type: "session_opened", payload: snap() }),
      server({
        type: "session_transcript",
        payload: { messages: rows(["user", "hi"], ["assistant", "hello"], ["user", "landed"]) },
      }),
    ],
    lost,
  );
  assert.equal(back.sessionId, "s1", "the reconnect greeting does not detach the conversation");
  assert.deepEqual(back.requests, []);
  assert.deepEqual(returns(back), [{ to: "s1", text: "vanished", attachments: [] }]);
  assert.equal(back.notice?.body.kind, "unsent");
});

test("Stop hands the unsent queue back with its staged paths; the queue shown is the snapshot's", () => {
  const state = play([
    ...openedS1,
    server({ type: "session_updated", payload: snap({ status: "queued", queue: { steering: ["later"], followUp: [] } }) }),
  ]);
  assert.deepEqual(queuedTexts(state), ["later"]);
  const stopped = play(
    [
      server({
        type: "queue_updated",
        payload: { steering: [], followUp: [], restored: ["later"], restoredAttachments: ["b.md"] },
      }),
    ],
    state,
  );
  assert.deepEqual(queuedTexts(stopped), []);
  assert.deepEqual(returns(stopped), [{ to: "s1", text: "later", attachments: ["b.md"] }]);
});

test("what comes back goes to the conversation it came from, not the one on screen", () => {
  const state = play([
    ...openedS1,
    prompt("r1", "from s1"),
    request("r2", { type: "open_session", payload: { sessionId: "s2" } }),
    server({ type: "session_opened", payload: snap({ sessionId: "s2" }) }),
    server({
      type: "error",
      payload: {
        requestId: "r1",
        failure: { operation: "prompt", kind: "unknown", message: "Busy", retryable: false },
      },
    }),
  ]);
  assert.equal(state.sessionId, "s2");
  assert.deepEqual(returns(state), [{ to: "s1", text: "from s1", attachments: [] }]);
  // The drafts took it: the operations are acknowledged and gone.
  const taken = reduce(state, { type: "draft_ops_taken", upTo: state.draftOps.at(-1)!.id });
  assert.deepEqual(taken.draftOps, []);
});

test("the draft's first send becomes the new conversation's; opening another one clears the view", () => {
  const created = play([
    { type: "socket", status: "open" },
    server({ type: "session_draft", payload: draft }),
    request("r1", { type: "prompt", payload: "first", create: { mode: "work" } }, {
      from: null,
      sentText: "first",
      bubble: true,
      draftText: "first",
    }),
    server({ type: "session_opened", payload: snap({ sessionId: "new1", status: "running" }) }),
  ]);
  assert.equal(created.sessionId, "new1");
  assert.equal(created.requests[0].from, "new1");
  assert.equal(displayMessages(created).at(-1)?.text, "first");
  // The new-conversation draft's settings were used.
  assert.deepEqual(
    created.draftOps.map((op) => (op.kind === "created" ? op.sessionId : op.kind)),
    ["new1"],
  );

  const switched = play([
    ...openedS1,
    request("r2", { type: "open_session", payload: { sessionId: "s2" } }),
    server({ type: "session_opened", payload: snap({ sessionId: "s2" }) }),
  ]);
  assert.equal(switched.sessionId, "s2");
  assert.deepEqual(switched.messages, []);
  assert.deepEqual(switched.draftOps, [], "opening a conversation uses no draft");
});

test("Continue comes from the snapshot only, and hides while a request or run is under way", () => {
  const recovery = {
    outcome: "failed" as const,
    userEntryId: "u1",
    canContinue: true,
    canRetryFromStart: true,
  };
  const failed = play([
    ...openedS1,
    server({
      type: "run_failed",
      payload: {
        failure: { operation: "run", kind: "network", message: "ECONNRESET", retryable: true },
        snapshot: snap({ recovery }),
        messages: rows(["user", "hi"]),
      },
    }),
  ]);
  assert.equal(recoveryOf(failed)?.canContinue, true);
  assert.equal(failed.notice?.body.kind, "run-failed");
  const continuing = play([request("r1", { type: "continue_latest" })], failed);
  assert.equal(recoveryOf(continuing), null);

  const stopped = play([
    ...openedS1,
    server({
      type: "run_failed",
      payload: {
        failure: { operation: "run", kind: "aborted", message: "aborted", retryable: false },
        snapshot: snap({ recovery: { ...recovery, outcome: "interrupted", interruptionCause: "user_abort" } }),
        messages: rows(["user", "hi"]),
      },
    }),
  ]);
  assert.equal(stopped.notice, null, "the user's own Stop needs no words");
});

test("a retry that dropped text appends the attempt line; one without text claims nothing", () => {
  const streaming = play([...openedS1, server({ type: "assistant_delta", payload: { text: "partial" } })]);
  const retry = (dropped?: boolean) =>
    play(
      [server({ type: "run_phase", payload: { phase: "retrying", retry: { attempt: 2, maxAttempts: 3, delayMs: 10, droppedPartialText: dropped } } })],
      streaming,
    );
  assert.deepEqual(retry(true).turn.parts.at(-1), { kind: "notice", notice: "retry-dropped" });
  assert.equal(retry(false).turn.parts.length, 1);
  assert.equal(retry(undefined).turn.parts.length, 1);
  assert.equal(retry(true).turn.activity?.kind, "phase");
});

test("a new run clears a turn the previous one left streaming; leaving drops accepted bubbles", () => {
  const stale = play([
    ...openedS1,
    server({ type: "session_updated", payload: snap({ status: "running" }) }),
    server({ type: "assistant_delta", payload: { text: "orphan" } }),
    server({ type: "session_updated", payload: snap() }),
  ]);
  assert.equal(stale.turn.parts.length, 1, "an idle snapshot alone does not touch the stream");
  const next = play([server({ type: "session_updated", payload: snap({ status: "running" }) })], stale);
  assert.deepEqual(next.turn.parts, []);

  const left = play([
    ...openedS1,
    prompt("r1", "sent here"),
    server({ type: "request_done", payload: { requestId: "r1" } }),
    request("r2", { type: "open_session", payload: { sessionId: "s2" } }),
    server({ type: "session_opened", payload: snap({ sessionId: "s2" }) }),
  ]);
  assert.deepEqual(left.requests.map((entry) => entry.id), ["r2"]);
});

test("a lost send with nothing to hand back is dropped without a notice", () => {
  const state = play([
    ...openedS1,
    request("r1", { type: "invoke_skill", payload: { skillName: "x" } }, { sentText: "Invoke x", bubble: true, draftText: "" }),
    { type: "socket", status: "closed" },
    { type: "socket", status: "open" },
    server({ type: "session_opened", payload: snap() }),
    server({ type: "session_transcript", payload: { messages: rows(["user", "hi"]) } }),
  ]);
  assert.deepEqual(state.requests, []);
  assert.equal(state.notice, null);
  assert.deepEqual(state.draftOps, []);
});
