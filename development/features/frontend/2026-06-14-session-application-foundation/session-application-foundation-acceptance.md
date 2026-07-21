# session-application-foundation Acceptance Report

> Stage: Stage 3 (Acceptance)
> Acceptance date: 2026-06-14
> Associated design doc: project/workstreams/0-frontend-and-research-console/swe/features/2026-06-14-session-application-foundation/session-application-foundation-design.md

## 1. Interface Contract Verification

Interface examples:

- [x] `SessionService` (`alt-theory-app/web-server/session-service.ts`): create/open/replace/run/abort/attach operations exist and are used by the WebSocket adapter.
- [x] `ManagedSession`: service-owned state replaces the removed WebSocket-local `ConnectionState`.
- [x] `RunHandle`: `runPrompt()` returns IDs, completion, and abort.
- [x] Versioned records (`alt-theory-app/web-server/session-records.ts`): new managed sessions write `session.json` and `branch-index.json`.
- [x] Legacy projection (`alt-theory-app/web-server/session-store.ts`): session summaries expose `recordModel: "v0.4" | "legacy-v0.3"`.

Flow diagram verification:

- [x] WebSocket adapter delegates to `SessionService`.
- [x] Service owns mutation guard, Pi runtime, v0.4 records, and session-store projection.
- [x] Pi JSONL remains the conversation evidence.

## 2. Behavior and Decision Verification

Requirement summary:

- [x] WebSocket create/open/run/abort/config-like replacement delegates to service.
- [x] Accepted runs use the internal `RunHandle` shape.
- [x] Same-session concurrent prompt returns stable `session_busy`.
- [x] WebSocket close detaches only through service listener unsubscribe.
- [x] v0.4 foundation records are schema-versioned.
- [x] Branch-aware path helpers exist for main and future branches.
- [x] Legacy sessions remain listable/openable without fabricated trajectory IDs.

Non-goal reverse-check:

- [x] No draft-first-send behavior or readable ID allocator implemented.
- [x] No project defaults, config events, custom instruction, summary skill, revision, or fork API implemented.
- [x] No database, external queue, lock service, or framework added.
- [x] No workbench/frontend redesign.

Key decisions landed:

- [x] One pragmatic service module, not multiple service tiers.
- [x] Existing WebSocket protocol preserved except optional structured error code on `error`.
- [x] New records are thin indexes; transcript bodies remain in Pi JSONL.
- [x] v0.3 roots are legacy projection only.

Mount point verification:

- [x] `server.ts`: WebSocket lifecycle now uses `SessionService`.
- [x] `session-store.ts`: exposes v0.4/legacy projection and branch-index active file lookup.
- [x] `session-records.ts`: versioned record and branch path helper module added.
- [x] `websocket-protocol.ts`: `error.payload.code` added for `session_busy`.

## 3. Acceptance Scenario Verification

- [x] WebSocket connect/open/prompt/new-session behavior works through service delegation.
  - Evidence: existing backend WebSocket tests pass.
- [x] WebSocket close detaches only; explicit abort remains cancellation.
  - Evidence: `SessionService detach removes listeners without disposing the managed session`.
- [x] Concurrent same-session mutation returns `session_busy`.
  - Evidence: `SessionService rejects concurrent same-session prompt mutations with session_busy`.
- [x] New managed sessions write schemaVersion 1 `session.json` and `branch-index.json`.
  - Evidence: `SessionService creates managed sessions with v0.4 foundation records`.
- [x] Main branch path helpers expose shared workspace and active Pi file.
  - Evidence: branch-index assertions in service test.
- [x] Legacy v0.3 sessions remain listable/openable and are marked legacy.
  - Evidence: `session store marks sessions without v0.4 records as legacy projection`.

No frontend visual verification required; protocol shape is unchanged except optional error code.

## 4. Terminology Consistency

- `SessionService`: new code and design agree.
- `ManagedSession`: internal concept only, not exposed as API.
- `RunHandle`: internal shape in service.
- `session_busy`: stable error code in service and WebSocket protocol.
- `legacy-v0.3`: read-side projection only; no fake trajectory IDs.

## 5. Architecture Merge

Architecture docs updated:

- [x] `project/architecture/core-session-engine.md`: session ownership changed from connection-owned state to `SessionService`; close/abort semantics, mutation guard, v0.4 foundation records, and legacy projection documented.
- [x] `project/architecture/researcher-console.md`: browser attachment semantics and `session_busy` error noted.

Archive added:

- [x] `project/architecture/archive/2026-06-14-pre-session-service-foundation/`: pre-change architecture snapshots preserved before current docs were updated.

## 6. Requirement Writeback

No requirement writeback. This is foundation architecture work from the v0.4 SWE plan, not a standalone user-facing capability.

## 7. swe-plan Writeback

- [x] `swe_plan` and `swe_plan_item` present.
- [x] `2026-06-14-research-console-v0-4-swe-plan-items.yaml` updated from `in-progress` to `done`.
- [x] Main SWE plan child feature section updated with status/evidence note.
- [x] YAML validation passed.

## 8. attention.md Candidate Review

No attention.md addition. The implementation did not expose a reusable environment rule beyond existing `npm run test:backend`.

## 9. Leftovers

Follow-up optimization points:

- `server.ts` still owns REST route registration and WebSocket setup in one file. This is a later refactor candidate after v0.4 lifecycle stabilizes.

Known limitations:

- Connect still creates a session immediately; this is intentionally left for `draft-first-send-session-creation`.
- Role/soul replacement still creates a new session after history exists; this is intentionally left for `project-config-and-live-switching`.
- Branch-index currently records only `main`; revision/fork operations remain future features.

Implementation side discoveries:

- v0.4 current architecture docs should be updated when accepted structure changes, but pre-change architecture snapshots should be archived when the old form is still useful for comparison.
