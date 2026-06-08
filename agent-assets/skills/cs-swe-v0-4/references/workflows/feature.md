# Feature Design

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

---

## Design Entries

Three entry modes:

| Mode | Trigger | Action |
|---|---|---|
| **Standard** | User describes clear requirements or has filled intent.md | Read inputs, write full design |
| **Initialization** | User says "start a new feature / set up a draft" | Create directory + empty intent.md, then stop. User fills intent offline, returns for design later |
| **From swe-plan item** | User says "start swe-plan item {child-feature-slug}" | Read swe-plan main doc + items.yaml, then standard design with plan contracts as hard input |

### Initialization Mode

1. Quick align with user: one-sentence requirement summary + confirm slug
2. Create `{artifact_root}/features/YYYY-MM-DD-{slug}/` directory
3. Write empty intent.md template:

```markdown
---
doc_type: feature-intent
feature: YYYY-MM-DD-{slug}
status: draft
summary: {one-sentence requirement}
---

# {slug} intent

## Background / Why

(One sentence)

## Rough approach

(~100 words describing idea, key steps / data flow)

## Related data structures / types

(Paste relevant types, interface signatures, or point to code locations)

## Known non-goals / TBD

(Optional: explicit boundaries or unclear areas)
```

4. Tell user "skeleton ready, come back after filling intent", then **stop**. Do not continue to design.

### From swe-plan Item

1. Read swe-plan main document + items.yaml
2. Target item must be `status: planned` + all `depends_on` items `done`. Otherwise stop and report
3. **Must read plan section "Module / Component Decomposition" and "Interface Contracts / Shared Protocols"** — these are hard constraints for this feature. Contracts unreasonable or missing → stop, suggest going back to swe-plan update. Do not bypass inside feature design
4. Slug comes from swe-plan, feature directory `YYYY-MM-DD-{child-feature-slug}`, do not create new slug
5. Design frontmatter includes:

```yaml
swe_plan: {swe-plan-slug}
swe_plan_item: {child-feature-slug}
swe_plan_path: {record_root}/notes-and-status/YYYY-MM-DD-{swe-plan-slug}-swe-plan.md
```

6. On design approval, writeback items.yaml: corresponding item `status: in-progress` + `feature: YYYY-MM-DD-{slug}`, validate yaml

---

## Design Gate

Before implementation, the design should answer:

- what user/system behavior changes
- explicit non-goals
- terminology and conflict checks
- current state vs intended change
- key entities/interfaces
- orchestration/control flow
- mount points or "no new mount point"
- structure health / micro-refactor decision
- acceptance scenarios

### Design Document Structure

Design document template and section writing guide: `references/feature-design-template.md`

### Writing Principles

1. **Each section fits one screen** — if it doesn't, cut or split
2. **Lock terminology first** — grep code/architecture/historical features before writing to prevent conflicts
3. **Examples before definitions** — interface behavior starts with input→output example, complex cases get formal types later
4. **One fact in one place** — duplicate statements are worse than missing ones
5. **New logic defaults to new file** — the bigger a file gets, the harder it is to separate responsibilities

### Three Drafting Disciplines

1. **Don't decide for the user** — declare assumptions explicitly as "Assumption: ..."; give 2-3 options instead of self-selecting; stop when unclear rather than guessing
2. **Write verifiable goals and constraints** — not "make it work" but "input A returns B"; non-goals specific enough to grep or test-check, not "no over-engineering"
3. **Every feature must be uninstallable** — answer "if you remove it, what do you remove?" If you can't answer, boundaries aren't clear

---

## Checklist

Create `{slug}-checklist.yaml` with implementation steps and checks:

```yaml
feature: YYYY-MM-DD-{slug}
created: YYYY-MM-DD

steps:
  - action: "{paradigm-dimension slice}: {action description}"
    exit_signal: "{observable exit signal}"
    status: pending

checks:
  - item: "{acceptance or scope check}"
    source: design
    status: pending
```

Steps should be paradigm-dimension slices, not vague intentions. 4-8 steps is typical.

When design section 2.5 concludes "micro-refactor", **step 1 is always the micro-refactor** with independent exit signal (compiler green + existing tests pass + behavior-relevant diff is zero), run before feature body steps.

