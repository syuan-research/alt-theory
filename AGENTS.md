# AGENTS.md

## Read First

Start with:

1. `project/README.md`
2. `agent-assets/README.md`
3. the relevant workstream under `project/workstreams/`
4. the relevant plan-record or handoff under that workstream's `notes-and-status/`

For SWE coding work, read `agent-assets/skills/cs-swe-v0-3/SKILL.md`.

## Uncertainty And Questions

Do not ask the user to answer questions that can be resolved by reading local docs, checking files, running safe inspection commands, or looking at prior plan-records.

When a real uncertainty remains, give 2-4 realistic best guesses or options. Avoid false binaries, extreme framings, and arbitrary parameter choices. Each option should say:

- what evidence supports it;
- what would make it wrong;
- what it changes for the next step.

If the uncertainty is high-fidelity, inspect first. If it still cannot be resolved, present a small option tree with useful branches already pruned. Do not force the user to own a premature solution.

When an assumption is needed to keep moving, state it as an assumption and prefer reversible actions.

## Plan-Records And Workstreams

Default placement is workstream-local:

```text
project/workstreams/{workstream}/notes-and-status/
  STATUS.md
  {YYYYMMDD}-{name}-plan-record-v{n}.md
  {YYYYMMDD}-{name}-swe-plan.md
  {YYYYMMDD}-{name}-swe-plan-items.yaml
  {YYYYMMDD}-handoff-{description}.md
```

Use `project/cross-workstream/notes-and-status/` for records that explicitly coordinate multiple workstreams.

Use top-level `project/plan-records/` only for migration-level, repository-level, or legacy records that do not belong cleanly inside one workstream or the cross-workstream area.

A plan-record preserves session/few-session continuity, context recovery, action-for-reflection, and problem/solution co-evolution. It does not replace concrete workflow artifacts such as feature design, issue analysis, refactor scan/apply notes, brainstorm records, compound records, or eval outputs. `swe-plan` can share the same `notes-and-status/` container, but it remains a distinct artifact type.

## CodeStable-Derived SWE Work

Use `agent-assets/skills/cs-swe-v0-3/SKILL.md` for code-level feature, issue, refactor, architecture, and `swe-plan` work.

Do not use v0.2 CS-SWE folders or `cs-modified-v0-1` as active rules. They are historical evidence only.

`roadmap` is not the active SWE workflow term here. Use `swe-plan` for CodeStable raw roadmap-like multi-feature engineering plans.

Use `project/compound/` for CodeStable-derived decision, learning, trick, and explore records. Use `project/brainstorms/` for central/open brainstorm records; feature-local brainstorms remain inside their feature directory.

## Reference Repositories

Reference clones should live outside OneDrive sync when practical. Current chosen location:

```text
D:\reference-repo
```

Do not move, delete, or rewrite cloned repos automatically. Report candidates and let the user move them manually unless explicitly asked.

Project-scoped runnable worktrees should also stay outside OneDrive when they have dependency folders, build caches, or long-running dev servers.

## Version-Control Safety

Before broad edits, inspect branch and status.

Do not run destructive git commands or irreversible filesystem moves without explicit approval.

Prefer branch/commit checkpoints for recoverability. If a repair branch is accepted, merge it back into the intended development branch rather than copying files by hand.

Keep unrelated untracked files separate from the current task.
