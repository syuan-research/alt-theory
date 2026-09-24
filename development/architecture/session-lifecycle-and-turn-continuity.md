---
doc_type: architecture
slug: session-lifecycle-and-turn-continuity
scope: Alt Theory session materialization, managed runtime lifecycle, and turn continuity
summary: Materializes sessions, owns their live runtime, records runs, and preserves recoverable turn state across retry, continue, compaction, and reconnect
status: current
last_reviewed: 2026-09-24
tags: [core, backend, session, continuity]
depends_on:
  - branch-family-semantics.md
  - adr/0002-mediated-child-session-substrate.md
  - adr/0004-prompt-cache-safety.md
  - adr/0006-pi-owned-queued-prompt-lifecycle.md
  - adr/0008-per-conversation-client-state-and-request-receipts.md
---

# Architecture: Session Lifecycle and Turn Continuity

This document records the current high-level module for turning a draft into a
managed Alt Theory session, reopening or replacing that runtime, and preserving
the state of individual turns. It is a current-truth document: it does not
describe an intended refactor or imply that the code is cleanly isolated.

`SessionService` currently implements this module together with several adjacent
concerns. The module boundary is therefore explanatory and behavioral, not a
claim that one class or directory contains the whole implementation.

## Boundary

This module owns:

- draft-to-session materialization and the process-local managed runtime;
- opening, reopening, and idle runtime replacement;
- the append-only run record used to project the active turn;
- retry-from-start, continue-from-breakpoint, and latest-turn revision/delete
  entry points;
- compaction boundary publication and in-flight run replay for late joiners;
- run phases, terminal outcomes, and recovery state exposed to attached clients;
- the per-session run state: one phase, the switches deferred while a turn
  runs, and the mirror of Pi's prompt queue.

The neighboring documents own different contracts:

- [`branch-family-semantics.md`](branch-family-semantics.md) owns lineage,
  family membership, Branch/Related semantics, and child workspace policy.
- [`agent-behavior-and-assets.md`](agent-behavior-and-assets.md) owns prompt
  composition and behavior-layer semantics; this document only points to the
  runtime assembly boundary.
- [`provider-model-configuration-and-selection.md`](provider-model-configuration-and-selection.md)
  owns provider/model selection and saved configuration; this document records
  only that a managed runtime uses the resolved model.
- [`workspace-files-and-action-safety.md`](workspace-files-and-action-safety.md)
  owns workspace containment, file routes, approvals, and action policy; this
  document records only the lifecycle's interaction with them.
- [`session-import-adapters.md`](session-import-adapters.md) owns external
  harness discovery, projection, and provenance; imported sessions enter the
  ordinary lifecycle described here.

The mediated child-session substrate is constrained by
[`adr/0002-mediated-child-session-substrate.md`](adr/0002-mediated-child-session-substrate.md).
Prompt-cache behavior for copied session history is constrained by
[`adr/0004-prompt-cache-safety.md`](adr/0004-prompt-cache-safety.md).

## Materialization and managed runtime

A WebSocket connection holds no draft: it greets with the new-conversation
defaults (`session_draft`), and the draft itself — text, files and settings —
lives in the client (`lib/draft.ts`, see the information architecture). The
first prompt, skill invocation or root Helper carries the draft's settings in
`create`; the server checks them (`creationFrom` in `server.ts`) and calls
`SessionService.createSession()` in `alt-theory-app/web-server/session-service.ts`,
which allocates the readable session ID, creates the session directories,
assembles an Alt Theory/Pi runtime, writes foundation records, and registers a
`ManagedSession`. A creation refused at assembly (unknown role, soul, model,
missing folder) removes the directories it made. Merely connecting, opening
the composer, or calling `new_session` does not create a persisted zero-turn
conversation; a setting sent before a conversation exists is refused.

The materialized session has two related authorities:

- Pi's JSONL session is the conversation-body authority.
- Alt Theory's `records/` files are thin control and projection records: the
  assembly manifest, session header, metrics, events, and append-only run
  records. They do not duplicate the conversation body.