Checks extract from design sections:
- Noun contract ← section 2.1 key interface signatures
- Orchestration skeleton / flow constraints ← section 2.2 main flow steps, flow-level constraints
- Mount points ← section 2.3 each mount point
- Scope guard ← section 1 "explicit non-goals" each item
- Acceptance scenarios ← section 3 "key scenario list" each item

Do not fabricate items not in design.

---

## Design Startup Check

### Gate

Before drafting, verify minimum input contains: user goal / core behavior / success criteria / explicit non-goals. Missing → supplement or fall back to brainstorm.

### Required checks (5 items)

1. **Placement thinking** — Before writing noun/orchestration layers, answer: which existing module should this feature belong to? Cross-module? New module? Grep for similar names to avoid duplication
2. **Continuation check** — Glob for existing `{slug}-design.md`, `{slug}-intent.md`, `{slug}-brainstorm.md`:
   - intent/brainstorm: read as input, don't re-ask settled points
   - design `status=draft` with sections mostly complete → skip to whole-document review
   - design sections missing → fill gaps, report "last written to X, completing unified review"
   - design `status=approved` → don't overwrite by default, ask user whether to continue or new slug
3. **Global input scan** — Glob `{artifact_root}/` for available directories and document types:
   - `architecture/` → read ARCHITECTURE.md + index + relevant subsystem docs, focus on noun reuse and flow constraints
   - `project/compound/` → search for related decisions/explores/tricks/learnings; conflicting decisions must be addressed
   - `features/` → search historical designs for similar features
4. **Read relevant code** — which files to read determined by requirement signals
5. **Confirm entry mode with user** — standard / initialization / from swe-plan

### Signal-triggered checks (skip if no signal)

- **Terminology grep** — new concept name not seen in code/architecture/history → grep; conflict → rename or distinguish in section 0
- **Complexity tier alignment** — requirement mentions "external SDK / high concurrency / one-time tool" etc. → check deviation points; no signal → write "using default tier"

---

## Whole-Document Review

Design written as complete document, **not piecewise**. Piecewise review means user can't see cross-section problems like "section 1 scope doesn't match section 2 changes".

Review prompt:

> Design document drafted, please review as a whole:
> 1. Any terminology conflicts with existing concepts?
> 2. Section 1 decisions and constraints accurate? Non-goals complete?
> 3. Section 2.1 noun layer: current state descriptions correct? Changes cover all data/interface changes?
> 4. Section 2.2 orchestration: flow diagram and current→change runnable through your mental scenarios? Flow constraints complete?
> 5. Section 2.3 mount points: can you fully uninstall following this list? Any internal changes mistakenly listed?
> 6. Section 2.5 structure health: evaluated files + directories accurate? Conclusion agree?
> 7. Section 3 acceptance scenarios: cover normal + boundary + error?
>
> State modifications directly. After confirmation, proceed to implementation.

---

## Exit Conditions (Design)

- [ ] Frontmatter complete (`doc_type` / `feature` / `status=approved` / `summary` / `tags`), swe-plan fields aligned if applicable
- [ ] Section 1 contains "non-goals" and complexity tier (or explicit default)
- [ ] Sections 2.1/2.2 use "current state → change" two-section format; interfaces have examples + source locations; orchestration starts with flow diagram
- [ ] Section 2.3 mount points use "remove it, does feature disappear" criterion (normally 3-5)
- [ ] Section 2.4 push strategy sliced by paradigm dimension, each step has exit signal
- [ ] Section 2.5 structure health evaluation covers file-level + directory-level; compound convention checked; conclusion explicitly written; "micro-refactor" has checklist step 1 with independent exit signal
- [ ] Section 3 key scenarios cover normal + boundary + error; includes "non-goals" reverse-check items
- [ ] `{slug}-checklist.yaml` saved and validated
- [ ] swe-plan entry: items.yaml writeback done (if applicable)

---

## Common Errors (Design)

- Writing without reading related architecture / grepping terminology — plan contradicts existing code, terminology conflicts cost 10x time to find later
- Describing interface behavior in prose without concrete examples — readers can't build mental model
- Writing only "change" without "current state" in noun/orchestration layers — readers can't judge if change is appropriate
- Listing mount points as modification file lists — internal modifications belong to implementation, mount points only list registration entries
- Writing test code / framework / mock in design — these belong to implementation self-determination
- Forcing diagrams when modules ≤2 and calls are linear — diagram obscures key points
- Submitting half-document for review — user can't see global consistency
- Secretly expanding scope in requirement summary — acceptance won't match
