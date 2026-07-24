---
doc_type: decision
category: architecture
date: 2026-07-21
slug: cross-harness-current-tip-import
status: active
area: local session import / Pi runtime / harness adapters
amended: 2026-07-24
tags: [session-import, pi, opencode, codex, grok-build, claude-code, current-tip]
---

# Cross-Harness Current-Tip Import

## Background

Users already have substantial conversations in OpenCode, Codex, Grok Build,
and Claude Code. The useful product outcome is to select one conversation and
continue it through the Pi runtime used by Alt Theory without first rewriting
it as a handoff summary. Bounded private probes and the implemented adapters
established that each source needs its own deterministic persistence mapping.

The probe plan accumulated side questions about source-native rewind, old tips,
and branch reconstruction. Those questions are not required by this user story
and made the implementation path harder to see.

## Decision

The faithful import path targets the source conversation's **current
continuation state only**.

- Do not import or reconstruct source-native branches, abandoned tips, rewind
  points, edit history, retry history, or source UI control operations.
- Generate the ordinary Pi entry chain needed to open and continue the imported
  conversation. Those target `id` / `parentId` links do not claim to reproduce
  source ancestry.
- Use a deterministic adapter for each source harness. The normal import path
  reads persisted source data and does not require an agent, skill, or running
  source harness.
- A source runtime may be used as a test oracle when useful, but is never an
  import dependency. Replay is adapter-local only if a source format actually
  requires it to obtain the current continuation state.
- Keep a complete source snapshot and provenance beside the generated Pi
  session. Raw retention is not presented as model visibility: verification
  must inspect Pi's actual `buildSessionContext` and serialized provider
  request.
- Preserve source system/developer text as labelled historical context where
  the source proves it was model-visible. The target Pi/Alt Theory mode owns the
  new active system prompt. Pi JSONL cannot self-contain Codex's original
  system-versus-developer priority distinction, so that transformation must be
  reported rather than hidden.
- Never silently delete, truncate, sanitize, or "anonymize" locally imported
  history. If a persisted source element has no safe Pi representation, retain
  it in the source snapshot and report the concrete loss.
- Source harness and target model/provider remain independent dimensions.
- A later skill/agent handoff is a separately labelled fallback, not the
  faithful import implementation.

## Evidence and Current Implementation

This decision no longer carries a mutable per-harness evidence table. Upstream
storage and UI-reconstruction facts live under
`research-agent-session-history/`; implemented product behavior lives in
`development/architecture/session-import-adapters.md`. Keeping those facts out
of this decision prevents historical probe limits from being mistaken for the
current support boundary.

The implemented adapters preserve both the recoverable visible transcript and
the portable active continuation context. Those are distinct when a source has
compacted, rolled back, branched, or stored provider-private state. Available
child/subagent material is retained as searchable source context rather than
replayed as independent main-conversation turns.

## Alternatives Considered

- **Reconstruct source branches and old tips:** rejected because it does not
  advance the current-conversation continuation story and adds harness-specific
  control semantics.
- **Require the source harness/runtime during import:** rejected as a default;
  persisted stores already support the selected current-tip conversions.
- **Use an agent/skill to interpret every source session:** reserved for a
  labelled fallback because it weakens determinism and adds no value when a
  direct adapter works.
- **Keep upstream format research inside this decision:** rejected after the
  adapters matured. Upstream persistence facts change independently and now
  live in dated explore/learning records.

## Consequences

- Success is measured at current-tip continuation: source snapshot retained,
  mapped Pi context verified, tool pairs checked, declared transformations
  visible, and the resulting session openable and continuable.
- Target-native conversation undo after import may operate on the generated Pi
  chain, but importing source-native historical branches is not promised.
- The source harness/runtime is not required during normal import.
- Upstream research can grow without expanding the core session-engine
  architecture document or rewriting this product decision.

## Related Documents

- `development/architecture/session-import-adapters.md`
- `development/compound/research-agent-session-history/README.md`
- `development/compound/2026-07-02-decision-v0-6-pi-runtime-boundary.md`
