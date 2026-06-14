---
doc_type: explore
type: research
date: 2026-06-14
slug: alt-theory-v0-4-agent-automation-api
topic: What agent automation API should Alt Theory v0.4 expose?
scope: Alt Theory researcher console and backend session engine
keywords: [alt-theory, v0-4, automation-api, agent-uat, websocket, session]
status: active
confidence: medium-high
---

# Alt Theory v0.4 Agent Automation API

## Question

Can external agents such as Codex, OpenCode, or a future simulated-user skill
drive Alt Theory sessions without using the browser UI, and what API should
v0.4 expose first?

## Quick Answer

The current backend is already close enough to prove feasibility, but it is not
yet a stable automation API.

Today, an external script can connect to the WebSocket, wait for
`session_opened`, send `prompt`, wait for `run_completed` or `run_failed`, and
read session detail through REST. This is already used by the live backend
smoke script.

For v0.4, the recommended first pass is an API-first wrapper over the same
backend operations used by the UI:

- create or open a session with explicit config;
- send one user message and wait for the run to settle;
- return final transcript, metrics, manifest, and record pointers;
- support abort;
- list/read/write session records;
- list sessions with project/run labels;
- soft-delete/restore sessions.

This should not be a separate test harness. It should be the backend contract
that both the research console UI and agent automation clients use.

## Current Verified Capabilities

### REST

Current REST routes expose:

- `GET /api/role-presets`
- `GET /api/souls`
- `GET /api/profiles`
- `GET /api/kb-domains`
- `GET /api/sessions`
- `GET /api/sessions/:sessionId`
- `GET /api/sessions/:sessionId/files`
- `GET /api/sessions/:sessionId/files/content`
- `PUT /api/sessions/:sessionId/files/content`

Session detail includes manifest, metrics, event tail, Pi JSONL info,
transcript, transcript preview, and warnings.

Session-local record routes are path-contained to `records/` and `workspace/`,
limited to `.md`, `.txt`, and `.json`.

### WebSocket

Current WebSocket client messages include:

- `prompt`
- `abort`
- `switch_kb`
- `switch_role_preset`
- `switch_profile`
- `switch_soul`
- `new_session`
- `open_session`
- `get_session_metadata`
- `get_session_metrics`

Current server messages include:

- `session_opened`
- `session_updated`
- `session_metadata`
- `session_metrics`
- `session_transcript`
- `assistant_delta`
- `tool_started`
- `tool_updated`
- `tool_finished`
- `run_completed`
- `run_failed`
- `error`

This is enough for a basic agent driver:

1. open WebSocket;
2. wait for `session_opened`;
3. optionally send `open_session`;
4. send `prompt`;
5. collect deltas/tool events;
6. wait for `run_completed` or `run_failed`;
7. fetch `GET /api/sessions/:sessionId` for persisted transcript and records.

### Existing Proof Point

`alt-theory-app/web-server/smoke-backend.ts` already implements this pattern.
It starts a server, connects through WebSocket, sends three prompts, waits for
`run_completed`, checks metrics, and verifies persisted files/events.

Backend tests also cover:

- REST session list/detail and session-local file APIs;
- WebSocket `open_session`;
- connection-local session state;
- transcript payload preservation for user text, assistant text, thinking, and
  tool result entries.

`npm run test:backend` passed on 2026-06-14 with 15 tests.

## Current Gaps

### 1. WebSocket Connection Auto-Creates A Session

Today, opening a WebSocket creates a new session immediately. This is good for
the browser but awkward for automation because an agent may only want to list,
open, or create a specifically configured session.

v0.4 should not create a persisted session as a side effect of connecting.
Before the first user message, configuration is an unpersisted draft. The
first prompt submission resolves the draft, creates a session ID from the
first-turn date-time/role/soul/model snapshot, persists the session, and
starts the run.

### 2. Session Creation Is Not Request-Scoped Enough

New session config currently comes mostly from server startup parameters plus
connection-local selector state. There is no first-class request like:

```json
{
  "projectId": "role-uat-june",
  "kbDomain": "ep-core",
  "soulSlug": "soul-latest",
  "rolePresetSlug": "three-mode",
  "customInstruction": "...",
  "skills": ["sim-user-probe"],
  "runLabel": "manual-uat",
  "testBatch": "2026-06-14"
}
```

For agent UAT, explicit request-scoped config is necessary. Otherwise the
caller has to infer hidden state from launch scripts and UI defaults.

### 3. Run Completion Does Not Return A Full Final Snapshot

`run_completed` currently returns a session snapshot, and the frontend then
refreshes transcript and records by calling REST. That is acceptable for the
current browser UI, but it makes automation clients reimplement the browser's
follow-up fetch behavior.

v0.4 should expose one "send and settle" operation that returns or points to:

- final transcript;
- metrics;
- manifest or resume manifest;
- session events;
- changed record/workspace files where practical.

### 4. Live Rendering And Persisted Transcript Are Split

The browser currently renders live `assistant_delta` and tool events directly,
then refreshes the persisted transcript after `run_completed`. This was a
pragmatic minimal implementation, but it is not the right long-term event
model.

