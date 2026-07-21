---
doc_type: feature-acceptance
feature: 2026-06-16-conversation-action-backend-foundation
status: accepted
summary: Accepted backend latest-turn delete semantics for conversation action cleanup; frontend placement remains in the parent plan item.
swe_plan: research-console-v0-5
swe_plan_item: conversation-action-cleanup
created: 2026-06-16
tags: [v0-5, lineage, conversation-actions]
---

# Conversation Action Backend Foundation Acceptance

## Scope Accepted

Accepted backend foundation for `delete_latest`:

- `SessionService.deleteLatest(sessionId)`;
- WebSocket client message `delete_latest`;
- append-only run status `deleted`;
- session event `latest_turn_deleted`;
- Pi leaf movement so future context excludes the deleted latest user turn.

Frontend placement, message-near controls, composer hints, and participant UI
polish are intentionally not accepted here.

## Evidence

- `npm run test:backend` passed with 55 tests.
- Checklist step is `done`.
- Checklist checks are all `passed`.

## Key Behaviors Verified

- Delete keeps the same Alt Theory session and `main` branch.
- Future Pi context excludes the deleted user text.
- The prior completed run gains latest status `deleted`.
- The branch head points away from the deleted user entry.
- Empty/no-completed-turn sessions reject delete.
- Busy sessions reject delete with `session_busy`.
- Delete does not create a fork and does not remove disk evidence.

## Plan Writeback

`conversation-action-cleanup` remains `in-progress` in the v0.5 SWE plan items
because frontend controls and user-facing hints are not yet implemented.
