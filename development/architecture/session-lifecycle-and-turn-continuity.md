---
doc_type: architecture
slug: session-lifecycle-and-turn-continuity
scope: Alt Theory session materialization, managed runtime lifecycle, and turn continuity
summary: Materializes sessions, owns their live runtime, records runs, and preserves recoverable turn state across retry, continue, compaction, and reconnect
status: current
last_reviewed: 2026-08-28
tags: [core, backend, session, continuity]
depends_on:
  - branch-family-semantics.md
  - adr/0002-mediated-child-session-substrate.md
  - adr/0004-prompt-cache-safety.md
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

A WebSocket connection begins with selector state only. The first prompt calls
`SessionService.createSession()` (`alt-theory-app/web-server/session-service.ts:562-588`),
allocates the readable session ID, creates the session directories, assembles an
Alt Theory/Pi runtime, writes foundation records, and registers a
`ManagedSession`. Merely connecting, opening the composer, or calling
`new_session` does not create a persisted zero-turn conversation.

The materialized session has two related authorities:

- Pi's JSONL session is the conversation-body authority.
- Alt Theory's `records/` files are thin control and projection records: the
  assembly manifest, session header, metrics, events, and append-only run
  records. They do not duplicate the conversation body.

`ManagedSession` keeps the live `AgentSession`, selectors and manifest-derived
state, counters, listeners, a process-local mutation guard, recovery state, and
the current live-run buffer. `SessionService` forwards one internal Pi event
subscription to all attached WebSocket listeners.

## Open, reopen, and runtime replacement

`openSession()` returns the existing managed instance when the session is already
live (`session-service.ts:590-601`). This avoids stacking a second runtime over
the same JSONL while a run is active. When no live instance exists,
`createManagedFromExisting()` restores the persisted Pi file and current runtime
assembly, reconciles an accepted run left by process exit, aligns the active Pi
leaf from run evidence, builds the transcript, and registers the managed runtime
(`session-service.ts:3097-3308`). Undelivered addressed child-session mail is
injected as a no-turn custom message during open (`session-service.ts:616-636`).

Opening is recovery-oriented. Missing role, soul, or KB assets can produce a
visible resume warning and use the current fallback selector. A missing
per-session model override can fall back to the deployment model while retaining
the stale override in the header. These are resume behaviors; they do not rewrite
the original assembly record.

Idle role/soul or related selector changes use `replaceSession()`
(`session-service.ts:640-686`). With history, the service opens the same Pi JSONL
through `createManagedFromExistingWithSelectors()` and then disposes the prior
managed runtime. A session whose run state is not idle rejects replacement with
`session_busy`. A replacement therefore creates a new in-memory assembly while
preserving the session identity and conversation evidence; it is not a second
logical conversation.

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
calls `begin()` at its start and the service's `settle()` at its end, which is
the only idle transition: the run's `finally`, `abort()`, and `compact()`.

