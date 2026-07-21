---
doc_type: feature-design
feature: 2026-06-16-conversation-action-backend-foundation
status: approved
summary: Add backend latest-turn delete semantics for conversation action cleanup without frontend placement work.
swe_plan: research-console-v0-5
swe_plan_item: conversation-action-cleanup
swe_plan_path: project/workstreams/0-frontend-and-research-console/notes-and-status/2026-06-16-research-console-v0-5-swe-plan.md
tags: [v0-5, lineage, conversation-actions]
---

# Conversation Action Backend Foundation Design

## 0. Terminology

- **Latest-turn delete**: hide the active branch's latest completed user turn
  from the active transcript and future LLM context by moving the Pi leaf to
  that turn's parent.
- **Deleted run evidence**: append-only run status that records the prior run
  was deleted from active context without deleting Pi JSONL evidence.

## 1. Decisions and Constraints

Scope: backend-only foundation for `conversation-action-cleanup`.

Non-goals:

- no frontend button placement;
- no message-context UI;
- no broad transcript redaction/export policy;
- no deletion of Pi evidence from disk.

Rules:

- only the active branch latest completed user turn can be deleted;
- busy/running sessions reject delete with `session_busy`;
- delete does not create a fork;
- delete moves Pi active leaf to the deleted user entry's parent, or resets the
  leaf when there is no parent;
- the run record is append-only and gains a terminal deleted/superseded state;
- future context must exclude the deleted user text.

## 2. Interfaces

- `lineage-records.ts`: add `deleted` run status.
- `session-events.ts`: add `latest_turn_deleted`.
- `session-service.ts`: add `deleteLatest(sessionId): SessionSnapshot`.
- `websocket-protocol.ts`: add client message `delete_latest`.
- `server.ts`: handle `delete_latest` and return updated transcript/metadata.

## 3. Acceptance Contract

Key scenarios:

1. Deleting latest user turn keeps the same session and branch.
2. Future Pi context excludes deleted user text.
3. Run records show the previous completed run as `deleted`.
4. Branch head points at the deleted turn's parent.
5. Non-latest or missing completed turns are rejected.
6. Busy sessions reject delete with `session_busy`.

Reverse checks:

- no implicit fork;
- no disk evidence deletion;
- no frontend placement work.
