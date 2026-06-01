---
name: cs-swe-v0-3
description: Active Alt Theory v0.3 CodeStable-derived software-engineering skill bundle. Use for coding features, bugs/issues, behavior-preserving refactors, and multi-feature SWE plans when the agent needs concrete design, implementation, acceptance, issue, refactor, or swe-plan guardrails. Do not use for research/eval planning, theory notes, prompt/KB authoring, agent soul/profile work, or general session continuity unless the immediate task includes code-level SWE work.
---

# CS-SWE v0.3

This skill folder is the bundle. Internal files are referenced by relative paths inside this folder, not by versioned project paths that embed the bundle name.

Use this skill for software engineering only. It carries CodeStable-style workflow discipline for coding agents: feature design, implementation discipline, issue/root-cause work, refactor discipline, acceptance, and multi-feature `swe-plan` handoff.

## Startup

Read:

1. `references/shared-conventions.md`
2. `references/record-boundaries.md`
3. the workflow file that matches the task:
   - `references/workflows/brainstorm.md`
   - `references/workflows/feature.md`
   - `references/workflows/feature-impl.md`
   - `references/workflows/feature-acceptance.md`
   - `references/workflows/issue.md`
   - `references/workflows/refactor.md`
   - `references/workflows/swe-plan.md`
   - `references/workflows/decide.md`
   - `references/workflows/learn.md`
   - `references/workflows/explore.md`
   - `references/workflows/trick.md`
   - `references/workflows/arch.md`

v0.2 skill folders are historical action-for-reflection evidence. Do not route new work to v0.2. `cs-modified-v0-1` was a wrong-path artifact and must not be used as a skill.

## Route

| Situation | Use |
|---|---|
| Coding idea is fuzzy and may become a feature or multi-feature plan | `references/workflows/brainstorm.md` |
| Single new code capability or app behavior — design phase | `references/workflows/feature.md` |
| Feature design approved, ready to implement | `references/workflows/feature-impl.md` |
| Feature implementation complete, acceptance needed | `references/workflows/feature-acceptance.md` |
| Bug, regression, broken behavior, error, or unexpected output | `references/workflows/issue.md` |
| Behavior-preserving cleanup/restructure/technical debt | `references/workflows/refactor.md` |
| Multi-feature SWE demand with shared interfaces, dependencies, or parallel agents | `references/workflows/swe-plan.md` |
| Record a settled technical decision, constraint, or convention | `references/workflows/decide.md` |
| Record a pitfall or best practice from coding work | `references/workflows/learn.md` |
| Directed code exploration to capture evidence | `references/workflows/explore.md` |
| Record a reusable pattern, library usage, or technique | `references/workflows/trick.md` |
| Architecture doc maintenance (update/check/backfill) | `references/workflows/arch.md` |
| Tiny, explicit, low-risk code change | Direct implementation is allowed, but still apply the guardrails below. |
| Research/eval/content/agent-asset work without code changes | Do not use CS-SWE. |

## Guardrails

- Do not jump from vague request to code when design is needed.
- Keep feature design, implementation, and acceptance separate unless the task is explicitly tiny.
- Keep issue report, analysis, and fix separate unless root cause is obvious, the fix is tiny, and risk is low.
- Keep behavior-preserving refactors separate from features and bug fixes.
- Do not perform side refactors, neighbor cleanup, or "while here" improvements inside feature/issue work.
- When design/checklist artifacts exist, implementation follows them or stops to revise them.
- Acceptance checks against the design/report promise, not merely green tests.
- If a multi-feature demand has shared contracts or dependency state, use `swe-plan`; do not hide that coordination in chat.

## v0.3 Decisions

- CodeStable raw `roadmap` semantics are renamed to `swe-plan`.
- `roadmap` is not the active SWE workflow term in this project.
- Plan-record is not feature design/checklist/acceptance.
- Requirements are reference material only unless the user opens a separate requirement workflow.
- Central brainstorm records are allowed but not forced; a plan-record can keep discussion when that is enough.
- Agent-asset archives belong in ignored `_archives/`, not in `project/private/` by default.

## Folder Shape

Current v0.3 layout:

```text
cs-swe-v0-3/
  SKILL.md
  references/
    shared-conventions.md
    record-boundaries.md
    source-map.md
    workflows/
      brainstorm.md
      swe-plan.md
      feature.md
      feature-impl.md
      feature-acceptance.md
      issue.md
      refactor.md
      decide.md
      learn.md
      explore.md
      trick.md
      arch.md
    refactor/
      methods.md
      refusal-routing.md
      scan-checklist-format.md
  tools/
    search-yaml.py
    validate-yaml.py
```

The point of this layout is version maintenance: internal links stay relative when the whole `cs-swe-v0-3/` folder is copied or revised.