Agent automation should depend on a unified transcript/event model rather than
screen-rendering behavior.

### 5. No Project API Yet

The v0.4 project concept is not implemented. Automation will need project
discovery and project-bound session creation, but project data location and
config precedence are still being designed.

Current direction: new sessions resolve project defaults plus explicit
overrides once into the session manifest; old-session resume is manifest-first
with automatic warned fallback.

### 6. No Soft Delete / Restore API Yet

Manual deletion is needed for the research console. Agent automation also needs
soft delete or cleanup for generated exploratory sessions. This is not present
yet.

### 7. No Authorization Boundary

Current routes are local researcher-console routes. They assume localhost use
and do not implement multi-user authorization. This is acceptable for local
v0.4 automation research, but not for participant-facing or public deployment.

## Pi-Level Evidence

Pi's SDK already provides the core run-settlement primitive:

- `AgentSession.prompt(text)` sends a user turn and resolves after the accepted
  run fully settles, including retries;
- `AgentSession.subscribe(listener)` emits lifecycle, message, thinking, and
  tool events;
- `AgentSession.abort()` aborts the current run;
- `AgentSessionRuntime` is the Pi layer for session replacement such as new,
  resume, fork, and import.

Therefore, Alt Theory does not need to invent its own agent run loop. It needs
to expose stable application-level operations around the existing Pi
session/prompt/session-manager primitives.

## Recommended v0.4 First-Pass API Shape

### Principle

Expose application operations, not browser events.

The browser can still use WebSocket for streaming UI, but automation clients
should be able to drive a session without reproducing DOM behavior.

## API Questions That Are Not Fully Settled

The research is converged on feasibility and direction, but several API design
points should stay explicit until the v0.4 SWE plan locks them down.

### 1. Transport Shape

Options:

- REST `POST /runs` that waits for settlement and returns the final snapshot;
- WebSocket command that streams events and then emits a final full snapshot;
- REST run submission plus optional WebSocket or SSE event subscription.

Best current guess: use REST-style send-and-settle as the canonical automation
operation, with WebSocket kept for browser/live streaming. This gives external
agents a simple, testable contract while preserving UI responsiveness.

### 2. Session Lifecycle

Options:

- keep the current behavior where WebSocket connect auto-creates a session;
- keep an unpersisted connection/client draft until the first prompt;
- make a REST create-and-first-run operation the canonical materialization
  path, then let WebSocket attach to the created session for streaming.

Best current guess: canonicalize first-turn materialization. Browser and
automation clients may prepare configuration before sending, but the persisted
session and final `sessionId` are created only with the first submitted user
message. Automation should not depend on connect side effects.

### 3. Run Concurrency

Options:

- reject a new run while the session is already running;
- queue the new prompt as Pi `followUp`;
- treat a concurrent prompt as a steer/interruption;
- create a branch/session boundary for parallel probes.

Best current guess: reject by default unless the request explicitly asks for
`followUp` or `steer`. This is easiest to reason about for research evidence.

### 4. Final Transcript Source

Options:

- return the transcript parsed from persisted Pi JSONL after completion;
- return an in-memory event buffer captured during the run;
- maintain a new canonical Alt Theory event/transcript store.

Best current guess: first pass should parse the persisted session detail using
the same server-side transcript parser used by REST. A later cleanup can unify
live and persisted transcript rendering, but the automation API should not wait
for a new event-store architecture.

### 5. API Auth Boundary

Options:

- local-only localhost API with no auth;
- local token or launch-secret for researcher automation;
- production-style auth and participant separation.

Best current guess: v0.4 researcher automation can stay localhost/local-token
or no-auth depending on deployment, but the API shape must not assume public
participant access. Participant-facing auth is a separate platform design.

### 6. Project And Resume Coupling

Options:

- let project defaults influence only new sessions;
- allow project defaults as automatic fallback when old session assets are
  missing;
- allow project defaults to overwrite old-session config.

Best current guess: project defaults apply to new sessions; old-session resume
uses the resolvable original configuration first, then the selected project
default, then the app/backend default, and finally no optional layer. Fallback
warns and is recorded but does not block resume or create a new session.
Project assignment after creation should be grouping metadata.

### Minimal Operations

The first pass should support:

- `GET /api/config/options`
  - role presets, souls, KB domains, prompt modes, resource-discovery modes,
    skill options, projects when implemented.
- `POST /api/sessions`
  - atomically create a session from explicit project/config plus the required
    first user message, wait for completion, and return the created session/run
    snapshot. A persisted zero-turn result is not valid.
- `POST /api/sessions/:sessionId/open`
  - open/resume an existing session with manifest-first fallback semantics.
- `POST /api/sessions/:sessionId/runs`
  - send one user message and wait for completion.
- a latest-turn revision operation
  - revise/regenerate the active tail while preserving the current logical
    branch.
- an explicit fork operation
  - create a new logical branch from a caller-selected entry only when the
    caller explicitly requests a fork;
  - accept a fork purpose/workspace mode:
    `collaboration/shared` or `comparison/copied`.
