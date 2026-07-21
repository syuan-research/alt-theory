# Core Open Existing Session Acceptance Report

> Stage: Stage 3 (Acceptance)
> Acceptance date: 2026-06-08
> Associated design doc: `core-open-existing-session-design.md`

## 1. Interface Contract Verification

- [x] `createAltTheorySession()` remains the fresh-session entrypoint.
- [x] `openAltTheorySession()` opens an existing Pi JSONL through
  `SessionManager.open()`.
- [x] `AssemblyManifest` now carries optional `openedFrom`, `resumedFrom`, and
  `resumeWarnings` fields for future metadata consumers.

## 2. Behavior And Decision Verification

The shared assembly path preserves fresh-session behavior and lets existing
sessions reuse current app context, soul, role preset, KB, Pi prompts, model,
and tool policy. Existing-session open writes `records/resume-manifest.json`
and does not overwrite `records/assembly-manifest.json`.

## 3. Acceptance Scenario Verification

`npm run test:backend` covered:

- fresh-session tests still pass;
- existing JSONL opens with the original session ID;
- saved Pi context is visible after open;
- opening does not create another session root;
- original `assembly-manifest.json` remains byte-identical;
- `resume-manifest.json` records active resume facts;
- role-preset and KB drift produce resume warnings.

## 4. Terminology Consistency

`openAltTheorySession` is the core capability. The WebSocket command remains
unimplemented and is still named by the later `websocket-resume-open-protocol`
child feature.

## 5. Architecture Merge

Deferred until WebSocket `open_session` makes this capability part of current
backend behavior.

## 6. Requirement Writeback

No separate requirement record.

## 7. SWE-Plan Writeback

`core-open-existing-session` is marked done in the `session-list-resume-open`
items YAML, and the main SWE-plan now points to this feature artifact.

## 8. Attention Candidate Review

No new attention candidate.

## 9. Leftovers

- WebSocket state replacement and `session_resumed` event logging remain in the
  next child feature.
- Cross-machine cwd repair is not implemented; cwd drift is warning-only.

