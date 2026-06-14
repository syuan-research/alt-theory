# AGENTS.md

Keep this file short. It is the map, not the encyclopedia.

Use it to find the right project docs, active skill bundle, recovery files, and safety rules. Deeper detail belongs in the linked files under `project/` and `agent-assets/`.

## Project Purpose

This worktree is the clean `v0.3` reorganization lane for Alt Theory. Alt Theory is an academic research project on the use of 2026 advanced agentic AI tool for social science education, with both swe and empirical research. 

Current emphasis:

- keep the old `llm-theo-v0.2` repo intact while building a cleaner `v0.3` structure;
- use `cs-swe-v0-4` as the active SWE-only skill bundle;
- separate project records, agent assets, evaluation work, and reference repositories more cleanly;
- keep OneDrive-safe project history while moving dependency-heavy or reference-heavy material outside OneDrive when needed.

## Quick Tree

```text
project/
  README.md
  architecture/
  foundation/
  workstreams/
  compound/
  brainstorms/
  cross-workstream/

agent-assets/
  README.md
  kb/
  role-presets/
  prompts/
  skills/

alt-theory-app/
references-to-legacy-materials/
_archives/               # local ignored snapshots only
```

## Read First

Start with:

1. [%LLM_THEO_WORKTREES_ROOT%/AGENTS.md](file:///%LLM_THEO_WORKTREES_ROOT%/AGENTS.md) for top-level tree routing
2. [%LLM_THEO_WORKTREES_ROOT%/README.md](file:///%LLM_THEO_WORKTREES_ROOT%/README.md) for worktree path and branch context
3. `project/README.md`
4. `agent-assets/README.md`
5. the relevant workstream under `project/workstreams/`
6. the relevant workstream-local or cross-workstream file under `notes-and-status/`

Current manual-restructure note: after the 2026-06-08 cleanup, this dev
worktree intentionally keeps software/dev records and runtime-facing assets,
while bulk research/evaluation material is being split out of this repo. The
backend now loads current runtime-facing assets from `agent-assets/`.

For software coding work, read:

1. `agent-assets/skills/cs-swe-v0-4/SKILL.md`
2. `agent-assets/skills/cs-swe-v0-4/references/shared-conventions.md`
3. the matching workflow file under `agent-assets/skills/cs-swe-v0-4/references/workflows/`
4. relevant system architecture maps under `project/architecture/` (e.g., `repo-structure-v0.3.md`, `core-session-engine.md`)

For branch/recovery context, also check:

- `project/cross-workstream/folder-and-worktree-management/notes-and-status/2026-06-02-v0-3-recovery-todo.md`
- `project/cross-workstream/folder-and-worktree-management/notes-and-status/2026-06-06-worktree-consolidation-plan-record-v1.md`

## Source Of Truth Pointers

- `project/` is the source of truth for project structure, recovery, plans, dev-facing workstream records, and architecture.
- `agent-assets/` is the source of truth for runtime-facing assets, role presets, prompts, KB copies, and skills.
- `agent-assets/skills/cs-swe-v0-4/` is the active SWE skill bundle.
- `agent-assets/skills/cs-swe-v0-3/` is the previous active bundle and should
  be treated as comparison/history unless the user explicitly asks to inspect
  it.
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

Cross-workstream records must live inside a named cross-workstream domain. Do
not create a `notes-and-status/` container directly under `cross-workstream/`.

Current named cross-workstream domains include:

```text
project/cross-workstream/folder-and-worktree-management/notes-and-status/
project/cross-workstream/skill-cs-swe-adaptation/notes-and-status/
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

If using Codex in this linked-worktree repo, prefer unsandboxed/escalated Git
commands for operations that touch index or objects. Sandboxed Codex Git may
leave a zero-byte `index.lock` under the bare git store and cause repeated lock
warnings even when no real Git process is running.

Current workflow expectation:

- `reorg/v0.3-dev-run` in `%LLM_THEO_WORKTREES_ROOT%/llm-theo-v0.3-dev` is the current integration line;
- `feature/electron-bundle-verification` remains a focused packaging-verification lane;
- create another worktree only when concurrent work needs a separate checkout, dependency environment, runnable state, or risk boundary;
- merge accepted focused work back into the intended integration branch;
- do not leave a temporary feature or repair branch as the permanent main working line by accident.

Do not run destructive git commands or irreversible filesystem moves without explicit approval.

Prefer branch/commit checkpoints for recoverability.

Keep unrelated untracked files separate from the current task.

## Git Ignore Policy

Use `.gitignore` as a safety filter, not as the project structure rule.

Current policy:

- default to tracking normal repository source, docs, architecture, curated
  assets, config templates, and workstream records;
- ignore generated dependencies, build/cache/test output, logs, local scratch
  files, secrets, local environment files, runtime/session data, local archives,
  and private/raw research or user data;
- do not use a root-level whitelist that silently hides new valid directories;
- do not use ignore rules to hide invalid folder placement. If a file is in the
  wrong project area, move it or record the issue instead;
- before broad commits, check both `git status --short` and ignored files when
  relevant, and use `git check-ignore -v <path>` when a file expected for Git is
  missing.

The external research tree `<external-research-tree>` has its own
Git/privacy/sync policy and may later have its own `AGENTS.md`. Do not assume
material is shareable or tracked just because another coding-agent workdir can
read it.

## Public-Branch Privacy

Treat tracked files in this dev tree as future public-branch material.

- In plan-records, acceptance reports, architecture docs, README files, and
  compound records, replace personal absolute paths with variables or
  placeholders before considering a file ready for commit.
- Keep project-internal paths when they are useful, but prefer repo-relative
  paths where practical. For machine-local paths use placeholders such as
  `%USERPROFILE%`, `%APPDATA%`, `%LOCALAPPDATA%`, `%TEMP%`,
  `%LLM_THEO_DEV_ROOT%`, `%LLM_THEO_RESEARCH_ROOT%`, `<INSTITUTION>`, or
  `<external-research-tree>`.
- Do not record plaintext keys, tokens, account identifiers, institution
  details, user names, private transcript text, or personal directory names
  unless the user explicitly says that exact detail is safe to publish.
- Evidence generated from browser/UAT, live model calls, local logs, screenshots,
  JSONL transcripts, or external folders should stay ignored by default. Track a
  sanitized summary or acceptance note instead of the raw evidence unless the
  user explicitly asks to curate and sanitize the raw artifact.
- If raw evidence should be kept privately for later local recovery, archive it
  under `_archives/private-evidence/{workstream}/{YYYYMMDD}-{slug}/` and record
  only a sanitized local archive pointer in tracked docs. See
  `project/foundation/private-evidence-policy.md`.
- Before broad commits that touch records, scan for obvious personal path and
  secret patterns such as `C:\Users\`, `%USERPROFILE%` expansions,
  institution OneDrive names, `api_key`, `token`, and local paths outside this
  repo.

## Local Development Notes

- OneDrive-synced project folders should not host active npm installs that create real `node_modules/` trees.
- Runnable dependency-heavy worktrees should stay outside OneDrive.
- See `project/foundation/local-development-rules.md`,
  `project/foundation/gitignore-policy.md`, and
  `project/foundation/private-evidence-policy.md` for the current machine, Git,
  and private evidence policy details.
