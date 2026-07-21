---
doc_type: feature-acceptance
feature: 2026-06-14-project-config-and-live-switching
status: accepted
accepted: 2026-06-14
summary: Verified optional project records, effective config events, automatic resume fallback records, and same-session KB/role/soul switching.
tags:
  - research-console
  - v0-4
  - config-events
  - live-switching
---

# project-config-and-live-switching Acceptance Report

> Stage: Stage 3 (Acceptance)
> Acceptance date: 2026-06-14
> Associated design doc: `project-config-and-live-switching-design.md`

## 1. Interface Contract Verification

- `ResearchProject` landed in `alt-theory-app/web-server/projects.ts` with simple local JSON list/upsert behavior.
- `EffectiveSessionConfig` and `ConfigEvent` landed in `alt-theory-app/web-server/config-events.ts`.
- `records/config-events.jsonl` is append-only JSONL and stores full effective snapshots.
- `SessionService.replaceSession()` now rebuilds role/soul runtime against the same session ID/history when history exists.
- Session detail now returns `effectiveConfig` and `configEvents`.

## 2. Behavior and Decision Verification

- First materialization appends `creation`.
- KB change appends `user_change` without creating a new session.
- Role and soul changes after history append `user_change` and keep session ID, workspace, and history path.
- Resume with missing original role/soul falls back automatically and appends `resume_fallback`.
- Busy prompt state rejects KB/role/soul changes with `session_busy`.
- Project routes are optional REST surface only; no project setup burden or frontend project UI was added.

Non-goals held: no fallback confirmation, model selector UI, custom instruction loader, skill picker, branch/revision/fork, or empty-session toggle.

## 3. Acceptance Scenario Verification

- First-send materialized session has a `creation` config event.
  Evidence: `SessionService creates managed sessions with v0.4 foundation records`.
- KB switch after materialization keeps same session and appends `user_change`.
  Evidence: `SessionService rejects concurrent same-session prompt mutations with session_busy` covers busy rejection; `setKbDomain()` appends config event and preserves session ID by construction.
- Role switch after history keeps same session ID/root and appends `user_change`.
  Evidence: `SessionService switches role and soul inside the same materialized session`.
- Soul switch after history keeps same session ID/root and appends `user_change`.
  Evidence: same test.
- Open existing session with missing original role/soul falls back automatically.
  Evidence: `SessionService records resume_fallback config event when original assets are missing`.
- Session detail returns config history/current effective config.
  Evidence: same-session switching test asserts `detail.effectiveConfig` and `detail.configEvents`.
- Project list/upsert works.
  Evidence: `REST discovery and WebSocket sessions are connection-local` covers `GET /api/projects` and `PUT /api/projects/:projectId`.
- Browser visual verification: intentionally deferred. The user prefers one unified frontend UAT after this feature and before workbench implementation to avoid redundant test rounds.

## 4. Terminology Consistency

- `effectiveConfig`, `configEvents`, `resume_fallback`, and `user_change` are consistent across design, code, tests, and architecture docs.
- No new terminology outside the design was introduced.

## 5. Architecture Merge

- `project/architecture/core-session-engine.md` updated with config events, project records, same-session KB/role/soul switching, and resume-fallback behavior.
- `project/architecture/researcher-console.md` updated with current frontend semantics and the fact that project records exist at backend/API level only.

## 6. Requirement Writeback

No separate requirement file exists for this child feature. The accepted capability is represented in the v0.4 SWE plan and current architecture docs.

## 7. swe-plan Writeback

- `2026-06-14-research-console-v0-4-swe-plan-items.yaml`: `project-config-and-live-switching` marked `done`.
- `2026-06-14-research-console-v0-4-swe-plan.md`: child feature section updated with accepted implementation summary.

## 8. attention.md Candidate Review

No new attention.md candidate. The known browser/UAT staging rule is already represented by the unified Opencode UAT prompt.

## 9. Leftovers

- Model selector UI remains deferred.
- Custom instruction text assets remain deferred to `text-instructions-and-runtime-skills`.
- Skill picker/invocation remains deferred to `text-instructions-and-runtime-skills`.
- Visual UAT should run once after this feature, using the unified Opencode prompt.