`ManagedSession` keeps the live `AgentSession`, selectors and manifest-derived
state, counters, a process-local mutation guard, recovery state, and the
current live-run buffer. Subscribers are kept by `SessionService` per logical
session id, not per instance: `attach(sessionId, listener)` registers on the
id, and `emit()` forwards only events of the instance that owns the id now —
a replaced instance's trailing events are dropped. `isOpen()` reads the same
map. The WebSocket layer maps each event with `toServerMessage()`
(`web-server/websocket-protocol.ts`).

## Open, reopen, and runtime replacement

`openSession()` returns the existing managed instance when the session is already
live. This avoids stacking a second runtime over
the same JSONL while a run is active. When no live instance exists,
`createManagedFromExisting()` restores the persisted Pi file and current runtime
assembly, reconciles an accepted run left by process exit, aligns the active Pi
leaf from run evidence, builds the transcript, and registers the managed runtime.
Undelivered addressed child-session mail is injected as a no-turn custom message
during open. See `session-service.ts` (`openSession`,
`createManagedFromExisting`, and `openManagedRuntime`).

Opening is recovery-oriented. Missing role, soul, or KB assets can produce a
visible resume warning and use the current fallback selector. A missing
per-session model override can fall back to the deployment model while retaining
the stale override in the header. These are resume behaviors; they do not rewrite
the original assembly record.

Idle Role, Soul, and Custom Instruction changes use `replaceSession()`. With
history, the service opens the same Pi JSONL through
`createManagedFromExistingWithSelectors()` and then disposes the prior managed
runtime. The same choices made while a turn runs are deferred; `settle()` folds
the three pending selectors into one replacement after the complete run. A
replacement therefore creates a new in-memory assembly while preserving the
session identity and conversation evidence; it is not a second logical
conversation. Because subscriptions follow the id, a replacement is internal:
no window re-attaches, the idle switch publishes the replacement's
`session_updated` snapshot to every window (the requester also gets the new
manifest), and a working-folder re-point (`repointOne`, dispose and reopen)
publishes its snapshot the same way. A replacement does not change the visible
rows, so it carries no transcript; clients keep theirs. Every replacement
(idle switch, deferred switch at settle, re-point) also publishes the new
instance's manifest (`session_metadata`), and a snapshot's `resumeWarnings`
refresh the window's warnings. A turn's terminal event goes out through
whichever instance owns the conversation after its settle — Stop settles
first and may already have replaced the instance.

The four current assembly paths all retain the same session-service lifecycle
shape: new materialization (`createManagedFromDirs`), ordinary reopen
(`createManagedFromExisting`), selector-based replacement
(`createManagedFromExistingWithSelectors`), and runtime open
(`openManagedRuntime`). Their assembly inputs include adjacent prompt, model,
workspace, and agent-team concerns; this module does not redefine those inputs.

## Run state and deferred switches

