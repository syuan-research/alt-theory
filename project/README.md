# v0.3 Project Records

This folder contains the project-level records for the clean v0.3 worktree.

Current policy:

- `plan-records/` stores migration-level, repository-level, or legacy plan-records. Default workstream-local plan-records and `swe-plan` records should live under `project/workstreams/{workstream}/notes-and-status/`.
- `compound/` stores CodeStable-derived decision, learning, trick, and explore records.
- `brainstorms/` stores central/open brainstorm records that are not feature-local.
- `foundation/` stores selected project identity and legacy/foundation indexes.
- `architecture/` stores current structure and architecture rationale.
- `workstreams/` stores active or near-active workstream briefs, workstream-local `notes-and-status/`, and imported current-status docs.
- `cross-workstream/` stores records and outputs that explicitly coordinate multiple workstreams.
- Code-level SWE records belong in the concrete workstream they concern. Create a specific workstream such as backend, frontend, packaging, or evaluation implementation when that work becomes active; do not add a generic `project/workstreams/swe/` wrapper.

Important distinctions:

- A plan-record is not a roadmap or architecture document. It preserves current context, stage evolution, and action-for-reflection over one or a few sessions.
- A roadmap is for larger multi-step product/workstream planning.
- Architecture should describe the current system after decisions are stable or implemented.
- Compound-style records are for durable decisions, learnings, tricks, and explorations after they are worth preserving beyond the current session.

After the 2026-06-08 manual cleanup, this dev repo is no longer a copy-only
mirror of all research material. Bulk research/evaluation material is being
split out of this Git worktree, while this repo keeps software, architecture,
runtime-facing assets, and dev workstream records.

## Current Recovery Order

For a new agent, start with:

1. `project/architecture/repo-structure-v0.3.md`
2. `project/cross-workstream/folder-and-worktree-management/notes-and-status/2026-06-08-manual-restructure-stage0-1-plan-record.md`
3. `%LLM_THEO_WORKTREES_ROOT%/README.md`
4. the relevant workstream-local file under `project/workstreams/{workstream}/notes-and-status/`, a named cross-workstream domain such as `project/cross-workstream/folder-and-worktree-management/notes-and-status/`, or `project/plan-records/` only for migration/repository-level records

Use `%LLM_THEO_DEV_ROOT%` for runnable Node/npm development. Do not run npm installs or long dev-server work in the OneDrive worktree.

`npm run smoke:core` passed on 2026-06-01. This only verifies core session/context assembly and agent-profile injection. Full backend/frontend app testing is still a future backend or integration-session task.

## Current Adapted CodeStable Rule

This project is not using a full `.codestable/` skeleton yet.

For actual SWE feature / issue / refactor / multi-feature `swe-plan` coding work, use `agent-assets/skills/cs-swe-v0-3/SKILL.md`.

Do not use `cs-modified-v0-1` as a current rule. It was an incorrect intermediate artifact from an earlier mistaken assumption that CodeStable should be adapted mainly at a high conceptual level. If that history matters, recover it from plan-records; do not present it to future agents as a skill.

The current local CodeStable adaptation is:

- keep CodeStable's concrete SWE guardrails for features, issues, refactors, and multi-feature `swe-plan`;
- do not require `.codestable/attention.md` or its full directory tree;
- keep SWE records inside the relevant concrete `project/workstreams/{workstream}/` area, with `project/architecture/` and `agent-assets/skills/` serving their existing roles;
- rename CodeStable raw roadmap mechanics to `swe-plan`;
- keep requirements as references unless the user opens a separate requirement workflow;
- make plan-record / brainstorm / architecture boundaries explicit.

## Evaluation And Research Split

`project/workstreams/1-eval-env/` is for evaluation environment and harness
development. It is not the evaluation corpus itself.

Evaluation data, simulated-user material, and broader academic research notes
are moving outside this dev repo. Treat that external research tree as a
separate source with its own privacy/Git/sync policy.