- `POST /api/sessions/:sessionId/abort`
  - abort active run.
- `GET /api/sessions/:sessionId`
  - read manifest, transcript, metrics, events, and warnings.
- `GET/PUT /api/sessions/:sessionId/files/...`
  - keep the current records/workspace text-file API.
- `DELETE /api/sessions/:sessionId`
  - soft delete.
- `POST /api/sessions/:sessionId/restore`
  - restore soft-deleted session.

If streaming is needed for agents, add a stream endpoint or keep the existing
WebSocket as an event subscription layer. The run-submission operation should
still have a clean completion contract.

### Run Result Shape

A completed run should return or make immediately available:

```json
{
  "sessionId": "...",
  "branchId": "...",
  "status": "completed",
  "runId": "...",
  "turnCount": 3,
  "messageCount": 6,
  "manifest": {},
  "metrics": {},
  "transcript": [],
  "events": [],
  "warnings": []
}
```

Latest-turn revision and explicit fork must remain distinct in the API and
persisted data:

- revising the latest turn keeps the same `sessionId` and logical `branchId`;
- an explicit fork creates a new `branchId` and records its parent branch and
  fork-point entry;
- collaboration forks continue using the shared workspace;
- comparison forks recursively copy the small fork-point workspace into a
  branch-local workspace and isolate later branch writes;
- superseded latest-turn versions remain available as revision/provenance
  evidence but do not appear in the ordinary active transcript;
- configuration changes do not create a branch.

Pi's native session tree and fork files can implement these operations, but
they should not define the Alt Theory product-level identity model by accident.
Current workspaces are expected to remain small, so v0.4 does not need
copy-on-write or deduplicated snapshot infrastructure.
The concrete directory layout and API fields are part of the downstream
research-data contract and require researcher review before implementation.

For failures and interruptions, distinguish:

- `completed`;
- `failed`;
- `interrupted`;
- `aborted`.

Do not report ordinary user abort/interruption as a failed research run unless
the underlying model/runtime actually failed.

## Recommended Implementation Direction

### R1 - Stabilize Current WS/REST As An Automation Client

Create a small local client/helper around today's protocol:

- connect;
- wait for `session_opened`;
- optionally `open_session`;
- send prompt;
- wait for `run_completed`/`run_failed`;
- fetch final detail;
- expose a single `sendAndRead()` helper.

This is useful for immediate agent UAT and proves the workflow with little app
change, but it should be treated as a compatibility adapter, not the final API.

### R2 - Add Request-Scoped First-Turn Materialization

Add first-class session creation with explicit config and a required first user
message. This is the main missing backend primitive for project-based v0.4 and
prevents empty sessions from being created before the researcher finishes the
launch selections.

This should implement the agreed direction:

- project defaults;
- explicit session overrides;
- first-turn ID generation from date-time, role, soul, and model;
- manifest snapshot at creation;
- no silent mutation of old sessions.

### R3 - Add Run Submission With Final Snapshot

Add a non-browser "send one prompt and wait" route or API method. Internally it
can call the same `session.prompt()` primitive and reuse the same transcript
parser and metrics writer.

This is the point where external agents stop needing to imitate the browser.

### R4 - Add Project, Soft Delete, And Filters

Once project data exists, add:

- project list/read/write;
- session list filters by project, run label, test batch, status;
- soft delete/restore.

## Non-Recommended Direction

Do not build agent automation by scraping the browser or relying on DOM state.

Do not create a separate agent-only harness with its own transcript parser,
manifest semantics, or config resolution. That would repeat the v0.3 problem
where live rendering and persisted transcript handling diverged.

Do not make project defaults overwrite a resolvable old-session configuration.
Use manifest-first resume with automatic warned fallback and continue the same
session.

## Confidence

Confidence is medium-high for feasibility and first-pass direction because:

- the existing smoke script already drives live sessions by WebSocket;
- backend tests cover the relevant REST/WS session operations;
- Pi SDK exposes `prompt()` as a run-settlement primitive;
- current code structure already separates session store, metrics, events, and
  WebSocket protocol enough to expose a cleaner API.

Confidence is lower for final endpoint naming and project schema because the
v0.4 project/config model is not implemented yet.

## Source Pointers

- `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/websocket-protocol.ts`
- `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/server.ts`
- `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/session-store.ts`
- `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/smoke-backend.ts`
- `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/backend-server.test.ts`
- `%LLM_THEO_DEV_ROOT%/project/architecture/researcher-console.md`
- `%LLM_THEO_DEV_ROOT%/project/architecture/core-session-engine.md`
- `%LLM_THEO_DEV_ROOT%/project/brainstorms/2026-06-14-brainstorm-research-console-v0-4-workbench.md`
- `%LLM_THEO_DEV_ROOT%/project/compound/research-agent-harness/pi-sim-user-architecture-research.md`
- `%LLM_THEO_DEV_ROOT%/node_modules/@mariozechner/pi-coding-agent/docs/sdk.md`
- `%LLM_THEO_DEV_ROOT%/node_modules/@mariozechner/pi-agent-core/README.md`
