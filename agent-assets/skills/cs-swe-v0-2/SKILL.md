---
name: cs-swe-v0-2
description: CodeStable-derived SWE workflow router and shared context for Alt Theory v0.3. Use for software-engineering feature, bug/issue, and refactor work when future coding agents need strong process guardrails, design/implementation/acceptance separation, issue report/analyze/fix discipline, scoped changes, or CS-raw SWE taste adapted to project paths. Do not use for research, evaluation design, content work, or agent-asset authoring unless that work includes actual code changes.
---

# CS-SWE v0.2

This is the Alt Theory v0.3 SWE-only adaptation of CodeStable. It copies and adapts CodeStable's engineering workflow details rather than summarizing them loosely.

Use this skill as the router and context entry for:

- new software features;
- bug fixes and regressions;
- behavior-preserving refactors;
- engineering learnings that arise from code work.

Do not use it for literature research, evaluation framework design, sim-user content, prompt/KB authoring, theory notes, or general project planning unless the immediate task is code-level SWE work.

## Startup

Read:

1. `agent-assets/skills/cs-swe-v0-2/references/startup-context.md`
2. `agent-assets/skills/cs-swe-v0-2/references/shared-conventions.md`
3. The specific downstream skill for the task.

If the task is not clearly SWE, stop using CS-SWE and route to ordinary project docs, the plan-record skill/rules, or the relevant eval/research record. Do not route to `cs-modified-v0-1`; that was an incorrect intermediate artifact and is not an active skill.

## Route

| Situation | Use |
|---|---|
| User has a coding idea but the real problem, boundary, or success condition is unclear | `cs-swe-brainstorm-v0-2` |
| User wants a new code capability or app behavior | `cs-swe-feat-v0-2` |
| User reports a bug, error, regression, or broken behavior | `cs-swe-issue-v0-2` |
| User wants behavior-preserving cleanup, restructuring, or technical-debt reduction | `cs-swe-refactor-v0-2` |
| Task is tiny and user explicitly asks for direct execution | You may implement directly, but still apply the CS-SWE guardrails: minimal change, no side fixes, clear verification, and no hidden scope expansion. |
| Task is research/eval/content/asset authoring without code changes | Do not use CS-SWE. |

## Non-Negotiable SWE Guardrails

- Do not let a coding agent jump from vague request to code when design is needed.
- Keep feature design, implementation, and acceptance separate unless the task is explicitly tiny.
- Route vague feature ideas through brainstorm/intent before design.
- Keep issue report, analysis, and fix separate unless the root cause is obvious, the fix is tiny, and the user accepts the fast path.
- Do not mix feature work and bug fixing in one change unless the user explicitly approves the scope.
- Do not perform side refactors, neighbor cleanup, or "while here" improvements inside feature/issue work.
- When design/checklist artifacts exist, implementation must follow them or stop and revise them.
- Acceptance means checking against the design/issue promise, not merely seeing green tests.

## Current Paths

CS-SWE v0.2 writes workflow artifacts under:

```text
project/workstreams/swe/features/
project/workstreams/swe/issues/
project/workstreams/swe/refactors/
project/workstreams/swe/compound/
```

Shared skill references and tools live under:

```text
agent-assets/skills/cs-swe-v0-2/references/
agent-assets/skills/cs-swe-v0-2/tools/
```

Project architecture remains under:

```text
project/architecture/
```

## Deferred CodeStable Areas

This v0.2 does not fully port CodeStable requirements, roadmap, guides, libdocs, audits, notes, or full onboarding.

When a copied raw workflow says to trigger one of those deferred flows, do not invent the missing flow. Instead:

- record the observation in the current feature/issue/refactor artifact;
- update `project/architecture/` only when current architecture truly changed;
- update a plan-record or workstream brief for unresolved planning;
- ask the user before creating a new durable process area.

## Acceptance Standard For This Skill Set

CS-SWE v0.2 is acceptable only if a future coding agent can answer:

- Which SWE workflow applies?
- Which current project paths to use?
- Which raw CodeStable details are preserved?
- Which raw CodeStable handoffs are deferred?
- What must be checked before implementation and before acceptance?
- What should not be done inside the current scope?

See `references/acceptance-criteria.md`.



