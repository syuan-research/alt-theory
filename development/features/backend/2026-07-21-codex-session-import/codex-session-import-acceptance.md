---
doc_type: feature-acceptance
feature: 2026-07-21-codex-session-import
status: passed
summary: Codex passed the complete Alt Theory import-and-continue product path for the supported rollout subset.
tags: [session-import, codex, acceptance]
---

# Codex session import acceptance

> Historical acceptance snapshot from 2026-07-21. Current implemented support
> is in `development/architecture/session-import-adapters.md`.

> Stage: Stage 3 (Acceptance)
> Acceptance date: 2026-07-21
> Associated design: `codex-session-import-design.md`

## 1. Interface Contract Verification

- `codex` is ready in the existing harness registry and uses the shared discovery, preflight, managed-registration, provenance, catalog, and open contracts.
- The local import dialog selects OpenCode or Codex without a second product surface.
- `preflightOnly` returns declared transformations or a structured refusal before managed storage exists.
- Only plain JSONL rollouts are discovered; compressed rollouts remain outside the supported subset.

## 2. Behavior and Decision Verification

- Complete preflight parses and accounts for every selected rollout record before registration.
- Base instructions and system/developer text remain labelled and model-visible with the Pi user-role priority transformation disclosed.
- User/assistant text and paired function/custom tool calls and text results map deterministically. Every source record is also retained as raw custom data.
- Provider reasoning, runtime records, and session-level dynamic tool definitions remain raw-only and are disclosed; source dynamic tools are not registered as active Alt Theory tools.
- Unsupported response items, malformed/non-text content, unmatched or duplicate tool results, compaction, rollback/aborted turns, and inherited/forked/subagent history refuse atomically.

## 3. Acceptance Scenario Verification

- **Normal product path: passed.** A bounded recent plain Codex rollout was discovered, selected in Work mode, fully preflighted, imported, catalogued, and opened through the local React UI.
- **History-dependent continuation: passed.** The new prompt supplied no path. The model recovered the sole historical custom-exec target, called the Alt Theory `read` tool exactly once, and returned the expected basename and first line without modifying a file.
- **Error path: passed.** An orphan custom-tool output fixture refused before registration and left the managed-session count unchanged.
- **Repeat and persistence paths: passed.** Repeat discovery returned `unchanged`, opened the existing managed session without overwriting its continuation, and the complete connected transcript reopened after an isolated server restart.
- **Source integrity: passed.** The source rollout SHA-256 still matched the stored import fingerprint after the live continuation and repeat checks.

Private runtime data and transcripts remain ignored under `_archives/private-evidence/`; no private session identifier, transcript, or machine-specific source path is tracked here.

## 4. Terminology Consistency

- `rollout`, `preflight`, `declared transformations`, `refused`, `unchanged`, and `imported_with_transformations` match the design and v2 plan.
- Documentation describes a verified supported subset and explicit refusal boundaries, not universal Codex compatibility.

## 5. Architecture Merge

- Updated `project/architecture/core-session-engine.md` with Codex discovery, projection, refusal boundaries, dynamic-tool treatment, shared UI/API routing, and repeat behavior.
- Fixed the shared nonempty-Pi-session reopen invariant: absent Alt Theory run records preserve Pi's loaded final leaf, while persisted run state may still select or clear a leaf.
- The shared transcript getter now refreshes from persisted Pi history, so same-process reopen does not return a creation-time cache.

## 6. Requirement Writeback

- The active v2 product-completion record marks Stage 2 completed and Stage 3 as the next harness stage.

## 7. swe-plan Writeback

- Not swe-plan originated; no items YAML writeback applies.

## 8. attention.md Candidate Review

- No new attention item. Plain-JSONL-only support and non-reactivated source dynamic tools are explicit adapter boundaries rather than hidden operational debt.

## 9. Leftovers

- Compressed rollouts, source old tips/branches, compaction, rollback/aborted turns, inherited/forked/subagent history, non-text content, and unsupported Codex-specific response items remain refused or undiscovered.
- Historical dynamic tool definitions are retained raw but not recreated as active Alt Theory tools; an unsupported historical call still refuses.
- Grok Build remains the next independent product adapter stage.

Verification: `npm run test:backend` passed 105/105 and
`npm run build:frontend-v6` passed. The real UI acceptance additionally covered
preflight disclosure, import/open, one history-dependent tool continuation,
unchanged repeat, source integrity, and restart reopen.
