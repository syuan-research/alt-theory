# Feature Workflow

Use for a single new code capability or app behavior.

## Flow

```text
brainstorm or intent if needed -> design -> implementation -> acceptance
```

Do not use feature workflow for bugs or behavior-preserving refactors.

## Feature Path

```text
{artifact_root}/features/YYYY-MM-DD-{slug}/
  {slug}-intent.md
  {slug}-brainstorm.md
  {slug}-design.md
  {slug}-checklist.yaml
  {slug}-acceptance.md
```

Only create files that are needed. A clear feature can start directly at design.

## Design Gate

Before implementation, the design should answer:

- what user/system behavior changes;
- explicit non-goals;
- terminology and conflict checks;
- current state vs intended change;
- key entities/interfaces;
- orchestration/control flow;
- mount points or "no new mount point";
- structure health / micro-refactor decision;
- acceptance scenarios.

If the feature starts from a `swe-plan`, read the plan first and include:

```yaml
swe_plan: {swe-plan-slug}
swe_plan_item: {child-feature-slug}
swe_plan_path: {artifact_root}/plans/{swe-plan-slug}/
```

Then treat the `swe-plan` interface/protocol section as hard input.

## Checklist

Create `{slug}-checklist.yaml` with implementation steps and checks:

```yaml
feature: YYYY-MM-DD-{slug}
created: YYYY-MM-DD

steps:
  - action: "{implementation slice}"
    exit_signal: "{observable exit signal}"
    status: pending

checks:
  - item: "{acceptance or scope check}"
    source: design
    status: pending
```

Steps should be implementation slices, not vague intentions. Four to eight steps is usually enough.

## Implementation

- Follow the checklist in order.
- Do not silently add scope.
- Stop and revise design when a design gap appears.
- Bugs found during feature work become issue observations unless the user approves including the fix.
- Refactors must be behavior-preserving and explicitly listed.

Reflection triggers:

- adding code to an already large file;
- adding another method to a catch-all class;
- copy-pasting logic;
- adding a special-case branch;
- creating a generic helper because no owner is obvious.

## Acceptance

Acceptance checks implementation against the design promise:

- feature behavior;
- explicit non-goals;
- checklist completion;
- relevant tests/manual checks;
- architecture update only if implementation created current system structure;
- `swe-plan` writeback if the feature came from a plan with state tracking.

Tests are evidence, not the whole acceptance.
