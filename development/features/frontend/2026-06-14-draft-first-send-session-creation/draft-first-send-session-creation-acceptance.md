---
doc_type: feature-acceptance
feature: 2026-06-14-draft-first-send-session-creation
status: accepted
accepted: 2026-06-14
summary: Verified draft-first-send lifecycle, readable session IDs, draft-aware frontend state, and catalog suppression for v0.4 zero-turn roots.
tags:
  - research-console
  - v0-4
  - draft-session
  - readable-session-id
---

# draft-first-send-session-creation Acceptance Report

> Stage: Stage 3 (Acceptance)
> Acceptance date: 2026-06-14
> Associated design doc: `draft-first-send-session-creation-design.md`

## 1. Interface Contract Verification

- `SessionDraftSnapshot` landed in `alt-theory-app/web-server/websocket-protocol.ts` with `status: "draft"`, current KB, role preset/profile compatibility, and soul.
- `ServerMessage` now includes `session_draft`.
- `allocateReadableSessionId()` landed in `alt-theory-app/core/data-dir.ts`; tests cover metadata normalization, absent values, collision suffixing, and path-guard-compatible output.
- `SessionService.createSession()` now allocates readable IDs before calling `createSessionDirs()`.
- Flow diagram match: WebSocket connect sends draft; selector changes mutate draft; first prompt creates and attaches a service-owned session; existing `open_session` still bypasses draft and opens history.

## 2. Behavior and Decision Verification

- Connect-time persistence removed from `server.ts`; no `SessionService.createSession()` call runs on WebSocket connect.
- `new_session` now returns the connection to draft state and does not create a replacement zero-turn session.
- KB, soul, and role-preset changes before first prompt update only draft selectors.
- After materialization, soul and role-preset switches still use the existing replacement path; live same-session config switching remains correctly deferred to the next feature.
- The normal catalog hides v0.4 roots with no Pi session file, no metrics, and no durable run event. Legacy incomplete roots remain visible.
- Non-goals checked: no project defaults, model selector UI, revision/fork, trash, soft-delete, or custom instruction behavior was added.

## 3. Acceptance Scenario Verification

- Opening and closing WebSocket without prompt leaves no session directory.
  Evidence: `REST discovery and WebSocket sessions are connection-local` asserts two draft connections and no `sessions/` root.
- First prompt creates a readable-ID session directory from role/soul/model.
  Evidence: `SessionService creates managed sessions with v0.4 foundation records` asserts the readable ID pattern and v0.4 records. `server.ts` prompt handler calls the same service creation path before `runPrompt()`.
- First prompt sends normal `session_opened`, metadata, metrics, and run events.
  Evidence: code path in `attachToSession()` is called immediately after draft materialization and sends the existing triplet. Existing session-open tests verify the triplet for attached sessions.
- KB/role/soul changed before first prompt affect the materialized session.
  Evidence: WebSocket draft tests assert selector changes remain connection-local; first materialization consumes the same `draftSelectors` object passed to `SessionService.createSession()`.
- Existing `open_session` still opens a historical session.
  Evidence: `WebSocket open_session replaces current state with an existing session`.
- Zero-turn v0.4 roots are excluded from normal catalog.
  Evidence: `session catalog and detail expose complete and incomplete sessions` adds a v0.4 empty root and asserts it is absent from summaries.
- Browser visual verification: not run. No Playwright/Puppeteer dependency is present in this repo. The frontend state-machine code was updated and backend protocol tests passed; a manual/browser UAT remains a follow-up risk for layout and perceived status text.

## 4. Terminology Consistency

- `session_draft`: protocol, server adapter, frontend handler, and architecture docs use the same term.
- `Readable session ID`: allocator and architecture docs use the accepted format.
- `draft-first-send`: feature artifacts and architecture docs describe the same lifecycle.
- No new product terms beyond the design were introduced.

## 5. Architecture Merge

- `project/architecture/core-session-engine.md` updated:
  - session terminology now distinguishes draft and materialized session;
  - session creation now starts with `session_draft` and first prompt materialization;
  - `SessionService` behavior documents draft, first prompt attach, and draft-returning `new_session`;
  - WebSocket protocol and catalog suppression are documented.
- `project/architecture/researcher-console.md` updated:
  - browser flow now starts in draft;
  - first prompt materializes a session;
  - records/paths/metrics remain unavailable while draft.

## 6. Requirement Writeback

No separate requirement file exists for this child feature. The accepted capability is represented in the v0.4 SWE plan and current architecture docs.

## 7. swe-plan Writeback

- `2026-06-14-research-console-v0-4-swe-plan-items.yaml`: `draft-first-send-session-creation` marked `done`.
- `2026-06-14-research-console-v0-4-swe-plan.md`: child feature section updated with accepted implementation summary.

## 8. attention.md Candidate Review

Candidate: browser-visible frontend changes in this repo currently lack an installed automated browser verification tool. This is already a known project issue from prior frontend/UAT records, so no new attention entry is needed from this feature alone.

## 9. Leftovers

- Browser UAT remains needed for visual/status polish.
- First-prompt materialization is implemented through WebSocket and `SessionService`; the later automation API should expose the same semantics through a shared operation rather than duplicating the adapter logic.
- Live same-session role/soul/config switching is intentionally still pending for `project-config-and-live-switching`.
