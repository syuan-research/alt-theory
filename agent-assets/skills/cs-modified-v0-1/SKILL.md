---
name: cs-modified-v0-1
description: Lightweight project-specific adaptation of CodeStable for Alt Theory v0.3. Use when an agent needs to place or update project records, migrate legacy docs, distinguish plan-records from architecture/roadmap/decisions, brief parallel agents, or apply CodeStable ideas without creating a full `.codestable/` skeleton.
---

# CS Modified v0.1

This is a project-scoped skill for Alt Theory v0.3. It adapts CodeStable ideas without adopting the full `.codestable/` directory tree.

## Startup

Do not require `.codestable/attention.md`.

Read only what the task needs:

- repo structure: `project/architecture/repo-structure-v0.3.md`;
- parallel-agent context: `project/workstreams/parallel-development-brief.md`;
- legacy source finding: `project/foundation/legacy-index.md`;
- short-term session continuity: relevant files under `project/plan-records/`;
- evaluation context: `evals/README.md` and `evals/sim-user-eval-startup.md` when eval/sim-user work is in scope.

If these files disagree, treat the newer, more specific current doc as the working guide and record the conflict instead of silently choosing.

## Core Adaptation

Keep CodeStable's useful separations:

- capability vision: what ability the system should provide and why;
- current architecture: what the system currently is;
- roadmap/planning: possible future implementation path;
- feature/issue work: a concrete action;
- decision: a settled long-term constraint or choice;
- learning/trick/explore: reusable evidence or practice.

Do not copy CodeStable's full path scheme unless the user explicitly approves it. Current v0.3 paths are:

- `project/architecture/` for current structure, runtime architecture, and architecture rationale;
- `project/plan-records/` for one-session or few-session evolving plans;
- `project/workstreams/` for active or near-active stream briefs, status docs, and demand-driven migration notes;
- `project/foundation/` for durable origin, principles, and legacy orientation;
- `project/research/` for decision-relevant research and candidate-skill reports;
- `evals/` for evaluation protocols, rubrics, sim-user assets, and cleaned/anonymized reports;
- `agent-assets/` for runtime agent behavior assets, prompts, KB, profiles, and project-scoped skills.

## Placement Rules

Use the lightest durable place that matches the content.

- If the content answers "what is true about the current system?", put or revise it under `project/architecture/`.
- If it answers "what are we doing in this session or next few sessions?", put it in `project/plan-records/`.
- If it briefs a parallel frontend/backend/eval stream, put it under `project/workstreams/`.
- If it helps find, classify, or preserve old material, update `project/foundation/legacy-index.md`.
- If it is imported evidence, keep `.imported.md` in the filename unless it has been revised into a current doc.
- If it is raw/private evaluation data, do not track it by default. Use ignored raw/private locations and commit only reviewed summaries or protocols.
- If it is a runtime agent behavior asset, put it under `agent-assets/`, not root `AGENTS.md` or root `CLAUDE.md`.

Avoid creating new top-level or CodeStable-like directories just because the category exists in upstream CodeStable. Create a new folder only when at least one concrete file needs it now.

## Decision Rules

Only record a permanent decision when it is actually settled.

For unsettled topics, write one of:

- a plan-record observation;
- a workstream brief note;
- an architecture caveat;
- a legacy-index mapping;
- an eval startup note.

Do not make discussion look like policy. If a future agent needs a stronger rule, it should state the evidence and ask the user or update a current doc after implementation.

## Eval And Sim-User Rule

Evaluation is not a late appendix. For v0.3 it is near-term and conference-relevant.

Treat old sim-user profiles as test-system material, not runtime profiles. They may be useful as contrastive evidence, but the next eval stream should update them against new literature, LLM-as-judge criteria, and user/friend testing plans.

## What To Avoid

- Do not create `.codestable/` by default.
- Do not force every task into feature/issue/roadmap stages.
- Do not require a full req/roadmap/design/acceptance chain for small migration or documentation tasks.
- Do not write future plans into current architecture.
- Do not turn imported legacy docs into current policy without review.
- Do not ask the user questions that can be answered by inspecting files, Git status, or existing docs.

## Exit Check

Before finishing a task using this skill, verify:

- the record went to the smallest matching current location;
- any uncertainty is visible;
- current facts, future plans, and imported evidence are not mixed;
- raw/private data was not tracked by accident;
- a future frontend/backend/eval agent can tell where to continue.
