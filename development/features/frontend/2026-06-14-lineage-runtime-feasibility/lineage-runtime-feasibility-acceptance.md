# lineage-runtime-feasibility Acceptance Report

> Stage: Stage 3 (Acceptance)
> Acceptance date: 2026-06-14
> Associated design doc: project/workstreams/0-frontend-and-research-console/swe/features/2026-06-14-lineage-runtime-feasibility/lineage-runtime-feasibility-design.md

## 1. Interface Contract Verification

Interface examples:

- [x] Pi tree probe (`alt-theory-app/core/lineage-runtime-feasibility.test.ts`): create persisted `SessionManager`, branch from a latest-turn parent, append replacement exchange, reopen JSONL -> matches design. Test: "Pi same-file branching supports latest-turn revision mapping and restart recovery".
- [x] Physical fork probe (`alt-theory-app/core/lineage-runtime-feasibility.test.ts`): call `createBranchedSession()`, reopen returned file -> matches design. Test: "Pi createBranchedSession creates a separate fork file with parent linkage".
- [x] Runtime rebuild probe (`alt-theory-app/core/lineage-runtime-feasibility.test.ts`): create Alt Theory session, persist synthetic context, reopen with changed soul/role/resource mode -> matches design. Test: "Alt Theory can reopen the same Pi history with changed prompt resources".
- [x] Candidate readable session ID probe (`alt-theory-app/core/lineage-runtime-feasibility.test.ts`): candidate ID accepted by `resolveSessionRoot()` and bounded -> matches design.

Noun layer changes:

- [x] Pi tree probe: implemented as focused test coverage only; no product type introduced.
- [x] Physical fork probe: implemented as focused test coverage only; product branch IDs remain unimplemented.
- [x] Runtime rebuild probe: implemented against existing `createAltTheorySession()` / `openAltTheorySession()` behavior.
- [x] Candidate readable session ID probe: kept test-local; no product helper introduced.

Flow diagram verification:

- [x] Test isolated temp dir -> create Pi/Alt Theory session -> append synthetic durable entries -> exercise branch/fork/reopen/rebuild -> assert behavior. All nodes land in the new focused test file.

## 2. Behavior and Decision Verification

Requirement summary:

- [x] Same-file latest-turn revision behavior demonstrated by backend test.
- [x] Physical JSONL fork creation and `parentSession` linkage demonstrated by backend test.
- [x] Restart recovery demonstrated by reopening the same JSONL and asserting active context.
- [x] Runtime rebuild with changed resources demonstrated by reopening same Pi file and checking changed prompt markers plus preserved context.
- [x] Candidate readable ID feasibility demonstrated against current path guard.

Non-goal reverse-check:

- [x] No `SessionService`, run handle, branch-index, config-event, or v0.4 storage implementation added.
- [x] No WebSocket or REST contract changed.
- [x] No live model call required; tests use synthetic entries.
- [x] Pi physical files are asserted as evidence only, not product identity.
- [x] No existing-session migration added.

Key decisions landed:

- [x] Local tests used instead of live smoke tests.
- [x] Accepted mapping captured as assertions and test names.
- [x] Candidate ID normalization remains test-local.

Orchestration and flow constraints:

- [x] Tests do not depend on network/provider auth/live model response.
- [x] Synthetic message entries force persistence only where needed.
- [x] Each test uses a temp directory.
- [x] Failures would identify unsupported Pi behavior directly.

Mount point reverse-check:

- [x] Design says no runtime mount points; grep/diff confirms only test and SWE artifacts were added.
- [x] Removal sandbox walkthrough: removing the new test file and feature records removes this feature's runtime footprint entirely.

## 3. Acceptance Scenario Verification

- [x] Latest-turn revision candidate.
  - Evidence source: backend test.
  - Result: pass.
- [x] Explicit Fork candidate.
  - Evidence source: backend test.
  - Result: pass.
- [x] Restart recovery.
  - Evidence source: backend test.
  - Result: pass.
- [x] Runtime rebuild.
  - Evidence source: backend test.
  - Result: pass.
- [x] Structured context evidence candidate.
  - Evidence source: backend test using `appendCustomMessageEntry()`.
  - Result: pass.
- [x] Session ID feasibility.
  - Evidence source: backend test.
  - Result: pass.

No frontend changes; browser visual verification not applicable.

## 4. Terminology Consistency

- Pi session file: code uses `sessionFile` and `piSessionFile`; test naming is consistent.
- Logical trajectory: no product type introduced; no conflicting implementation names.
- Latest-turn revision: represented only in test name/design language; no product branch behavior added.
- Explicit Fork: represented only by Pi physical fork probe; no product branch ID added.
- Runtime rebuild: tested through existing reopen path; no new runtime service term introduced.

## 5. Architecture Merge

No architecture document was updated.

Reason: this feature validates future v0.4 foundation assumptions but does not add a current product capability, module, route, service, or persisted record contract. Writing this into `project/architecture/core-session-engine.md` as current architecture would overstate the implementation. The accepted evidence remains in the feature test and this acceptance report; `session-application-foundation` will merge actual structural changes after implementation.

## 6. Requirement Writeback

No requirement writeback. This feature is a technical feasibility gate from the v0.4 SWE plan, not a user-perceptible capability.

## 7. swe-plan Writeback

- [x] `swe_plan` and `swe_plan_item` are present in design frontmatter.
- [x] `project/workstreams/0-frontend-and-research-console/notes-and-status/2026-06-14-research-console-v0-4-swe-plan-items.yaml` updated from `in-progress` to `done`.
- [x] Main SWE plan section 5 child feature seed updated with accepted status/evidence note.
- [x] YAML validation passed.

## 8. attention.md Candidate Review

No attention.md addition recommended. The only execution note is that direct single-file `npx tsx --test ...` hit `spawn EPERM` in this sandbox, while the project command `npm run test:backend` worked. That is an environment-specific one-off, not enough to add a project workflow rule.

## 9. Leftovers

Follow-up optimization points:

- None for this feature.

Known limitations:

- Tests prove physical/logical feasibility but do not implement Alt Theory branch-index or run records.
- Candidate ID normalization is test-local; product helper remains for `draft-first-send-session-creation`.

Implementation side discoveries:

- Pi only writes persisted JSONL after an assistant message exists; v0.4 first-send materialization must preserve that fact when deciding pre-acceptance cleanup vs retained failed-run evidence.
