---
doc_type: issue-fix-note
issue: 2026-06-17-conversation-action-resume-leaf
status: fixed
severity: P1
root_cause_type: state-pollution
tags: [v0-5, backend, resume, lineage, visibility]
---

# Conversation Action Resume Leaf Fix Note

## Observed

After opening an existing session through `open_session`, latest-turn actions
could fail with:

```text
Only the active branch latest user turn can be revised/deleted
```

The same family of state mismatch also made explicit fork behavior fragile, and
materialized sessions could not switch between `research` and `private`
visibility.

## Root Cause

Alt Theory stores the accepted active branch head in `records/branch-index.json`,
but `SessionManager.open()` restores Pi's leaf from the JSONL file default. When
the Alt Theory branch head differs from Pi's default leaf, guards in
`SessionService.reviseLatest()` and `SessionService.deleteLatest()` compared
run records against the wrong active branch.

For forked sessions, Pi may create a new JSONL file whose entry IDs do not match
the source session's entry IDs. The source `forkPointEntryId` and the new fork
branch's `activeLeafEntryId` therefore must be recorded separately.

Visibility switching was blocked at the WebSocket layer after materialization,
which created a real pilot-use restriction rather than a runtime constraint.

## Fix

- Added session-manager leaf alignment after opening an existing materialized
  session and after reconfiguring an existing session.
- Consolidated latest active user turn checks for revise/delete so deleted and
  superseded run entries are filtered consistently.
- Changed fork activation to store:
  - `forkPointEntryId`: source session entry id where the fork was requested.
  - `activeLeafEntryId`: the active leaf id in the newly opened fork Pi file.
- Added `SessionService.setVisibility()` and allowed WebSocket
  `switch_visibility` on materialized/resumed sessions.
- Switching to `private` now forces private consent semantics and starts the
  seven-inactive-day retention clock from the switch time.
- Switching to `research` clears `retentionDueAt` and restores the caller's
  research consent snapshot when available.

## Verification

`npm run test:backend` passed with 57 tests.

New or extended coverage verifies:

- deleted latest turn is excluded from future context after reopening;
- revise and default fork use the restored active branch head after reopening;
- materialized WebSocket sessions can switch visibility from private back to
  research and clear private retention metadata.