A model, thinking, mode, Full Access on, or app runtime-mode switch during a
run is accepted, not refused: `RunState.applyOrDefer()` applies it now when
idle or records it as pending, and `settle()` drains the pending set through
the same appliers the live path uses (`applyMode`, `applyModel`,
`applyRuntime`, the core's `setFullAccess`). Turning Full Access off applies
immediately, because the guard reads it per tool call. A change that fails at
drain time is reported as an error-level `extension_notice`; a successful
drain is followed by a `session_updated` snapshot. The snapshot exposes
`pending` (the deferred values), `thinking` (the resolver's answer, see the
provider/model document), and `queue` (Pi's steering and follow-up texts).
The client renders a deferred switch as the chosen value with a pending mark,
never as an error; a `session_busy` refusal never changes the client's run
state (`run-state.test.ts`; `session-service.test.ts` "switches during a run
are deferred").

Every failure the service reports — `run_failed`, a refused WebSocket request,
an error-level notice — carries the one envelope from `core/failure.ts`:
`{operation, kind, message, retryable}`. Kinds come from the error's type
first (typed abort, busy) and from producer text only inside that module;
the model-fallback rule table matches on the kind. Interruption is still
never inferred from text (`core/failure.test.ts`).

## Managed child-session lifecycle

An agent-team child is a normal managed Alt Theory session, created through
`createSession()` with `forkedFrom.purpose: "subagent"`, durable records, its own
Pi history, and a parent session id (`session-service.ts:2628-2693`). It starts a
background run immediately or enters the process-wide FIFO subagent queue when
the concurrency cap is full (`session-service.ts:2979-3023`). The child remains
an inspectable, messageable session after its turn ends or is interrupted; this
is the managed-session substrate recorded in
[`adr/0002-mediated-child-session-substrate.md`](adr/0002-mediated-child-session-substrate.md).

At spawn, the parent supplies the bounded task packet and the child records its
resolved initial model chain in `subagentExecution`; the live child restores that
chain when reopened. The parent’s assembled subagent configuration snapshot is
used for spawn validation (`session-service.ts:2636-2654`). Initial fallback-gate
and model/thinking semantics remain owned by the agent behavior/model material;
this module records only that child creation and later turns use the ordinary
managed run lifecycle (`session-service.ts:3797-3890`).

Child lifecycle outcomes are delivered to the parent through the durable
per-session `agent-mail.jsonl` inbox. Only terminal child turn outcomes—
`completed`, `failed`, or explicitly `interrupted`—produce lifecycle mail;
provider auto-retry and a successful initial fallback do not. A running parent
receives the envelope at its next step boundary; an idle open parent receives a
normal notification turn; a closed parent receives the undelivered envelope on
next open (`session-service.ts:3034-3088`, `session-service.ts:616-636`). The
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
(`session-service.ts:1765-1924`).

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
(`session-service.ts:3276-3286`; `session-service.test.ts:1139-1243`).

## Retry, continue, and ordinary follow-up

`retry_latest` rewinds the current latest user turn and runs its stored
model-facing prompt again from the start. It supersedes the prior attempt and
does not create a visible child (`session-service.ts:1010-1062`).

`continue_latest` is available only for a latest run whose outcome is
`failed` or `interrupted`. It keeps the existing user entry, adopts the failed
attempt's completed assistant/tool entries, and calls Pi's continuation path so
only the trailing failed partial is regenerated
(`session-service.ts:1082-1124`; `session-service.ts:1126-1265`). The recovery
projection tells the client whether continue or retry-from-start is available.

An ordinary follow-up is a new run after the previous run is terminal. While a
run is active, a second prompt is not a new ordinary turn: Pi owns the queue.
The client sends `prompt {deliverAs}` and `SessionService.queuePrompt()` hands
the text to Pi's steering queue (delivered before the next LLM call — the
product rule "queued = next API call") or, on request, its follow-up queue.
Pi's `queue_update` events are mirrored into the run state and forwarded as
`queue_updated`; a text that leaves the queue is broadcast as `user_steered`
at that moment, so its bubble appears when the model receives it. Agent-team
mail rides the same Pi queue but is not shown as queued. `abort()` clears
Pi's queue first and reports the unsent texts as `restored`, which the client
puts back into the editor. There is no browser-side queue
(`session-service.test.ts` "a message during a run joins Pi's steer queue").

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
retract returns them with the text and a re-queue replays the remaining
entries' own attachments; delivery and Stop clear them (Stop still restores
text only). The child conversation pane drops retracted attachments — its
editor stages none (`session-service.test.ts` "a queued message is recalled by
text", "a retract hands the queued attachments back").

Pi's own transient provider retry is represented as a `retrying` run phase. Alt
Theory does not wrap it in a second retry loop. A successful or failed terminal
outcome is finalized only after pending run work has settled; the run state
settles in the same `finally`, which keeps the phase, run record, and recovery
projection aligned.

## Compaction and live-run state

Manual, threshold, and overflow compaction share the Pi event path. A completed
`compaction_end` with a result rebuilds the transcript from the live Pi branch
and republishes metrics; aborted or failed compaction publishes no boundary.
Context usage is cleared to unknown until a later model-usage event, avoiding a
stale pre-compaction percentage (`session-service.ts:2011-2066`,
`session-service.ts:3965-3976`). The threshold and aborted/overflow cases are
covered by `session-service.test.ts:2459-2639`.

Each active turn has a process-local `LiveRun` buffer containing the displayable
user prompt and replayable stream events. `appendLiveRunEvent()` coalesces
successive text/thinking deltas and replaces successive phase events with the
latest phase (`web-server/live-run.ts:3-47`). The service clears the buffer only
on `run_completed` or `run_failed`; `getLiveRun()` returns it only while the
run state is not idle.
Thus a pane attaching mid-run receives the persisted transcript plus the current
prompt and buffered deltas/tool/phase events, while a terminal run has no stale
live replay.

A reply that did not finish carries Pi's `stopReason` (`aborted` or `error`) on
its last assistant transcript row (`buildTranscriptFromEntries` in
`web-server/session-store.ts`; an empty stopped reply still yields a row). The
client draws one grey line under the bubble from that field alone
(`frontend/src/lib/replyStop.ts`): `aborted` says the model keeps the part,
`error` says it does not (Pi removes an errored partial from the agent state
before retrying and keeps it in the session file). Live and reload read the
same field because the client refreshes the transcript on `run_failed`; the
transient retry notice in the stream uses the same wording. No separate
boundary row exists (`transcript-stop-reason.test.ts`, `replyStop.test.ts`).

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
- Child outcome, cause, and status words:
  `alt-theory-app/web-server/child-outcome.test.ts`, `agent-team.test.ts`.
