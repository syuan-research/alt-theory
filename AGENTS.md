# AGENTS.md

Keep this file short. It is the map, not the encyclopedia.

Use it to find the right project docs, active skill bundle, recovery files, and safety rules. Deeper detail belongs in the linked files under `project/` and `agent-assets/`.

## Project Purpose

This worktree is the clean `v0.3` reorganization lane for Alt Theory. Alt Theory is an academic research project on the use of 2026 advanced agentic AI tool for social science education, with both swe and empirical research. 

Current emphasis:

- keep the old `llm-theo-v0.2` repo intact while building a cleaner `v0.3` structure;
- use `cs-swe-v0-3` as the active SWE-only skill bundle;
- separate project records, agent assets, evaluation work, and reference repositories more cleanly;
- keep OneDrive-safe project history while moving dependency-heavy or reference-heavy material outside OneDrive when needed.

## Quick Tree

```text
project/
  README.md
  architecture/
  foundation/
  plan-records/
  research/
  workstreams/
  compound/
  brainstorms/
  cross-workstream/

agent-assets/
  README.md
  kb/
  profiles/
  prompts/
  runtime/
  skills/

alt-theory-app/
alt-theory-rag/
evals/
_archives/               # local ignored snapshots only
```

## Read First

Start with:

1. [%LLM_THEO_WORKTREES_ROOT%/README.md](file:///%LLM_THEO_WORKTREES_ROOT%/README.md) for active worktree paths and branch mappings
2. `project/README.md`
3. `agent-assets/README.md`
4. the relevant workstream under `project/workstreams/`
5. the relevant workstream-local or cross-workstream file under `notes-and-status/`

For software coding work, read:

1. `agent-assets/skills/cs-swe-v0-3/SKILL.md`
2. `agent-assets/skills/cs-swe-v0-3/references/shared-conventions.md`
3. the matching workflow file under `agent-assets/skills/cs-swe-v0-3/references/workflows/`
4. relevant system architecture maps under `project/architecture/` (e.g., `repo-structure-v0.3.md`, `core-session-engine.md`)

For branch/recovery context, also check:

- `project/cross-workstream/notes-and-status/2026-06-02-v0-3-recovery-todo.md`
- `project/cross-workstream/notes-and-status/2026-06-06-worktree-consolidation-plan-record-v1.md`

## Source Of Truth Pointers

- `project/` is the source of truth for project structure, recovery, plans, research notes, and architecture.
- `agent-assets/` is the source of truth for runtime-facing assets, profiles, prompts, KB copies, and skills.
- `agent-assets/skills/cs-swe-v0-3/` is the active SWE skill bundle.
- `cs-swe-v0-2/` and sibling `cs-swe-*` v0.2 folders are historical comparison material only.

## Plan-Records And Workstreams

Default workstream-local records live in:

```text
project/workstreams/{workstream}/notes-and-status/
  STATUS.md
  {YYYYMMDD}-{name}-plan-record-v{n}.md
  {YYYYMMDD}-{name}-swe-plan.md
  {YYYYMMDD}-{name}-swe-plan-items.yaml
  {YYYYMMDD}-handoff-{description}.md
```

Cross-workstream records live in:

```text
project/cross-workstream/notes-and-status/
```

Use top-level `project/plan-records/` only for migration-level, repository-level, or legacy records.

`swe-plan` may share the same `notes-and-status/` container as plan-records, but it is still a distinct artifact type.

Project-wide durable notes live in:

- `project/compound/` for decisions, learnings, tricks, and explores
- `project/brainstorms/` for central/open brainstorm records

## Uncertainty And Questions

Do not ask the user to answer questions that can be resolved by reading local docs, codes, checking files, running safe inspection commands, or looking at prior plan-records.

When a real uncertainty remains, give 2-4 realistic best guesses or options. Avoid false binaries, extreme framings, and arbitrary parameter choices. Each option should say what evidence, framing, or assumptions supports it; and be transparent about assumptions.

If the uncertainty is high-fidelity or requiring a very complex answer:

- Inspect first. 
- If it still cannot be resolved, present a small option tree with useful branches already pruned. 
- Do not force the user to own/offer a premature/detailed solution. Instead discuss the dependencies/prerequisite/timing to resolve or re-define it.

When an assumption is needed to keep moving, state it as an assumption and prefer reversible actions.

## Reference Repositories

Reference clones should live outside OneDrive when practical. Current reference repo root:

```text
D:\reference-repo
```

Do not treat reference repos as the project source of truth. They are external inputs and comparison material.

Never move, delete, or rewrite reference repos.

## Archives And Snapshots

`_archives/` is local and ignored by Git. Use it for directly openable snapshots or backups that the user wants available in the current file tree without turning them into active tracked assets.

Current relevant local snapshot:

```text
_archives/agent-assets/skills/cs-swe-v0-3-before-repair-1129b96/
```

## Version-Control Safety

Before broad edits, inspect branch and status.

Current workflow expectation:

- `reorg/v0.3-dev-run` in `%LLM_THEO_WORKTREES_ROOT%/llm-theo-v0.3-dev` is the current integration line;
- `feature/electron-bundle-verification` remains a focused packaging-verification lane;
- create another worktree only when concurrent work needs a separate checkout, dependency environment, runnable state, or risk boundary;
- merge accepted focused work back into the intended integration branch;
- do not leave a temporary feature or repair branch as the permanent main working line by accident.

Do not run destructive git commands or irreversible filesystem moves without explicit approval.

Prefer branch/commit checkpoints for recoverability.

Keep unrelated untracked files separate from the current task.

## Local Development Notes

- OneDrive-synced project folders should not host active npm installs that create real `node_modules/` trees.
- Runnable dependency-heavy worktrees should stay outside OneDrive.
- See `project/foundation/local-development-rules.md` and `project/foundation/gitignore-policy.md` for the current machine and Git policy details.
