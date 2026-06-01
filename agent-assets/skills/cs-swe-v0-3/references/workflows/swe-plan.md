# SWE Plan Workflow

This adapts CodeStable raw `roadmap` mechanics under the v0.3 term `swe-plan`.

## When To Use

Use `swe-plan` when at least one is true:

- the demand is too large for one feature;
- several child features share interfaces, protocols, data structures, routes, events, or state schema;
- multiple coding agents may work in parallel;
- dependency order matters;
- child feature acceptance should update a shared plan.

Do not use it for a single feature, bug, refactor, research plan, or long-horizon project roadmap.

## Inputs

Read:

- `../shared-conventions.md`
- `../record-boundaries.md`
- relevant current architecture docs;
- relevant workstream notes or plan-records only for context and problem evolution;
- any brainstorm or requirement-like source material that the user points to.

## Output Path

Use:

```text
{artifact_root}/plans/{swe-plan-slug}/
  {swe-plan-slug}-swe-plan.md
  {swe-plan-slug}-items.yaml    # optional
  drafts/                       # optional
```

## Main Document Structure

```markdown
---
doc_type: swe-plan
slug: {slug}
status: active
created: YYYY-MM-DD
last_reviewed: YYYY-MM-DD
workstream: {workstream}
artifact_root: {artifact_root}
items_yaml: true | false
source_plan_records: []
source_brainstorms: []
requirement_refs: []
architecture_refs: []
tags: []
---

# {Title}

## 1. Background

## 2. Scope And Non-Goals

## 3. Module / Component Decomposition

## 4. Interface Contracts / Shared Protocols

## 5. Child Feature Seeds

## 6. Minimal Runnable Loop

## 7. Observations / Risks

## 8. Acceptance And Writeback
```

## Drafting Discipline

Do module/component thinking before child-feature splitting.

Interface contracts must be specific enough for feature design to treat them as hard input:

- function signatures;
- API routes and fields;
- event payloads;
- data/state schema;
- component props/events;
- file protocol;
- or explicit "no cross-feature interface".

Each child feature must be independently designable, implementable, and acceptable through the feature workflow.

Dependency reasons must name the artifact supplied by the dependency. Avoid "A before B" without saying why.

## Optional Items YAML

Use only when useful:

```yaml
swe_plan: {slug}
created: YYYY-MM-DD
workstream: {workstream}
artifact_root: {artifact_root}

items:
  - slug: {child-feature-slug}
    description: {one sentence}
    depends_on: []
    dependency_reason: null
    status: planned        # planned | in-progress | done | dropped
    feature: null
    minimal_loop: true
    notes: null
```

Validate when present:

```powershell
python {skill_dir}\tools\validate-yaml.py --file {path-to-items-yaml} --yaml-only
```

## Child Feature Handoff

When starting a child feature:

1. Read the `swe-plan` main document.
2. Read `items.yaml` if it exists.
3. Treat interface contracts as hard design input.
4. Use feature design frontmatter:

```yaml
swe_plan: {swe-plan-slug}
swe_plan_item: {child-feature-slug}
swe_plan_path: {artifact_root}/plans/{swe-plan-slug}/
```

If `items.yaml` exists, feature design marks the item `in-progress`; feature acceptance marks it `done`.

If the plan contract is wrong or missing, update the `swe-plan`; do not bypass it inside a child feature.
