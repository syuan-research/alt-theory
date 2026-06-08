# Brainstorm Workflow

Use when a coding idea is not yet ready for feature design.

Brainstorm is a thinking space, not an implementation commitment. It is also
not a route factory. In v0.4, first apply gates, then choose one of three real
landing paths.

## Gates Before Routing

Out-of-scope gate:

- If the discussion is research/eval/content/theory without immediate
  code-level SWE work, CS-SWE does not own it. Suggest the relevant research,
  evaluation, plan-record, or central brainstorm path, but do not force CS-SWE
  artifacts.

Issue/refactor gate:

- Bugs, regressions, broken behavior, errors, or unexpected output go to issue.
- Behavior-preserving cleanup goes to refactor.

Compound gate:

- Stable lessons, decisions, tricks, or exploration findings may be
  compound-worthy candidates, but do not write `project/compound/` unless the
  user explicitly asks or that workflow is opened.

## Real Landing Paths

| Landing | Use When | Output |
|---|---|---|
| Plan-record continuation | The value is current session recovery, stage evolution, user decision trace, or strategy convergence. | Update the relevant plan-record. |
| Feature-local brainstorm | An existing feature context, active feature workflow, or `swe-plan` child feature already anchors the idea. | `{artifact_root}/features/YYYY-MM-DD-{slug}/{slug}-brainstorm.md` |
| Central brainstorm | Open engineering idea without a concrete feature anchor. This is the default for independently recoverable brainstorming. | `project/brainstorms/YYYY-MM-DD-brainstorm-{slug}.md` |

Do not route to `swe-plan` as a brainstorm landing path. `swe-plan` is a later
promotion when the user wants multi-feature planning, shared interfaces,
dependency state, or parallel-agent coordination.

If the landing is ambiguous, give 2-3 realistic options and say what each would
preserve. The user decides.

## Pre-Chat Check Procedure

Every brainstorm run performs these checks:

1. Read `references/shared-conventions.md` and `references/record-boundaries.md`.
2. Check the relevant workstream `notes-and-status/`, existing feature folders
   under a valid `{artifact_root}`, `project/brainstorms/`, and
   `project/compound/`.
3. Search for related terms with `rg` and, when useful:
   `tools/search-yaml.py --dir project/compound --query "{keyword}"`.
4. Identify whether there is an existing feature, active feature workflow, or
   `swe-plan` child feature that anchors the idea.
5. Tell the user your best-guess landing path when it matters. Do not make a
   hard classification if the user is still shaping the problem.

## How To Talk

The agent is a thinking partner, not a scribe.

### Distinguish Stated Solution From Actual Problem

The opening request is often the solution the user imagined, not the problem to
solve. Before accepting a direction, ask what problem and scenario it is meant
to solve. Common discovery: the real problem is smaller, different, or not
actually solved by the proposed direction.

### Evaluate A User Plan Before Accepting It

When the user brings a plan:

- restate the problem implied by the plan;
- identify obvious risks, over-engineering, missing constraints, or lighter
  alternatives;
- propose 1-2 alternatives when they are real options;
- say when the plan is reasonable and should move to feature design.

Do not diverge merely to fill process.

### Conversation Rhythm

Use three actions flexibly:

1. Dig the problem until a one-sentence restatement matches.
2. Diverge into 2-3 candidate directions when the problem is still open.
3. Converge into core behavior, explicit non-goals, and biggest unknowns.

Grill mode is opt-in or triggered by strong ambiguity. Use one question plus
2-4 candidate answers per round. Stop after 3-5 useful rounds, or earlier when
the user says it is close enough.

### High-Fidelity Blockers

Some questions cannot be settled by asking the user to choose from abstract
options. In this project, "high-fidelity" is used broadly: the user may need to
see concrete details, examples, conventions, UI, runtime behavior, or spec
wording before a decision is possible.

Signals:

- the user says they cannot decide without seeing specifics;
- the answer depends on exact file/folder shape, API contract, UI flow, or
  runtime behavior;
