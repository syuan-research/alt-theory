---
doc_type: decision
category: architecture
date: 2026-07-02
slug: v0-6-pi-runtime-boundary
status: active
area: backend agent harness / session runtime / prompt runtime
tags: [v0-6, pi, runtime, session, fork, prompt, debt]
---

# v0.6 Pi Runtime Boundary

## Background

The current v0.5.x line is usable enough for the research stage, but the
runtime boundary has accumulated avoidable debt.

Alt Theory currently owns too much of the live conversation model: draft
selectors, materialized session state, branch-index records, transcript
projection, same-session fork behavior, and prompt-layer history all overlap.
This creates a second authority beside Pi for questions such as "what is the
current conversation" and "what branch is active".

That overlap has already produced confusion around fork behavior, branch state,
session meaning, and prompt/runtime configuration. The current shape is not a
good base for later v0.7 or v0.8 work.

At the same time, the repo is still pinned to the older
`@mariozechner/pi-*` `0.70.2` package line. v0.6 is not a fast patch release;
it is the point to reset the foundation.

## Decision

v0.6 will upgrade the existing Pi package set together and stop extending the
current Alt Theory branch-index runtime layer.

Settled boundaries:

- Upgrade the Pi package set together rather than keep building new Alt Theory
  runtime behavior on `0.70.2`.
- Pi is the **only runtime source of truth** for live conversation state:
  session history, active leaf, revise/fork/continue behavior, and session
  replacement lifecycle.
- Alt Theory keeps **application and research metadata**, not a second live
  conversation authority.
- Alt Theory must not continue the current same-session hidden branch model.
- If fork remains user-visible, it becomes a **new conversation / session row**,
  with Alt Theory storing parent/source metadata only.
- The current second-authority branch layer is debt, not a foundation. v0.6
  should remove it rather than repair it in place.
- `core-soul` is not part of the v0.6 foundation. It should be removed from the
  main runtime path rather than carried forward as a third prompt layer.
- Legacy `profile` compatibility is not part of the v0.6 foundation. The main
  runtime path should not keep both `profile` and `role preset` semantics alive.
- Prompt loading must be cleaned up as a separate v0.6 line, but prompt-layer
  uncertainty is **not** a reason to preserve the old session/branch runtime
  structure.
- Real-time A/B response UI may follow later, but v0.6 should still provide the
  backend/data-model basis for multi-candidate recording so later research work
  does not require another session-model rewrite.

Implementation note, 2026-07-02:

- Current `fork_session` behavior now creates a new visible session row instead
  of activating a hidden same-session branch.
- The new session copies the source workspace/history and records parent/source
  metadata. The source session remains on its current conversation.
- Legacy live `profile` compatibility was removed from the server/client path
  and manifest surface.
- `core-soul` was removed from the live runtime path and manifest surface.
- Deprecated `runtimeDir` compatibility was removed from core config and the
  manifest surface.

## Rationale

The main problem is not merely old package versions. The problem is that Alt
Theory grew from an application wrapper into a partial parallel runtime.

Keeping the current structure and "refactoring it carefully" would mostly
preserve the same overlap under a cleaner surface. That does not remove the
debt.

Moving to the current Pi package line matters because it makes the intended
runtime boundary easier to honor: Pi already has the native session/runtime
concepts; Alt Theory does not need to keep inventing substitutes.

The fork decision is intentionally strict. The current hidden same-session fork
model is hard to explain, hard to inspect, and easy to get wrong. Treating a
fork as a new visible conversation is simpler for both product and research.

The prompt-layer decision is also intentionally strict. v0.6 should not carry
dead or weakly justified prompt layers just because they already exist.

## Alternatives Considered

- **Stay on Pi 0.70.2 and keep repairing the current Alt Theory runtime layer**:
  rejected because it would preserve the wrong ownership boundary.
- **Upgrade Pi but keep Alt Theory branch/session authority intact**:
  rejected because version upgrade alone does not remove the core debt.
- **Keep same-session hidden fork but hide it better**: rejected because the
  mental model remains poor even if the UI wording improves.
- **Defer the runtime reset to v0.7 and make v0.6 mostly UI/config work**:
  rejected because v0.6 would then fail to provide a stronger foundation for
  later releases.

## Consequences

- v0.6 planning should treat the Pi baseline migration and runtime-boundary
  reset as foundation work.
- The existing branch-index and same-session hidden fork path should be treated
  as removal targets, not as permanent architecture to preserve.
- Prompt loading needs a separate decision/cleanup pass, but that pass should
  assume a thinner runtime boundary than v0.5.x has now.
- Architecture and implementation discussions after this decision should avoid
  justifying old runtime overlap by pointing to historical implementation alone.

## Related Documents

- `project/architecture/core-session-engine.md`
- `project/workstreams/0-backend-agent-harness/notes-and-status/2026-06-17-session-lineage-product-integration-observation.md`
- `project/workstreams/0-backend-agent-harness/notes-and-status/2026-06-18-v0-6-deferred-observations.md`
- `project/workstreams/0-backend-agent-harness/notes-and-status/2026-06-24-model-fallback-pilot-incident-review-handoff.md`
