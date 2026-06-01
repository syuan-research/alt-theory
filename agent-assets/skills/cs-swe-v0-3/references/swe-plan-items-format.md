# SWE Plan — Items Format and Reference Material

Complete items.yaml format specification, plan document structure template, state machine, lifecycle rules, child feature handoff protocol, and common errors.

---

## Plan Document Structure

The main document template for swe-plan output:

```markdown
---
doc_type: swe-plan
slug: {slug}
status: active          # active | paused | completed
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

# {Title — say what it is, no metaphors}

## 1. Background

One or two paragraphs: what this is, why do it. Audience: "a newcomer who wants to know what the next few months are about."

## 2. Scope And Non-Goals

### Covered by this swe-plan
- Capability A
- Capability B

### Explicitly out of scope
- Capability X (reason)
- Capability Y (point to another swe-plan / requirement)

## 3. Module / Component Decomposition (Conceptual Design)

How many modules/components, what each does. Text tree or ASCII box diagram + one paragraph per module:

```
{large-requirement-name}
├── Module A: {one-sentence responsibility}
├── Module B: {one-sentence responsibility}
└── Module C: {one-sentence responsibility}
```

### Module A · {name}
- **Responsibility**: {one or two sentences: what it does, what it does not}
- **Child features**: {slug-1, slug-2}
- **Touches existing code/modules**: {existing module X / entirely new / rewrite module Y}

### Module B / C · ...

> No module decomposition needed (pure change to one existing module's internal behavior) → explicitly write "this requirement is completed within existing module {X}, no new modules or boundary adjustments", skip section 4, go directly to section 5.

## 4. Interface Contracts / Shared Protocols (Architecture-Level Detailed Design)

Define how modules interact — this section is feature design's hard constraint input. **Write to function signature / data structure / protocol field / error code level**. "Negotiate between sides" / "TBD" is not allowed.

### 4.1 {Interface / Protocol Name}

**Direction**: Module A → Module B
**Form**: HTTP API / function call / message event / shared DB table / file protocol / ...

**Contract**:

```
# HTTP API example:
POST /api/v1/permission/check
Request:  { user_id: str, resource: str, action: str }
Response: { allowed: bool, reason: str | null }
Errors:   400 invalid_input, 404 user_not_found, 500 internal

# Function signature example:
def check_permission(user_id: str, resource: str, action: str) -> PermissionResult
class PermissionResult: allowed: bool; reason: Optional[str]

# Event example:
event_type: permission.changed
payload: { user_id: str, role: str, changed_at: ISO8601 }
```

**Constraints**:
- Caller must ensure user_id is authenticated
- response reason must be null when allowed=true
- Event must be consumed idempotently

### 4.2 ...

### 4.x Shared Data Structures / State

When multiple modules share the same data structure / persistence / global state, define once here:

```
{table structure / type definition / config schema}
```

> No cross-module interface (e.g. pure frontend style adjustment) → explicitly write "this swe-plan has no cross-module interfaces". Leaving it blank or writing "none yet" is not allowed.

## 5. Child Feature Seeds

Ordered by dependency and progression. Each corresponds to one items.yaml entry; keep both in sync.

1. **{slug}** — {one-sentence description}
   - Module: {Module A / B / cross-module — specify which}
   - Depends on: {prerequisite slug list / none}
   - Status: {planned | in-progress | done | dropped}
   - Feature: {YYYY-MM-DD-{slug} / not started}
   - Notes: {optional}

**Minimal runnable loop**: After item {N} `{slug}` is done, {describe the narrowest path that runs end-to-end}.

## 6. Progression Rationale

One short paragraph: why this split order (by module / user value / risk / dependency); why item 1 is the minimal loop; any blocking points (prerequisite architecture changes / external dependencies / design decisions needed).

## 7. Observations / Risks

Issues discovered during drafting/refresh that this swe-plan does not handle — left for user decision:

- `architecture/X.md` description of Y is outdated, suggest separate architecture update
- requirement-Z boundary conflicts with swe-plan item 5, suggest aligning requirement first

## 8. Acceptance And Writeback

(Existing v0.3 section — keep as-is from original document)

## 9. Change Log (update mode only)

- YYYY-MM-DD: {describe change; if section 4 interface contracts changed, list "interface contract changes" and "affected in-progress features" separately}
```

---

## Optional Items YAML

Use only when useful:

```yaml
swe_plan: {slug}
created: YYYY-MM-DD
workstream: {workstream}
artifact_root: {artifact_root}

items:
  - slug: {child-feature-slug}
    description: {one sentence — independently clear}
    depends_on: []
    dependency_reason: null    # "B depends on A because A provides XX table structure" not "A first"
    status: planned            # planned | in-progress | done | dropped
    feature: null              # fill YYYY-MM-DD-{slug} after feature launch, null if not started
    minimal_loop: true         # only one item is true
    notes: null                # optional: notes / special constraints / drop reason
```

### Field Rules

- `slug`: child feature slug, lowercase letters / numbers / hyphens; future feature directory `YYYY-MM-DD-{slug}`
- `description`: one sentence that independently explains what to do
- `depends_on`: prerequisite slug list, empty array means no dependency; must point to other items in same swe-plan
- `dependency_reason`: concrete reason why dependency exists
- `status`: four-state machine
- `feature`: fill directory name after launch, for acceptance reverse lookup
- `minimal_loop`: exactly one item is `true` across the whole file
- `notes`: dropped items must have reason written here

### State Machine

```
planned  → in-progress  (feature design sets this on launch)
in-progress → done      (feature acceptance sets this on completion)
planned  → dropped      (user decides not to do, swe-plan update changes)
done / dropped are terminal states
```

**Invalid transitions**: `done` back to `in-progress` (requirement rollback needs new feature); `dropped` back to `planned` (restoring needs a new slug with slight modification).

Validate when present:

```powershell
python {skill_dir}\tools\validate-yaml.py --file {path-to-items-yaml} --yaml-only
```

---

## Lifecycle

- All items `done` or `dropped` → main document `status: completed`, directory remains as historical archive
- Long-term no progress: `status: paused`, add reason in main document
- Resume from paused: `status: active`, `last_reviewed` updated

---

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

If the plan contract is wrong or missing, update the `swe-plan`; do not bypass it inside a child feature. Bypassing causes the next feature targeting the same module to receive the old contract, leading to secondary conflicts.

---

## Common Errors

- **Skipping architecture design, directly listing tasks** — jumping to child features, module boundaries/interfaces unthought, features reinvent wheels independently
- **Vague interface contracts** — "negotiate between sides", "TBD", "use a unified event bus" — not reaching field/signature/protocol level. Feature design cannot use this as hard constraint
- Writing single-feature internal details into swe-plan (how to split files within a module / which library to use) — belongs to feature design
- Granularity imbalance — one item fits three independent features, another just changes a config
- Dependency reasons by gut feel — cannot articulate why dependency exists
- Deciding product priority for user
- Conflicting with existing architecture/requirements without stopping — silently picking a side hides real disagreement
- Producing multiple swe-plans in one run
- Side-modifying requirements / architecture
- Dropping items by deleting them — history lost
- swe-plan drifting into writing detailed design for a single child feature
- Update changing interface contracts without assessing existing feature impact — in-progress/done features unaware contract changed
