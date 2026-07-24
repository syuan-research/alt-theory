---
doc_type: feature-acceptance
feature: 2026-07-21-opencode-session-import
status: passed
summary: OpenCode passed the complete Alt Theory import-and-continue product path for supported sessions.
tags: [session-import, opencode, acceptance]
---

# OpenCode session import acceptance

> Historical acceptance snapshot from 2026-07-21. Current implemented support
> is in `development/architecture/session-import-adapters.md`.

> Stage: Stage 3 (Acceptance)
> Acceptance date: 2026-07-21
> Associated design: `opencode-session-import-design.md`

## 1. Interface Contract Verification

- `opencode` is ready in the existing harness registry; Pi, Codex, and Grok entries retain their previous meaning.
- OpenCode discovery returns the established source-session shape and repeat state.
- `preflightOnly` returns declared transformations or a structured refusal without creating a managed session.
- Import reuses the existing managed Pi registration, manifest, provenance, workspace, catalog, and open path.
- The local sidebar dialog owns selection/mode/result display and opens the imported catalog session through the existing app context.

## 2. Behavior and Decision Verification

- Complete-session preflight parses all selected SQLite message/part rows before `createSessionDirs` can run.
- Supported content maps deterministically; structural records that OpenCode itself excludes from model messages remain complete raw custom records and are disclosed.
- Non-image file parts, tool-result attachments, unknown parts, unsupported assistant-error replay, and unknown tool states refuse the selected session before write.
- Source DB is read-only. Repeat discovery returned `unchanged` after live continuation and retained the imported session ID; it did not overwrite the continuation.
- Reverse grep confirmed no branch/old-tip, synchronization, or handoff-summary implementation was added.

## 3. Acceptance Scenario Verification

- **Normal product path: passed.** In the local React UI, a bounded five-message OpenCode session was discovered and selected in Work mode. The UI showed three declared transformations, imported it, refreshed the catalog, and opened the managed session.
- **History-dependent continuation: passed.** The follow-up prompt did not provide a file path. The model recovered the earliest historical `read` target from imported history, requested the correct real read tool, passed through Alt Theory's outside-workspace approval, and returned the expected basename and current first-line marker. The run completed; no source or workspace file was changed.
- **Error path: passed.** The regression fixture containing a PDF file part throws `OpenCodeImportRefusalError`; the managed session count remains unchanged.
- **Repeat path: passed.** Live discovery after the completed continuation classified the source as unchanged and pointed to the existing imported session.
- **Frontend visual/interaction check: passed.** Browser verification covered dialog discovery, selection, Work-mode state, transformation disclosure, import/open, approval UI, and final answer.

Private runtime logs and local data remain ignored under `_archives/private-evidence/0-v1-full-stack/20260721-opencode-import-acceptance/`; no transcript or machine path is tracked here.

## 4. Terminology Consistency

- `preflight`, `declared transformations`, `refused`, `unchanged`, and `imported_with_transformations` match the design and v2 plan.
- UI text says unsupported semantics are refused “currently”; it does not label them impossible.

## 5. Architecture Merge

- Updated `project/architecture/core-session-engine.md` with OpenCode discovery/preflight/projection, atomic refusal, raw/model-visible distinction, local UI flow, and repeat behavior.
- No new session engine or durable architecture layer was introduced.

## 6. Requirement Writeback

- No separate requirement artifact exists. The active v2 product-completion record is updated to mark Stage 1 completed and state the tested product promise and remaining refusal boundary.

## 7. swe-plan Writeback

- Not swe-plan originated; no items YAML writeback applies.

## 8. attention.md Candidate Review

- Candidate, not added here: Pi 0.80 can list models from `models-store.json` plus credential-store auth while Alt Theory's current local config gate only recognizes its `models.json` provider format. This is a separate model-config compatibility issue, not an OpenCode adapter failure.

## 9. Leftovers

- Tool-result attachments and non-image file parts remain explicitly refused.
- Assistant-error replay and unknown future OpenCode part/tool states remain explicitly refused until bounded evidence supports a mapping.
- The import dialog does not yet offer a replacement workspace picker when the historical cwd is missing; the existing API supports an override.
- Pi 0.80 existing-subscription config ingestion should be handled in the model-config workstream; the accepted import path used an isolated Pi-compatible Alt Theory model definition and normal Pi AuthStorage resolution.

Verification before final record audit: `npm run test:backend` passed 101/101 and
`npm run build:frontend-v6` passed. Final YAML, privacy, and diff checks are
recorded in the task handoff rather than embedding machine-specific logs here.
