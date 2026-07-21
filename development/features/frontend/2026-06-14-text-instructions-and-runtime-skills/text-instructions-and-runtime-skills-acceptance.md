---
doc_type: feature-acceptance
feature: 2026-06-14-text-instructions-and-runtime-skills
status: accepted
summary: Readable instruction assets and Alt Theory runtime skills are available without changing session identity.
tags:
  - research-console
  - runtime-assets
  - skills
---

# Text Instructions and Runtime Skills Acceptance

## 1. Interface Contract Verification

- `listInstructionAssets()` and `loadInstructionAsset()` match the design examples and return stable refs, paths, hashes, sizes, and decoded content.
- `AssemblyManifest` now carries custom-instruction provenance and loaded Alt Theory skill references.
- `SessionSelectors` carries `customInstructionRef`.
- WebSocket `switch_instruction` and `invoke_skill` match the planned operation shapes.
- The flow lands through REST catalogs, draft/session selectors, same-session rebuild, config events, Pi-native invocation, and session events.

## 2. Behavior and Decision Verification

- Instruction discovery is recursive and content-based, with no extension allowlist.
- Invalid UTF-8, binary-like, oversized, absolute, and traversal references are rejected.
- `clean` returns no skills; `internal` replaces Pi discovery with Alt Theory skills; `dev-debug` merges both and prefers Alt Theory on duplicate names.
- Instruction changes preserve the Alt Theory session ID and Pi history path.
- Explicit invocation validates against the active Alt Theory manifest skills and records `skill_invoked`.
- Non-goals held: no upload/editor/raw-path UI, database, watcher, skill matrix, debug-skill picker, branch, or replacement session.

Mount points verified: asset-root resolution, two REST routes, two WebSocket operations, console controls, and the runtime summary skill. Reverse review found no additional public registration point.

## 3. Acceptance Scenario Verification

- Readable non-`.md` UTF-8 instruction: passed by `instruction assets accept readable text regardless of extension`.
- Unsafe instruction content/references: passed by `instruction assets reject unsafe content and references`.
- Internal skill plus instruction prompt/manifest provenance: passed by `core records resource discovery mode in the assembly manifest`.
- Dev-debug composition: passed by `dev-debug composes configured Alt Theory skills with Pi discovery`.
- Same-session instruction change: passed by `SessionService switches custom instruction inside the same materialized session`.
- Skill validation, command assembly, and event record: passed by `SessionService validates explicit skill invocation against active Alt Theory skills`.
- Frontend static syntax: `node --check alt-theory-app/web-server/public/client.js` passed.
- Browser visual verification is intentionally deferred to the already planned unified frontend UAT checkpoint to avoid a redundant test round.

## 4. Terminology Consistency

Code and records consistently use `customInstructionRef`, `instruction asset`, `Alt Theory skill`, `debug skill`, and `skill_invoked`. No `runtime-skills` directory or second skill model was introduced.

## 5. Architecture Merge

- `project/architecture/core-session-engine.md` now documents instruction assembly/provenance, three-mode skill composition, and explicit invocation.
- `project/architecture/researcher-console.md` now documents the instruction selector, skill action, and catalog boundaries.

## 6. Requirement Writeback

No separate requirement file exists. The accepted capability is recorded in the v0.4 SWE plan and current architecture documents.

## 7. SWE-Plan Writeback

`text-instructions-and-runtime-skills` is `done` in the items YAML and the main SWE plan records the accepted implementation and deferred consolidated visual UAT.

## 8. attention.md Candidate Review

No reusable environment/setup trap was exposed. The Pi skill merge semantics are captured in current architecture and tests.

## 9. Leftovers

- Unified browser visual UAT remains deferred to the planned consolidated frontend checkpoint.
- The summary skill is intentionally minimal and should be expanded only after real-session use.
