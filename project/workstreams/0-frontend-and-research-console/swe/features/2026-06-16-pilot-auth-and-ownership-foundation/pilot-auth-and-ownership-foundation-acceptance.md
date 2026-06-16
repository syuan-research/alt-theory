# Pilot Auth And Ownership Foundation Acceptance Report

> Stage: Stage 3 (Acceptance)
> Acceptance date: 2026-06-16
> Associated design doc: `project/workstreams/0-frontend-and-research-console/swe/features/2026-06-16-pilot-auth-and-ownership-foundation/pilot-auth-and-ownership-foundation-design.md`

## 1. Interface Contract Verification

- [x] Account store landed in `alt-theory-app/web-server/auth-accounts.ts`: file-backed `{dataDir}/accounts/accounts.json`, `scrypt-v1` login-code hashes, account lookup/authentication, and safe account serialization match design section 2.1.
- [x] Auth identity landed in `alt-theory-app/web-server/auth-session.ts`: HttpOnly cookie token helpers and `AuthContext` resolver match the planned anonymous/account context shape.
- [x] Session header extensions landed in `alt-theory-app/web-server/session-records.ts`: `ownerAccountId`, `roleCondition`, `visibility`, `consentSnapshot`, `lastActivityAt`, and `retentionDueAt` are compatible optional fields on `V4SessionHeader`.
- [x] Role condition mapping landed in `alt-theory-app/web-server/server.ts`: built-in mappings cover `conceptual-theory` and `metatheory-oriented`; condition id may also be a direct role preset slug; missing preset fails clearly.
- [x] Flow diagram landing points exist: browser auth routes -> account store/session cookie; WebSocket connection -> auth context; first send -> `SessionService.createSession(selectors, metadata)`; REST catalog/detail -> auth-aware filters.

## 2. Behavior and Decision Verification

- [x] Data-dir accounts are used; no participant identities or login codes are hardcoded in source.
- [x] Login code storage is hashed; route responses use safe account data and do not include `loginCodeHash`.
- [x] Browser auth uses an HttpOnly cookie with process-local server tokens.
- [x] REST and WebSocket both resolve app identity.
- [x] Participant sessions persist owner, role condition, visibility, consent snapshot, and activity/retention fields.
- [x] Participant draft defaults use account `defaultRoleCondition` mapped to a role preset slug.
- [x] Researcher/admin access preserves ownerless researcher workbench sessions.
- [x] Explicit non-goals confirmed by grep/review: no self-registration route/UI, no global admin UI, no private retention cleanup, no role-preset content authoring, no project dependency for participant condition.
- [x] Mount points match design: `auth-accounts.ts`, `auth-session.ts`, `server.ts`, `session-records.ts`, `session-service.ts`, `session-store.ts`, backend tests, and checklist/plan docs.

## 3. Acceptance Scenario Verification

- [x] S1 valid participant code logs in and `/api/auth/me` returns safe identity: covered by `auth routes support cookie round trip without leaking account secrets`.
- [x] S2 wrong code returns generic unauthorized response: same test covers 401 without account-existence disclosure.
- [x] S3 disabled account cannot log in: same test covers 403 disabled account.
- [x] S4 participant first send creates owner/roleCondition/consent metadata: covered by `WebSocket participant first send creates an owned role-conditioned session`.
- [x] S5 participant catalog lists only own sessions: covered by `session REST routes filter participant access and preserve researcher access`.
- [x] S6 participant detail for another participant does not return detail content: same REST filtering test covers 404.
- [x] S7 researcher/admin can see ownerless researcher sessions: same REST filtering test covers researcher access to ownerless session.
- [x] S8 participant WebSocket draft applies role condition default: WebSocket test verifies `role-conceptual-theory-companion`.
- [x] Frontend visual verification: not applicable; this feature is backend foundation only.

## 4. Terminology Consistency

- `account`, `AuthContext`, `ownerAccountId`, `roleCondition`, `visibility`, and `consentSnapshot` are used consistently in code and architecture.
- `profile` remains only as legacy compatibility alias for existing role-preset routes/protocol.
- `projectId` remains separate from role condition.

## 5. Architecture Merge

- [x] `project/architecture/core-session-engine.md` updated with account/auth terminology, auth modules, auth-aware REST/WebSocket flow, session owner metadata, role-condition mapping, and current constraints.
- [x] `project/architecture/researcher-console.md` not updated now: this feature has no frontend shell/view-mode implementation. That doc should be updated when `participant-view-shell` lands.

## 6. Requirement Writeback

- [x] No standalone requirement file was referenced in the feature design. This capability is tracked by the v0.5 SWE plan and plan record, so no separate requirement writeback was performed.

## 7. swe-plan Writeback

- [x] `2026-06-16-research-console-v0-5-swe-plan-items.yaml` updated: `pilot-auth-and-ownership-foundation` is `done`.
- [x] `2026-06-16-research-console-v0-5-swe-plan.md` updated with the child feature status line.
- [x] Checklist implementation steps are `done`; acceptance checks are `passed`.

## 8. attention.md Candidate Review

- Candidate: linked-worktree Git operations should keep using escalated Git to avoid sandbox `index.lock`/object write failures. This is already documented in tree-local `AGENTS.md`; no new attention file needed from this feature.
- Candidate: this worktree needed `npm ci` before tests because dependencies are per-worktree. This is normal local setup, not a reusable project rule.

## 9. Leftovers

- Private-session retention, private hard deletion, and participant workspace download/delete remain for `private-session-retention-and-files`.
- Participant/researcher/debug UI gating remains for `participant-view-shell`.
- Account/session browser tokens are process-local; server restart requires login again. This is acceptable for v0.5.0 pilot foundation.
- Account management is file/script based; no admin UI was added.
