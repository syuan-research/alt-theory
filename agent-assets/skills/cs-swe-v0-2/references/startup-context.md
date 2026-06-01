# CS-SWE Startup Context

Status: active for `cs-swe-v0-2`.

This file replaces CodeStable raw's mandatory `.codestable/attention.md` dependency for the Alt Theory v0.3 SWE adaptation.

## Scope

CS-SWE is for software engineering work only:

- app/backend/frontend code features;
- bug fixes and regressions;
- behavior-preserving refactors;
- engineering learnings from code work.

CS-SWE is not for:

- evaluation framework research;
- sim-user/persona content design;
- literature review;
- KB/prompt/soul/profile authoring unless code changes are involved;
- general migration planning without code-level SWE work.

## Required Project Context

Before SWE work, read the smallest relevant set:

1. `project/README.md`
2. `project/architecture/repo-structure-v0.3.md`
3. `project/workstreams/parallel-development-brief.md`
4. `project/foundation/local-development-rules.md` if running Node/npm/dev commands
5. relevant imported PI/frontend/backend docs under `project/research/agent-harness/` or `project/workstreams/agent-harness/`

Use `%LLM_THEO_DEV_ROOT%` for runnable Node/npm development. Do not run npm installs in OneDrive worktrees.

## User Capability Assumption

The user is not relying on prior SWE process knowledge to judge code quality. CS-SWE must therefore carry the quality guardrails:

- require design before nontrivial feature implementation;
- require root-cause analysis before nontrivial bug fixes;
- require explicit acceptance checks;
- prevent scope drift and side refactors;
- make uncertainty and workflow handoffs visible.

## Raw CodeStable Source

Source repo:

```text
https://github.com/liuzhengdongfortest/CodeStable
```

CS-SWE v0.2 is a copied/adapted fork for this project. Do not require future agents to read the raw source during normal use, but use `source-map.md` when auditing or upgrading the adaptation.



