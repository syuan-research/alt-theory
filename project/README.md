# v0.3 Project Records

This folder contains the project-level records for the clean v0.3 worktree.

Current policy:

- `plan-records/` stores short-term session/workstream continuity records.
- `research/` stores active research used for project decisions.
- `foundation/` stores selected project identity and legacy/foundation indexes.
- `architecture/` stores current structure and architecture rationale.
- `workstreams/` stores active or near-active workstream briefs and imported current-status docs.
- `project/workstreams/swe/` stores CodeStable-derived SWE feature/issue/refactor artifacts when actual coding work needs stronger process guardrails. Broader `features/`, `issues/`, `roadmaps/`, and `compound/` areas outside SWE remain possible future areas; introduce them only when a concrete non-SWE task needs them.

Important distinctions:

- A plan-record is not a roadmap or architecture document. It preserves current context, stage evolution, and action-for-reflection over one or a few sessions.
- A roadmap is for larger multi-step product/workstream planning.
- Architecture should describe the current system after decisions are stable or implemented.
- Compound-style records are for durable decisions, learnings, tricks, and explorations after they are worth preserving beyond the current session.

The first v0.3 migration slice is intentionally copy-only. The old `llm-theo-v0.2` workspace remains intact.

## Current Recovery Order

For a new agent, start with:

1. `project/architecture/repo-structure-v0.3.md`
2. `project/workstreams/parallel-development-brief.md`
3. `project/foundation/legacy-index.md`
4. the relevant file under `project/plan-records/`

Use `%LLM_THEO_DEV_ROOT%` for runnable Node/npm development. Do not run npm installs or long dev-server work in the OneDrive worktree.

`npm run smoke:core` passed on 2026-06-01. This only verifies core session/context assembly and agent-profile injection. Full backend/frontend app testing is still a future backend or integration-session task.

## Current Adapted CodeStable Rule

This project is not using a full `.codestable/` skeleton yet.

Use `agent-assets/skills/cs-modified-v0-1/SKILL.md` as the current lightweight CodeStable adaptation when deciding where to place project records, whether something is current architecture versus future roadmap, and how to avoid turning discussion or imported evidence into hard policy. For actual SWE feature / issue / refactor coding work, use `agent-assets/skills/cs-swe-v0-2/SKILL.md` and its sibling `cs-swe-*` skills instead.

The main local adaptation is:

- keep CodeStable's separation between capability vision, current architecture, planning, decisions, and reusable learning;
- do not require `.codestable/attention.md` or its full directory tree;
- use the current `project/`, `evals/`, and `agent-assets/` layout;
- keep folder/rule changes small and explain why they are needed.

## Evaluation Priority

`evals/` is lightweight but important. Sim-user and evaluation work is near-term and conference-relevant. The old sim-user profiles are not runtime agent profiles; they are a partly successful test-system attempt to revisit when the evaluation stream resumes.

