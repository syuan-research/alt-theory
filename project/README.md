# v0.3 Project Records

This folder contains the project-level records for the clean v0.3 worktree.

Current policy:

- `plan-records/` stores migration-level, repository-level, or legacy plan-records. Default workstream-local plan-records and `swe-plan` records should live under `project/workstreams/{workstream}/notes-and-status/`.
- `compound/` stores CodeStable-derived decision, learning, trick, and explore records.
- `brainstorms/` stores central/open brainstorm records that are not feature-local.
- `research/` stores active research used for project decisions.
- `foundation/` stores selected project identity and legacy/foundation indexes.
- `architecture/` stores current structure and architecture rationale.
- `workstreams/` stores active or near-active workstream briefs, workstream-local `notes-and-status/`, and imported current-status docs.
- `cross-workstream/` stores records and outputs that explicitly coordinate multiple workstreams.
- `project/workstreams/swe/` stores CodeStable-derived SWE feature/issue/refactor artifacts and workstream-local `notes-and-status/` records when actual coding work needs stronger process guardrails. Broader `features/`, `issues/`, and `roadmaps/` areas outside SWE remain possible future areas; introduce them only when a concrete non-SWE task needs them.

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
4. the relevant workstream-local file under `project/workstreams/{workstream}/notes-and-status/`, `project/cross-workstream/notes-and-status/` for cross-workstream coordination, or `project/plan-records/` only for migration/repository-level records

Use `%LLM_THEO_DEV_ROOT%` for runnable Node/npm development. Do not run npm installs or long dev-server work in the OneDrive worktree.

`npm run smoke:core` passed on 2026-06-01. This only verifies core session/context assembly and agent-profile injection. Full backend/frontend app testing is still a future backend or integration-session task.

## Current Adapted CodeStable Rule

This project is not using a full `.codestable/` skeleton yet.

For actual SWE feature / issue / refactor / multi-feature `swe-plan` coding work, use `agent-assets/skills/cs-swe-v0-3/SKILL.md`.

Do not use `cs-modified-v0-1` as a current rule. It was an incorrect intermediate artifact from an earlier mistaken assumption that CodeStable should be adapted mainly at a high conceptual level. If that history matters, recover it from plan-records; do not present it to future agents as a skill.

The current local CodeStable adaptation is:

- keep CodeStable's concrete SWE guardrails for features, issues, refactors, and multi-feature `swe-plan`;
- do not require `.codestable/attention.md` or its full directory tree;
- use the current `project/workstreams/swe/`, `project/architecture/`, and `agent-assets/skills/` layout;
- rename CodeStable raw roadmap mechanics to `swe-plan`;
- keep requirements as references unless the user opens a separate requirement workflow;
- make plan-record / brainstorm / architecture boundaries explicit.

## Evaluation Priority

`evals/` is lightweight but important. Sim-user and evaluation work is near-term and conference-relevant. The old sim-user profiles are not runtime agent profiles; they are a partly successful test-system attempt to revisit when the evaluation stream resumes.