- two rounds of option discussion keep circling because the missing evidence is
  concrete, not preference;
- the user asks for "grill-me" but the next useful move is evidence, not more
  questions.

Response:

- stop trying to force a decision in chat;
- propose a bounded explore, probe, prototype, or action-for-reflection step;
- state what evidence the step will produce and where it will be recorded;
- bring the result back to the current plan-record, central brainstorm, or
  feature/swe-plan workflow.

Do not create a full feature, issue, or compound artifact just because a
high-fidelity blocker appears. The blocker is a reason to gather grounded
evidence first.

## Spike Rules

Propose a spike only when all are true:

1. The uncertainty is factual, not preference.
2. The result will change direction.
3. You can verify it in 5-30 minutes.

Feature-local spike code goes in the feature directory. Central brainstorms do
not get a default spike directory; if a central spike needs files, ask where it
should land or use the relevant workstream/output area. Always write the result
back into the brainstorm or plan-record that motivated the spike.

## Feature-Local Brainstorm

Use only when an existing feature context anchors the idea.

Path:

```text
{artifact_root}/features/YYYY-MM-DD-{slug}/{slug}-brainstorm.md
```

Write only after the user confirms the discussion is ready to preserve. Status
is `confirmed`.

Template:

```markdown
---
doc_type: feature-brainstorm
feature: YYYY-MM-DD-{slug}
status: confirmed
summary: {one sentence on selected direction}
tags: []
---

# {Feature Name} Brainstorm

> Stage 0 | {YYYY-MM-DD} | next step: design

## What And Why
{starting point, key discoveries, and turns}

## Considered Directions

### Direction A: {name}
- Description / value / cost
- Conclusion: selected / rejected / deferred

## Settled Design Points
{Confirmed or leaning technical points that design should read without redoing.}

## Selected Direction And Open Questions
{Selected direction, non-goals, and questions deferred to design.}
```

## Central Brainstorm

Use for open engineering ideas without a concrete feature anchor.

Path:

```text
project/brainstorms/YYYY-MM-DD-brainstorm-{slug}.md
```

Template:

```markdown
---
doc_type: brainstorm
slug: {slug}
anchor: {stable human-readable topic anchor}
scope: central
status: active
created: YYYY-MM-DD
related_workstreams: []
tags: []
---

# {Topic Name}

> Central brainstorm | {YYYY-MM-DD}

## Starting Point
{What triggered this idea and why it is worth preserving separately.}

## Directions Discussed
{Candidate directions, turns, alternatives, and rejected possibilities.}

## Current Leanings
{Fuzzy or selected direction at this point.}

## Settled Points
{Consensus, constraints, non-goals, technical judgments. Delete if empty.}

## Open Questions And Next Moves
{Unknowns, possible promotion to feature design or swe-plan, and what evidence would decide.}
```

Write when the user asks to save it, says the discussion is close enough, or a
long brainstorm needs recovery protection. If it later becomes multi-feature
planning, open `swe-plan` from this brainstorm instead of retroactively
pretending the brainstorm was already a plan.

## Plan-Record Continuation

Keep the discussion in a plan-record when it mainly records:

- current session stage evolution;
- context recovery;
- action-for-reflection;
- user decision trace;
- uncertainty discovered while doing the current task.

Do not create a central brainstorm just to mirror a plan-record stage.

## Hard Boundaries

1. Do not skip the gates.
2. Do not create feature-local brainstorms without a feature anchor.
3. Do not treat `swe-plan` as a brainstorm landing path.
4. Do not write compound artifacts autonomously.
5. Do not route bugs or refactors through brainstorm.
6. Do not start design or swe-plan output inside brainstorm; stop at the
   inter-stage checkpoint.

## Common Errors

- Turning every fuzzy idea into a feature-local brainstorm.
- Treating every multi-feature idea as immediate `swe-plan`.
- Creating central brainstorms that only duplicate a plan-record stage.
- Writing `project/compound/` because a thought seems useful.
- Asking classification questions before offering realistic options.
- Acting as a scribe instead of challenging weak assumptions.
