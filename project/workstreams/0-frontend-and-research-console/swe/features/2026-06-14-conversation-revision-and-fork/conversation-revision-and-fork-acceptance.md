---
doc_type: feature-acceptance
feature: 2026-06-14-conversation-revision-and-fork
status: accepted
summary: Latest-turn revision remains on the active branch and only explicit Fork creates collaboration/comparison branches.
tags:
  - research-console
  - lineage
  - session-runtime
---

# Conversation Revision and Fork Acceptance

## 1. Interface Contract Verification

- `RunRecord` persists versioned trajectory IDs, Pi entry mappings, status snapshots, and supersession.
- `BranchIndexRecord.activeBranchId` now supports `fork-NNN`.
- `SessionService.reviseLatest()` and `forkSession()` match the design operations.
- Session detail returns `branchIndex`, `activeBranch`, and `runs`.
- WebSocket exposes `revise_latest` and `fork_session`; the composer exposes replacement text and explicit Fork purpose.

## 2. Behavior and Decision Verification

- Ordinary prompts append accepted and terminal run records.
- Latest-turn revision moves the active Pi leaf, keeps session/branch/turn IDs, allocates revision/run IDs, and marks the prior run superseded.
- Superseded Pi entries remain in the append-only source JSONL.
- Collaboration and comparison Fork both create separate Pi files while preserving the Alt Theory session ID.
- Collaboration uses the main shared workspace; comparison recursively copies the source branch workspace before activation.
- Busy operations fail with `session_busy`; failed comparison setup removes only its new copied workspace.
- Non-goals held: no automatic Fork, arbitrary historical editing, side-effect rollback, workspace merge, simultaneous branch streaming, or tree editor.

Mount points verified: run record file, session detail fields, WebSocket operations, and compact composer actions. Removal leaves no additional public registration points.

## 3. Acceptance Scenario Verification

- Run persistence and Pi mappings: `SessionService records ordinary run trajectory and Pi entry mappings`.
- Same-branch revision and durable superseded evidence: `SessionService revises only the latest turn without creating a branch`.
- Collaboration/comparison workspace policy and logical identity: `SessionService explicit forks preserve logical session identity and workspace policy`.
- Busy mutation protection: `SessionService rejects concurrent same-session prompt mutations with session_busy`.
- Low-level Pi same-file revision and fork restart behavior remains covered by `lineage-runtime-feasibility.test.ts`.
- Backend suite: 37 tests passed.
- Frontend syntax: `node --check alt-theory-app/web-server/public/client.js` passed.
- Browser visual verification remains intentionally consolidated with the later workbench UAT checkpoint.

## 4. Terminology Consistency

`revision` means a new path for the same logical turn. `Fork` alone creates a new logical branch. Pi internal session IDs are not exposed as Alt Theory session IDs.

## 5. Architecture Merge

- `project/architecture/core-session-engine.md` now describes run lineage, logical/Pi identity separation, revision, Fork, and workspace policy.
- `project/architecture/researcher-console.md` now describes the minimal controls and remaining branch-browser limitation.

## 6. Requirement Writeback

No separate requirement artifact exists. The accepted behavior is written into the v0.4 SWE plan and current architecture.

## 7. SWE-Plan Writeback

`conversation-revision-and-fork` is `done` in the items YAML and synchronized in the main SWE plan.

## 8. attention.md Candidate Review

No environment/setup candidate. Pi fork identity behavior is a durable architecture fact and is documented there.

## 9. Leftovers

- Branch browsing/switching and richer per-message actions belong to `workbench-session-management`.
- Unified visual UAT remains deferred to the consolidated frontend checkpoint.
- Revision/Fork intentionally does not roll back tool or file side effects.
