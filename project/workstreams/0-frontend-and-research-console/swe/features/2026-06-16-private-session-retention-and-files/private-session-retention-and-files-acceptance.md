---
doc_type: feature-acceptance
feature: 2026-06-16-private-session-retention-and-files
status: accepted
summary: Accepted backend foundation for private session visibility, inactive retention cleanup, owner-only private content access, and participant workspace file download/delete.
swe_plan: research-console-v0-5
swe_plan_item: private-session-retention-and-files
created: 2026-06-16
tags: [v0-5, privacy, retention, participant-files]
---

# Private Session Retention And Files Acceptance

## Scope Accepted

Accepted backend/API foundation for:

- private draft visibility over WebSocket before first prompt;
- private session metadata in `records/session.json`;
- `lastActivityAt + 7 days` retention calculation;
- private activity refresh on meaningful prompt;
- explicit expired-private cleanup with a minimal tombstone;
- owner-only private detail/file access;
- workspace-only download/delete routes for owner-visible files.

No participant shell UI, background scheduler, encryption, or broad file
manager was added.

## Evidence

- `npm run test:backend` passed with 53 tests.
- Checklist steps are all `done`.
- Checklist acceptance checks are all `passed`.
- `project/architecture/core-session-engine.md` was updated for current code.

## Key Behaviors Verified

- Participant WebSocket can switch draft visibility to `private` before first
  prompt and materialize a private owned session.
- Private session creation forces `consentSnapshot.privateOverride=true` and
  writes a retention due timestamp.
- Prompt activity refreshes private `lastActivityAt` and `retentionDueAt`.
- Detail reads do not refresh private activity.
- Researcher accounts can see private session summaries but cannot read private
  detail/transcript/file content through normal REST routes.
- Participant owner can read private detail and download/delete own workspace
  text files.
- Workspace path traversal is rejected.
- Expired private cleanup deletes history/workspace/branch workspace and
  non-tombstone records, while public/research sessions are not deleted.

## Plan Writeback

`private-session-retention-and-files` is marked done in:

- `project/workstreams/0-frontend-and-research-console/notes-and-status/2026-06-16-research-console-v0-5-swe-plan-items.yaml`
- `project/workstreams/0-frontend-and-research-console/notes-and-status/2026-06-16-research-console-v0-5-swe-plan.md`
