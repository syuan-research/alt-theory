# CS-SWE v0.2 Adaptation Diagnosis

Status: active diagnosis for v0.2.

## Decision

Adopt Option 2: create Alt Theory's own copied/adapted CS-SWE skill set under `agent-assets/skills/`.

Rejected for now:

- full `.codestable/` install;
- `.codestable` SWE sidecar;
- thin wrapper that only tells agents to read raw CodeStable.

Reason: the user wants to externalize SWE judgment to CodeStable's process details while keeping a long-term path toward project-owned skills. A sidecar would keep every project dependent on another repo's structure; a thin wrapper would not reliably constrain future coding agents.

## Source Evidence

Three read-only explorer passes examined CodeStable raw. Main findings:

- CodeStable's SWE value is in detailed workflow constraints, not just folder categories.
- Raw CodeStable has strong `.codestable/` path coupling.
- Rewriting every reference manually is risky, but a copied/adapted skill set is acceptable if residual couplings are diagnosed and bounded.
- Feature/issue/refactor should be adopted first because they are the direct guardrails for coding-agent quality.

## Preserved

- Feature design / implementation / acceptance separation.
- Issue report / analysis / fix separation.
- Minimal-change implementation discipline.
- No side fixes or hidden refactors.
- Design gaps must stop implementation.
- Acceptance must verify against promised behavior.
- Refactor must remain behavior-preserving.
- YAML frontmatter and search/validate tools.

## Rewritten

- `project/workstreams/swe/features/` -> `project/workstreams/swe/features/`
- `project/workstreams/swe/issues/` -> `project/workstreams/swe/issues/`
- `project/workstreams/swe/refactors/` -> `project/workstreams/swe/refactors/`
- `project/workstreams/swe/compound/` -> `project/workstreams/swe/compound/`
- `agent-assets/skills/cs-swe-v0-2/references/` -> `agent-assets/skills/cs-swe-v0-2/references/`
- `agent-assets/skills/cs-swe-v0-2/tools/` -> `agent-assets/skills/cs-swe-v0-2/tools/`
- `.codestable/architecture/` -> `project/architecture/`
- `.codestable/attention.md` -> `agent-assets/skills/cs-swe-v0-2/references/startup-context.md`

## Deferred

- Full requirements workflow.
- Full roadmap workflow and machine-readable roadmap state.
- Full architecture backfill/update/check skill.
- Guides/libdocs/audits.
- CodeStable onboarding.
- Global note/attention management.

These are not rejected permanently. They are excluded from v0.2 because the near-term goal is coding-agent quality control.

## Known Risk

The copied raw skills still contain some upstream concepts. v0.2 handles this by:

- documenting deferred handoffs in `shared-conventions.md`;
- validating residual references with grep;
- keeping source-map evidence so future updates can target the right raw files;
- using the first 2-3 real coding tasks as action-for-reflection.



