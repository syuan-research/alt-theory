# Session Persistence And Output Folders Acceptance Report

> Stage: Stage 3 (Acceptance)
> Acceptance date: 2026-06-07
> Associated design doc: `session-persistence-and-output-folders-design.md`

## 1. Interface Contract Verification

- [x] `SessionDirectories` creates one root with workspace/history/notes.
- [x] `AltTheoryConfig` accepts explicit session paths and ID.
- [x] `createAltTheorySession()` returns the Pi session and actual manifest.

## 2. Behavior And Decision Verification

- [x] Alt Theory generates the ID before Pi initialization.
- [x] Pi uses `SessionManager.create(cwd, sessionDir)` and the same ID.
- [x] Manifest writes are atomic and no in-memory fallback exists.
- [x] Session restore and hard write isolation were not added.

## 3. Acceptance Scenario Verification

- [x] Core smoke reserved a timestamped Pi JSONL path; focused testing confirmed
  Pi creates the file when the first assistant message completes.
- [x] Pi session ID matched the session-root ID.
- [x] On-disk manifest recorded the reserved JSONL path, model, and provider.
- [x] Repository `smoke:core` script resolved the current source path.

## 4. Terminology Consistency

`sessionCwd`, `piSessionDir`, `writeDir`, and `sessionId` are used consistently
in the core module and design.

## 5. Architecture Merge

Deferred to whole-plan acceptance because F2-F6 extend the same architecture
surface immediately after this feature. The current architecture file remains
marked for mandatory update before plan completion.

## 6. Requirement Writeback

No separate requirement document. The active SWE-plan is the controlling
capability record.

## 7. SWE-Plan Writeback

The item is marked `done`; the dependent F2 item is opened as `in-progress`.

## 8. Attention Candidate Review

`tsx` requires non-sandbox child-process permission on this machine. This is an
execution-environment fact, not added to project instructions in this pass.

## 9. Leftovers

- Session list/resume remains an explicit non-goal.
- Architecture merge remains required at whole-plan acceptance.