Each managed session carries one `RunState` (`web-server/run-state.ts`). Its
phase is `idle`, `running`, `stopping`, or `queued` (running with texts in
Pi's queue). Every mutation that needs an idle session checks this state
through `assertIdle()`; `busy || isStreaming` is no longer restated. A run
calls the service's `beginRun()` at its start, which pushes a `session_updated`
snapshot, and `settle()` at its end, which is the only idle transition and
the only `run_phase: idle` the client hears: the run's `finally` (through
`finishRun()`), `abort()`, and `compact()`. `settle()` always publishes a
snapshot, deferred switches applied or not. Every setting change —
applied now or accepted as pending mid-run (`publish()`: mode, Full Access,
model, knowledge, visibility, study tag, Role/Soul/instruction, latest-turn
delete) — publishes a snapshot to every window of the conversation; the
WebSocket layer no longer echoes its own copy to the requester. The
snapshot's `status` is the run phase itself (`idle | running | stopping |
queued`); it also carries the header's `workspacePrimaryDir` (null =
independent).

Where a status fact lives (v1.5.1):

- **What the conversation is doing** has one source, `RunState`. Every
  message about phase, context usage, or the last failure derives from it;
  no handler builds a done or idle signal by hand. Pi's `agent_end` fires
  before Pi's own post-turn compaction check and any queued continuation,
  so it only does bookkeeping; `run_completed` (with the snapshot) and
  `session_metrics` go out from `finishRun()` after `session.prompt()`
  resolves and `settle()` ran, where `run_failed` goes out too. The
  sessions-list projection (`sessionActivity()`) reads the run record's
  outcome for "failed", never Pi's raw error text.
- **What the conversation list shows** (running, awaiting approval, failed,
  idle) is that projection, pushed (WP-4, 2026-09-24): `SessionService`
  recomputes a conversation's list activity in `emit()` on the events that
  can move it (snapshot, run end, approval requested or resolved) and tells
  its activity subscribers only when it changed; creation (new and forked)
  and the REST delete, family delete, restore and permanent delete send a
  list change. Every WS connection gets `activity_snapshot` on (re)connect,
  then `session_activity` changes, filtered by the list's own access rule
  (GET /api/sessions: none for an anonymous window where accounts exist,
  else summary level). The client's list rows, the running count and the
  Related rows read that one source (`AppProvider.applyActivity`,
  `lib/listActivity.ts`); a list change, or activity for a conversation the
  list lacks, re-reads the list. Nothing polls. The "done / failed / needs
  you" marks come from the pushed transitions (`MainView`); whether the
  user has looked is the client's own fact (opening a conversation clears
  its mark).
- **What happened** is a pure function of the session file
  (`buildTranscriptFromEntries`), the same function live and on reload.
  A row-level fact (stop line, tool outcome, compaction divider) is set
  there or derived by one shared client function (`toolOutcome`,
  `replyStopLine`), never twice. A tool-call row carries `success` only
  once its result entry exists; a call with no result (Pi never runs the
  calls of an aborted or failed assistant message) is `pending` — the
  conversation, the Related pane and the Markdown export all read it
  through `toolOutcome`, and `toolLabel` speaks in that state (running /
  finished / failed / pending) for every tool. A running command's row
  shows the last line of Pi's partial result (`tool_updated.text`,
  bash only), dropped when the tool finishes.
- **The client reads facts from the snapshot and derives only what is its
  own** ([ADR 0008](adr/0008-per-conversation-client-state-and-request-receipts.md)).
  One pure transition, `reduce()` in `frontend/src/lib/conversation.ts`,
  holds a conversation's client state: the latest snapshot kept whole,
  the rows and the in-flight turn, the socket's own status, this client's
  requests in flight, the staged files and the text handed back to the
  editor. Running, recovery, the queue and pending switches are read from
  the latest snapshot only; `run_phase` feeds only the detail label
  ("Thinking…", a tool). What the client derives itself is what it alone
  knows: busy is "a request of this client still unanswered" (the request
  table `REQUEST_BUSY`), never a hand-cleared flag. `runStateView`
  (`frontend/src/lib/runState.ts`) combines socket, run fact and busy into
  the one phase, with the label tables. `hooks/useConversation.ts` wraps the
  transition with `useReducer`, the socket and the commands; the main view
  (`context/MainView.tsx`) and the right pane (`ChildConversation`) both use
  it, and shared pieces (queue cards, status line, Continue, notice, slash
  palette, model chip) read the nearest conversation. A failed run shows its
  failure envelope and recovery; the phase is idle, not "error". A recovery
  is hidden while the run owns the conversation or a request is in flight;
  the stop-edit hint is derived from idle recovery. The switch is exhaustive
  over `ServerMessage` (`conversation.test.ts`, `runState.test.ts`,
  `conversation-replay.test.ts`; `session-service.test.ts` "agent_end does
  not end the turn").

**Request receipts.** Any client message may carry a `requestId`; the
WebSocket handler answers it exactly once — `request_done` when accepted, an
`error` carrying the id when refused — and a `finally` answers any path that
returned without either. Accepted means: a run request's run has begun or its
text entered Pi's queue (not that the run ended); a navigation's attach
messages were sent; a switch's snapshot was sent. `compact()` refuses
synchronously and returns the run's outcome, so its receipt means the run
began. A refusal before a run starts (busy, no model) is an `error` reply,
not a `run_failed`. A sent message shows as a user bubble with a pending mark
until its receipt; accepted, it stays until the rows carry it (the turn's end
retires it). A refused send's text and staged files go back to the editor
of the conversation the window shows when the refusal arrives. When the
socket drops before the receipt, the send is unknown: the re-open's rows (or
the snapshot's queue) settle it — there, it was sent; missing, it goes back
to the editor with a one-line notice (a send with nothing to hand back is
dropped silently). A first send from the new-conversation page is not
settled this way: if the socket dropped before the conversation was
announced, nothing re-opens it, so the text comes back as unsent even if the
server created and started the conversation. There is no outbox and nothing
is re-sent
(`backend-server.integration.ts` "every socket on a conversation keeps its
events …", `conversation-replay.test.ts`).

A model/thinking, mode, Full Access on, app runtime-mode, Role, Soul, Custom
Instruction, knowledge-base, or visibility switch during a run is accepted,
not refused: `RunState.applyOrDefer()` applies it now when idle or records the
last choice for that key as pending. Turning Full Access off still applies
immediately, because the guard reads it per tool call. At `settle()`, Role,
Soul, and Custom Instruction are combined into one instance replacement first
(subscribers follow the id, so the events after it reach every window), then
mode, Full Access, model, knowledge, visibility, and runtime changes run
through their ordinary appliers on the live instance. A null Role, Soul, or
instruction means clear. A failed drain keeps the unaffected current value and
emits an error-level `extension_notice`; the settle snapshot follows either
way.

The snapshot exposes `pending` (the deferred values), `thinking` (the
resolver's answer, see the provider/model document), and `queue` (Pi's steering
and follow-up texts). The client renders a deferred switch as the chosen value
with a pending mark, never as an error. Operations that revise or delete the
history being generated remain idle-only; they are not configuration switches
(`run-state.test.ts`; `session-service.test.ts` "switches during a run are
deferred").

Every failure the service reports — `run_failed`, a refused WebSocket request,
an error-level notice — carries the one envelope from `core/failure.ts`:
`{operation, kind, message, retryable}`. Kinds come from the error's type
first (typed abort, busy) and from producer text only inside that module;
the model-fallback rule table matches on the kind. Interruption is still
never inferred from text (`core/failure.test.ts`).

## Managed child-session lifecycle

An agent-team child is a normal managed Alt Theory session, created through
`createSession()` with `forkedFrom.purpose: "subagent"`, durable records, its own
Pi history, and a parent session id. It starts a background run immediately or
enters the process-wide FIFO subagent queue when the concurrency cap is full.
The child remains
an inspectable, messageable session after its turn ends or is interrupted; this
is the managed-session substrate recorded in
[`adr/0002-mediated-child-session-substrate.md`](adr/0002-mediated-child-session-substrate.md).

At spawn, the parent supplies the bounded task packet and the child records its
resolved initial model chain in `subagentExecution`; the live child restores that
chain when reopened. The parent’s assembled subagent configuration snapshot is
used for spawn validation. Initial fallback-gate
and model/thinking semantics remain owned by the agent behavior/model material;
this module records only that child creation and later turns use the ordinary
managed run lifecycle. See `session-service.ts` (`spawnSubagent`,
`startSubagentRun`, and `openManagedRuntime`).

Once `startSubagentRun` accepts the child's task, spawn emits a live
`related_session_created` (purpose `subagent`) session event on the parent —
socket delivery through `forwardServiceEvent`; nothing is appended to the
parent's session-events.jsonl. Catalog visibility needs no subagent special
case: `runPromptWithLineage` writes the accepted run record before the model
call, and `isDurableCatalogSession` counts any accepted run record as durable
evidence, so a fresh child is listed the moment its run starts under the same
rule as every other session. A spawn rejected during validation, before the
child exists, leaves nothing. On the client, a subagent birth never opens the
right rail (owner 2026-09-18) — the Related row is the feedback — and it never
consumes a pending Helper/BTW seed. The right rail's own status band sits at
its composer, the same seat as the center pane, and carries the idle Continue
qualification (shared engine recovery + `continue_latest` over its own
socket).

The spawn may also name an existing Role. That Role is validated before any
child session is created and enters the ordinary selector/assembly path;
omission inherits the parent's Role, while an unknown id fails with
`not_found` and leaves no partial session. Role semantics and the distinction
from the execution preset are owned by
[`agent-behavior-and-assets.md`](agent-behavior-and-assets.md).

Child lifecycle outcomes are delivered to the parent through the durable
per-session `agent-mail.jsonl` inbox. Only terminal child turn outcomes—
`completed`, `failed`, or explicitly `interrupted`—produce lifecycle mail;
provider auto-retry and a successful initial fallback do not. A running parent
receives the envelope at its next step boundary; an idle open parent receives a
normal notification turn; a closed parent receives the undelivered envelope on
next open (`session-service.ts`, `deliverEnvelope` and `openSession`). The
mail envelope is rendered as addressed context, not as an ordinary user bubble.

What the lead is told is composed in one place, `describeChildOutcome()`
(`web-server/child-outcome.ts`): the envelope's `event`, its `cause`, the body,
and the status word that `check_agent`, `wait_for_agents`, and `list_agents`
report. An interrupted envelope carries the run's `interruptionCause`; the
context tag renders it as `cause="…"`. For `user_abort` the body tells the
lead the user stopped the subagent and not to restart or continue it unless
the user asks (Owner ruling 2026-09-02); `lead_abort` (the lead's own
`interrupt_agent`) and `process_exit` keep a factual body that leaves the child
continuable. A child whose accepted run is reconciled as `process_exit` on
reopen mails its lead once, at that reopen. Status lines derive from the same
function, so an interrupted child reads "interrupted (…)", never idle
(`child-outcome.test.ts`; `agent-team.test.ts` interrupt cases).

## Run records and active-turn projection

Every accepted prompt gets a run record in `records/runs.jsonl` with
`sessionId`, `branchId`, `turnId`, `revisionId`, `runId`, the Pi session file,
entry IDs, and terminal status. The accepted record is completed by a later
snapshot; the conversation body remains in Pi JSONL. `runPromptWithLineage()`
creates the accepted record before calling Pi and records the discovered user and
assistant entries on completion or failure
(`session-service.ts`, `runPromptWithLineage`).

The current terminal statuses are `completed`, `failed`, and `interrupted`.
`interruptionCause` identifies an explicit Alt stop or typed abort:
`user_abort` (the Stop button), `lead_abort` (a lead's `interrupt_agent`),
`process_exit` (reconciled on reopen), or `unknown`; an error merely
containing the word “interrupt” remains a failure. This distinction is
exercised by `session-service.test.ts` (abort classification cases).

The latest active run records determine which Pi leaf and entries are projected
as the current conversation. Revision and delete mark prior records
`superseded` or `deleted`; Pi evidence stays on disk. On open, an accepted run
with durable entries after its prior leaf is reconciled as `interrupted`, so
partial work remains visible and can be continued
(`session-service.ts`, `openManagedRuntime`; `session-service.test.ts`, reopen
and continuation cases).

## Retry, continue, and ordinary follow-up

`retry_latest` rewinds the current latest user turn and runs its stored
model-facing prompt again from the start. It supersedes the prior attempt and
does not create a visible child (`session-service.ts`, `retryLatestFromStart`).

`continue_latest` is available only for a latest run whose outcome is
`failed` or `interrupted`. It keeps the existing user entry, adopts the failed
attempt's completed assistant/tool entries, and calls Pi's continuation path so
only the trailing failed partial is regenerated
(`session-service.ts`, `continueLatestFromBreakpoint`). The recovery
projection tells the client whether continue or retry-from-start is available.

An ordinary follow-up is a new run after the previous run is terminal. While a
run is active, a second prompt is not a new ordinary turn: Pi owns the queue.
The client sends `prompt {deliverAs}` and `SessionService.queuePrompt()` hands
the text to Pi's steering queue (delivered before the next LLM call — the
product rule "queued = next API call") or, on request, its follow-up queue.
Pi's `queue_update` events are mirrored into the run state and forwarded as
`queue_updated`, but queue removal is not delivery: retract, Stop, and Pi's own
drain all remove entries. A queued user bubble appears only when Pi emits a
user `message_start` for text still tracked as queued; the service then emits
`user_steered` and retires its staged-attachment entry. Interrupt & send's
selected text is tracked separately while its direct prompt starts and emits
the same bubble signal at its user `message_start`, not at queue removal.
Agent-team mail rides the same Pi queue but is not shown as queued. `abort()` clears Pi's queue and
reports every unsent text plus its staged attachment paths as restored, which
the main composer puts back into the editor and attachment stage. There is no
browser-side queue. This authority and delivery boundary is recorded in
[`ADR 0006`](adr/0006-pi-owned-queued-prompt-lifecycle.md).

A queued card carries an edit label and a delete icon; both call
`POST /api/sessions/:id/queue/retract`, which runs
`SessionService.retractQueued()`. Pi has no per-entry queue API, so the
operation clears the queue and re-queues every other string in its original
order and kind, and matches the entry by text rather than by index because Pi
may have delivered it since the last mirror. The run is not interrupted, the
intermediate empty queue raises no `user_steered` bubble, and a miss returns
the failure envelope with `kind: not_found`, on which the client just drops
the card. Edit puts the returned text back into the editor after any existing
draft; delete discards it. Staged attachments are kept beside each queued text
in `ManagedSession.queuedAttachments` (Pi's queue holds only the strings): a
retract returns the paths found under that text, while delivery retires them and
Stop restores all paths into the main attachment stage. Because the side map is
keyed by text, identical queued texts do not retain distinct attachment
identity. The child conversation pane remains text-only because its editor
stages no attachments. Each remaining entry is re-queued on its own: a re-queue
that fails does not fail the retract (the call still resolves and Pi's queue,
mirrored after the attempt, is the truth about what survived), and an entry
consumed mid-restore still receives its `user_steered` bubble
(`session-service.test.ts` "a queued message is recalled by text", "a retract
hands the queued attachments back", "a restore-time delivery still bubbles").

`send_queued_now` is the third queued-card action. `interruptAndSend()` verifies
that Pi still owns the selected text, clears the live queue once, stops and
settles the current run, starts the selected text as the next real prompt with
its attachments, then re-queues every other entry as `followUp` in its original
order so none can steer into the selected prompt's first model request. If Pi
already consumed the selected entry, the operation is a no-op and the normal
delivery events finish the card-to-bubble transition. If stopping or starting
fails, all removed text and attachments are restored before the failure is
reported. A later failure to re-queue one of the other entries only warns; Pi's
resulting queue remains the authority. The new run's snapshot carries the
queue after the clear (empty at that moment); any remaining cards appear in
the later follow-up re-queue events. The selected direct prompt's delivery is
confirmed separately by its user `message_start`. Recovery projection returns
no Continue while a run is active.

Pi's own transient provider retry is represented as a `retrying` run phase. Alt
Theory does not wrap it in a second retry loop. A successful or failed terminal
outcome is finalized only after pending run work has settled; the run state
settles in the same `finally`, which keeps the phase, run record, and recovery
projection aligned. `finishRun()` builds the terminal payload after
`settle()`: `run_completed` is `{ snapshot, messages }` and `run_failed`
`{ failure, snapshot, messages }` — the post-settle snapshot (its recovery is
what Continue reads; read before settle it is still null) and the durable
transcript projection, read after the live-run bubble is cleared so the
prompt is not echoed (`session-service.test.ts` "a failed run's run_failed
carries the recovery Continue needs").

## Compaction and live-run state

Manual, threshold, and overflow compaction share the Pi event path. A completed
`compaction_end` with a result rebuilds the transcript from the live Pi branch
and republishes metrics (`publishCompactionBoundary()`); aborted or failed
compaction publishes no boundary, and the run phase after any `compaction_end`
is `processing` — the run is idle only when `settle()` says so. Pi's automatic
compaction runs after `agent_end`, inside the same `prompt()` call, so the
composer stays busy through it and a message sent then is queued visibly or
refused, never steered into the closing turn. Context usage is unknown until
a later model-usage event; the client draws that as an explicit unknown ring
rather than nothing. The threshold and aborted/overflow cases are covered by
`session-service.test.ts` ("compaction" cases).

Each active turn has a process-local `LiveRun` buffer containing the displayable
user prompt and replayable stream events. `appendLiveRunEvent()` coalesces
successive text/thinking deltas and replaces successive phase events with the
latest phase (`web-server/live-run.ts`). The service clears the buffer only
on `run_completed` or `run_failed`; `getLiveRun()` returns it only while the
run state is not idle.
Thus a pane attaching mid-run receives the persisted transcript plus the current
prompt and buffered deltas/tool/phase events, while a terminal run has no stale
live replay. The turn's end needs no REST fetch: the client replaces the
streaming parts with the terminal event's rows in one transition, so there is
no frame between the stream vanishing and the rows arriving. Every projected
row carries a stable `rowId` — the entry id plus the row's ordinal within its
entry, because one assistant entry projects to several rows sharing an
`entryId` and compaction/system rows have none; `MessageList` keys by it
(`backend-server.integration.ts` "every projected row has a unique stable
id").

A stopped or failed attempt is filtered from the model's context as a whole
message: the installed Pi provider transform (`pi-ai` `transform-messages`)
skips any assistant whose own `stopReason` is `aborted` or `error`, while
`length` and completed messages are never dropped for those reasons
(`web-server/pi-stop-filter-contract.test.ts` pins this against the real
function). `buildTranscriptFromEntries` (`web-server/session-store.ts`)
therefore sets `stopReason` on **every** visible row of such an attempt — rows
share the entryId — and on the last text row of a `length` cut; a length cut
drops nothing. An attempt without visible rows yields no line. The client
groups consecutive same-entryId stopped/failed rows into one tinted range with
a single line at its end (`frontend/src/lib/replyStop.ts`,
`MessageList.tsx`), live and on reload. A retry phase carries
`droppedPartialText` — read from Pi's still-present trailing assistant before
the retry removes it — and the client shows a lost-output line only when that
is true (`transcript-stop-reason.test.ts`, `replyStop.test.ts`,
`conversation.test.ts`).

Run phases currently include `connecting`, `processing`, `thinking`, `tool`,
`compacting`, `retrying`, `awaiting-user`, `idle`, and `error`. Attached panes
receive these events through the session service; the frontend decides how to
render them.

## Boundary clarity

This module is a medium-grained map over a historically coupled implementation.
The lifecycle and continuity contract is clear enough to document separately,
but `SessionService` still contains prompt assembly, model resolution, workspace
changes, agent-team delivery, privacy/retention updates, and lineage-adjacent
operations. Those crossings are current facts, not evidence that the module
boundaries are already enforced in code.

### Verification anchors

- Backend lifecycle and continuity suite: `npm run test:backend`.
- Materialization, run projection, retry/continue, abort classification,
  process-exit recovery, and replacement coverage:
  `alt-theory-app/web-server/session-service.test.ts`.
- Live-run coalescing/replay behavior:
  `alt-theory-app/web-server/live-run.test.ts`.
- Run state, deferred switches, and Pi-owned queue:
  `alt-theory-app/web-server/run-state.test.ts` and the v1.5 cases at the end
  of `session-service.test.ts`.
- Failure envelope: `alt-theory-app/core/failure.test.ts`.
- Client transition and replay of real service sequences through it:
  `alt-theory-app/frontend/src/lib/conversation.test.ts`,
  `alt-theory-app/web-server/conversation-replay.test.ts`; request receipts
  and two sockets on one conversation over real WebSockets:
  `backend-server.integration.ts`.
- Child outcome, cause, and status words:
  `alt-theory-app/web-server/child-outcome.test.ts`, `agent-team.test.ts`.
