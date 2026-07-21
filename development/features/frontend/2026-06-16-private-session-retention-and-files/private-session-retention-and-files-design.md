---
doc_type: feature-design
feature: 2026-06-16-private-session-retention-and-files
status: approved
summary: Add backend support for private session visibility, seven inactive day retention, cleanup, and participant-safe workspace file download/delete.
swe_plan: research-console-v0-5
swe_plan_item: private-session-retention-and-files
swe_plan_path: project/workstreams/0-frontend-and-research-console/notes-and-status/2026-06-16-research-console-v0-5-swe-plan.md
swe_plan_items_path: project/workstreams/0-frontend-and-research-console/notes-and-status/2026-06-16-research-console-v0-5-swe-plan-items.yaml
tags: [v0-5, privacy, retention, participant-files]
---

# Private Session Retention And Files Design

## 0. Terminology

- **Private session**: a session with `visibility="private"` in
  `records/session.json`. It is visible to its owner but excluded from normal
  researcher/admin detail/file access.
- **Inactive retention**: private sessions are due for hard deletion at
  `lastActivityAt + 7 days`. Page load does not update activity.
- **Hard deletion**: remove transcript/history/workspace evidence and leave
  only a minimal tombstone for audit/recovery consistency.
- **Participant file access**: participant-safe workspace file download/delete
  for the owner's own session. This is not arbitrary filesystem browsing.

## 1. Decisions and Constraints

Requirement summary: implement the backend foundation that lets a participant
start a private session, keeps retention metadata current on meaningful
activity, prevents researcher/admin normal APIs from reading private content,
and lets the owner download/delete workspace text files before expiry.

Complexity tier: local file-backed data-dir implementation. No scheduler,
queue, encryption, admin UI, or frontend participant shell polish in this
feature.

Key decisions:

- Private mode is session-level, not account-level.
- Private mode is not end-to-end encryption; it is API/export exclusion plus
  deletion.
- Retention is calculated from `lastActivityAt`, not creation time.
- The first implementation exposes private selection through WebSocket
  protocol so the later participant shell can call it.
- Cleanup is an explicit backend operation/function and optional REST endpoint;
  no always-on background daemon in v0.5.0.
- Participant file deletion/download is constrained to the session workspace.
- Researcher/admin can still list private session summaries where useful for
  operations, but normal detail/file access must not return private content.

Explicit non-goals:

- no encryption claim;
- no background scheduler;
- no participant shell UI in this feature;
- no full export/debrief privacy policy;
- no deleting public sessions by retention;
- no arbitrary path/file management.

## 2. Nouns and Orchestration

### 2.1 Noun Layer

#### Session Visibility

Existing `V4SessionHeader` already has `visibility`, `lastActivityAt`, and
`retentionDueAt`.

Change:

- private draft/session selection writes `visibility="private"`;
- `consentSnapshot.privateOverride` becomes `true`;
- `retentionDueAt = lastActivityAt + 7 days`;
- public/research sessions keep `retentionDueAt=null`.

#### Retention Cleanup

Add a focused module, likely `session-retention.ts`, with:

```ts
calculateRetentionDueAt(lastActivityAt: string): string
refreshRetention(session: V4SessionHeader, now: Date): V4SessionHeader
hardDeleteExpiredPrivateSessions(dataDir: string, now?: Date): CleanupResult
```

Hard deletion removes history/workspace/branch workspace content and leaves a
minimal tombstone. It must not keep Pi JSONL transcript or workspace files.

#### Participant Workspace Files

Extend `session-store.ts` / `server.ts` file APIs:

- `GET /api/sessions/{sessionId}/files/download?root=workspace&path=...`
- `DELETE /api/sessions/{sessionId}/files/content`

Rules:

- participant can download/delete only own workspace files;
- researcher/admin can use researcher file routes for non-private sessions;
- private session files are not readable by researcher/admin through normal
  routes;
- file paths must resolve inside the selected root;
- directories and oversized/non-text files remain out of scope.

### 2.2 Orchestration Layer

```mermaid
sequenceDiagram
  participant Browser
  participant WS
  participant SessionService
  participant Records
  participant Cleanup

  Browser->>WS: switch_visibility(private) before first prompt
  Browser->>WS: prompt
  WS->>SessionService: createSession(selectors, metadata visibility=private)
  SessionService->>Records: session.json private + retentionDueAt
  Browser->>WS: later prompt
  SessionService->>Records: update lastActivityAt + retentionDueAt
  Cleanup->>Records: scan private sessions due before now
  Cleanup->>Records: remove history/workspace; write tombstone
```

Flow constraints:

- private selection in draft must not allocate a session root;
- page load/open_session does not refresh `lastActivityAt`;
- meaningful prompts update activity for private sessions;
- researcher/admin normal detail/file routes reject private content;
- cleanup is idempotent;
- cleanup never deletes public/research sessions.

### 2.3 Mount Point List

- `websocket-protocol.ts`: add visibility switch message and draft field if
  needed.
- `server.ts`: track draft visibility, pass creation metadata, enforce private
  content access, add file download/delete and cleanup endpoint if used.
- `session-service.ts`: update private activity metadata on meaningful runs and
  expose session visibility update helper if needed.
- `session-records.ts`: helper for retention field updates.
- `session-store.ts`: file download/delete helpers and private summary/detail
  projection behavior.
- `session-retention.ts`: retention calculation and cleanup.
- Backend tests.

### 2.4 Push Strategy

1. Retention helpers: calculate due time, refresh private activity, and
   hard-delete expired private sessions with tombstone.
2. Visibility protocol and creation: WebSocket draft private selection creates
   private owned sessions with `privateOverride=true` and retention due date.
3. Activity refresh: meaningful prompt activity updates private
   `lastActivityAt` and `retentionDueAt`; open/page-load paths do not.
4. Private access filtering: owner can access private detail/files; researcher
   and admin normal detail/file routes cannot read private content.
5. Participant workspace file download/delete: add constrained download/delete
   routes with owner filtering.

## 3. Acceptance Contract

Key scenarios:

1. Private session created from participant draft records `visibility=private`,
   `privateOverride=true`, and `retentionDueAt=lastActivityAt+7 days`.
2. A later meaningful prompt refreshes private `lastActivityAt` and
   `retentionDueAt`.
3. `open_session` / detail read does not refresh private activity.
4. Participant owner can read their own private detail and workspace files.
5. Researcher/admin normal detail/file routes cannot read private transcript or
   workspace content.
6. Cleanup hard-deletes expired private transcript/history/workspace evidence
   and leaves only a minimal tombstone.
7. Cleanup does not delete public/research sessions.
8. Participant can download and delete own workspace text files with path
   traversal rejected.

Reverse checks:

- no encryption claim;
- no background scheduler;
- no participant shell UI;
- no private retention for public sessions;
- no broad file manager.

## 4. Architecture Relationship

Acceptance must update `project/architecture/core-session-engine.md` with:

- private visibility and retention metadata semantics;
- cleanup/tombstone behavior;
- private access constraints on session detail/file routes;
- participant workspace download/delete route constraints.

`researcher-console.md` should wait for `participant-view-shell` unless this
feature touches frontend UI.
