---
doc_type: decision
category: architecture
date: 2026-07-02
slug: v0-6-prompt-loading-boundary
status: active
area: backend agent harness / prompt loading / runtime assets
tags: [v0-6, prompt, soul, role, skill, kb, runtime]
---

# v0.6 Prompt Loading Boundary

## Background

The current prompt loading path mixes too many different things:

- long-lived stance (`soul`);
- task/persona framing (`role`);
- ad hoc extra instructions;
- KB metadata;
- standard skills.

That mixing caused two bad outcomes:

- KB and other extra material got shoved into `role`;
- discussion about prompt loading drifted into a fake choice between normal
  standard skills and explicit slash-only invocation.

v0.6 needs a thinner and more normal structure.

## Decision

Settled boundaries:

- Keep both `soul` and `role` as separate long-term concepts.
- Keep an **extra instruction** layer that auto-loads from file, so researchers
  can drop in additional instructions without code edits.
- All prompt layers must be switchable at runtime. Do not block switching by
  design.
- KB metadata is separate from `role`. Do not use `role` as the storage place
  for KB metadata just because no other slot exists.
- Standard Pi skills stay standard. They are not part of the prompt-loading
  workaround layer and must not be reduced to explicit `/skill:...` only.

Initial v0.6 simplification:

- Use one default extra-instruction file path first, not a larger prompt-pack
  system.
- Keep current asset naming for now (`role-presets/` in code/assets is fine).
  Avoid pushing `role preset` as user-facing product language.

Implementation note, 2026-07-02:

- New session drafts select `agent-assets/instructions/default.md` when that
  file exists and passes the existing instruction loader checks.
- If the file is absent, behavior is unchanged; no prompt-pack layer was added.

## Rationale

The goal is not to invent a richer prompt framework. The goal is to stop using
the wrong layer for the wrong job.

`soul`, `role`, extra instructions, KB metadata, and skills are not the same
kind of thing. They should not collapse into one catch-all prompt bucket.

The extra-instruction file exists for a practical reason: researchers need a
drop-in slot without touching code. That is enough for v0.6; it does not need
to become a plugin system.

The skill boundary is also strict on purpose. Standard skills already have a
normal Pi path. Prompt cleanup should not quietly cripple that path.

## Consequences

- v0.6 should add a small default file-based extra-instruction slot instead of
  forcing researchers to edit `role`.
- Prompt assembly should keep separate slots for `soul`, `role`, extra
  instructions, and KB metadata.
- Skill handling should be reviewed separately from prompt assembly, with Pi
  standard behavior treated as the default baseline.
- Any current code path that blocks switching among these layers should be
  treated as debt.

## Deferred

- Exact assembly order across `soul`, `role`, extra instructions, and KB
  metadata.
- Whether KB metadata should be one file or a structured generated block.
- Whether the extra-instruction slot later grows from one file into an ordered
  directory.

## Related Documents

- `agent-assets/README.md`
- `project/compound/2026-07-02-decision-v0-6-pi-v0-8-runtime-boundary.md`
- `project/workstreams/0-backend-agent-harness/notes-and-status/2026-06-24-model-fallback-pilot-incident-review-handoff.md`
