# WebSocket Resume Open Protocol Acceptance Report

> Stage: Stage 3 (Acceptance)
> Acceptance date: 2026-06-08
> Associated design doc: `websocket-resume-open-protocol-design.md`

## 1. Interface Contract Verification

- [x] `ClientMessage` supports `{ type: "open_session", payload: { sessionId } }`.
- [x] `SessionSnapshot` carries optional `openedFrom` and `resumeWarnings`.
- [x] `SessionEventType` includes existing-session open/resume/warning events.

## 2. Behavior And Decision Verification

`open_session` validates the target session, opens the existing Pi JSONL through
`openAltTheorySession()`, then replaces only the current WebSocket connection's
state. Failure sends an error and keeps the previous live state.

## 3. Acceptance Scenario Verification

`npm run test:backend` covered:

- successful `open_session` sends `session_opened`, `session_metadata`, and
  `session_metrics`;
- snapshot and metadata point to the existing session ID;
- opening does not create another session root;
- `session_opened_existing` and `session_resumed` events are appended;
- missing session returns WebSocket error and current metadata still points to
  the previous session;
- no browser UI, export, tags, annotations, comparison, or live prompt behavior
  was added.

## 4. Terminology Consistency

`open_session` is now the WebSocket command. Session-list UI remains the
separate `researcher-console-session-browser` child feature.

## 5. Architecture Merge

`project/architecture/core-session-engine.md` now records REST session
catalog/detail, WebSocket `open_session`, `resume-manifest.json`, and resume
events as current backend behavior.

## 6. Requirement Writeback

No separate requirement record.

## 7. SWE-Plan Writeback

`websocket-resume-open-protocol` is marked done in the
`session-list-resume-open` items YAML, and the main SWE-plan points to this
feature artifact.

## 8. Attention Candidate Review

No new attention candidate.

## 9. Leftovers

- Browser session list/detail/resume controls remain in the next child feature.
- Live provider prompt verification remains deferred to user or external-agent
  smoke after the browser loop exists.

