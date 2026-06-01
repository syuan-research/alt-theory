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

Do module/component thinking before child-feature splitting. Without clear architecture first, each feature reinvents wheels and interfaces don't align.

Interface contracts must be specific enough for feature design to treat them as hard input:

- function signatures (with parameter types and return types);
- API routes and fields (request/response shapes, error codes);
- event payloads (schema, required vs optional fields);
- data/state schema (constraints like "reason must be null when allowed=true");
- component props/events;
- file protocol;
- behavioral constraints (e.g., "caller must ensure user_id is authenticated", "event must be consumed idempotently");
- or explicit "no cross-feature interface" (never blank or "待定" — if no interface exists, say so explicitly).

Each child feature must be independently designable, implementable, acceptable, and **verifiable** — can you write "after completion, {specific observable phenomenon}"?

Dependency reasons must name the artifact supplied by the dependency. Avoid "A before B" without saying why. Dependency graph must be acyclic — no A→B→A loops.

Don't prioritize for the user beyond technical dependencies. Let the user decide ordering that isn't driven by dependency.

## Per-Module Guidance

When writing section 3 (Module / Component Decomposition), each module should state:

- one-sentence responsibility;
- which child features it carries;
- which existing code/modules it touches.

If decomposition is unnecessary (pure internal behavior change to one module), write explicitly: "This demand completes within existing module X" and skip section 4.

## Minimal Runnable Loop

Section 6 should identify the **narrowest end-to-end path**, not the easiest item. Ask: is this truly the narrowest path that runs end-to-end, or just the one with least effort?

## Non-Goals

Each non-goal in section 2 should state a reason or point to another plan/requirement. Don't just list items without context.

## Observations / Risks

Use section 7 for:

- conflicts with existing requirements or architecture (surface them, don't silently pick a side);
- discoveries that might affect other child features;
- technical risks visible at plan level.

Do not use the plan to modify requirements or architecture. If a conflict exists, record it and flag for user decision.

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

## Update Considerations

When updating an existing swe-plan (add/reorder/drop child features):

- New or changed items must trace to source material. Don't add items just to "look more complete" — that's scope drift.
- If interface contracts change, assess impact on in-progress or done child features. Flag affected items as observations for the user.
- Dropped items must include a reason. Don't silently delete — preserve the rationale.
- Discovery during feature-design that scope is actually multi-feature: step back to swe-plan, decompose, then continue.

## Common Mistakes

- **Grain mismatch**: one item holds three independent features, another only changes a config. If so, re-split.
- **Plan drifts into single-feature detail**: the plan defines shared constraints and child seeds. Single-feature implementation details belong in feature design, not swe-plan.
- **Missing requirement-disguised items**: "change the boundary of capability X" is a requirement change, not a feature. Redirect to requirement workflow.
