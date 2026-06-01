# SWE Plan Workflow

This adapts CodeStable raw `roadmap` mechanics under the v0.3 term `swe-plan`.

`swe-plan` is the project's planning layer — each subdirectory carries one large requirement, consisting of three parts:

1. **Conceptual design**: how to build this large requirement, which modules/components to split into, each responsibility
2. **Architecture-level detailed design**: interface contracts between modules, shared data structures, cross-feature protocols
3. **Child feature decomposition**: break the plan into a series of child feature seeds with dependency relationships, each consumed by one feature workflow run

All three parts **together** serve as shared constraints for all child features — when any child feature enters feature design, the interface contracts in part 2 are its **hard constraint input** (cannot be violated; to change, go back to swe-plan update first).

## When To Use

Use `swe-plan` when at least one is true:

- the demand is too large for one feature;
- several child features share interfaces, protocols, data structures, routes, events, or state schema;
- multiple coding agents may work in parallel;
- dependency order matters;
- child feature acceptance should update a shared plan.

Do not use it for a single feature, bug, refactor, research plan, or long-horizon project roadmap.

## Mode Routing

| What user says | Mode |
|---|---|
| "split X requirement", "open a swe-plan for X", "I want an X system" | `new` |
| "add child feature to {existing plan}", "reorder", "mark dropped" | `update` |

Cannot determine → ask user.

## Single Target Rule

Each run targets exactly one swe-plan. "I want X and Y" → pick one, the other next time. Same reasoning as architecture — producing multiple plans in one run means user cannot review them all.

---

## Inputs

Read:

- `../shared-conventions.md`
- `../record-boundaries.md`
- relevant current architecture docs;
- relevant workstream notes or plan-records only for context and problem evolution;
- any brainstorm or requirement-like source material that the user points to.

## Output Path

```text
{artifact_root}/plans/{swe-plan-slug}/
  {swe-plan-slug}-swe-plan.md
  {swe-plan-slug}-items.yaml    # optional
  drafts/                       # optional
```

`{swe-plan-slug}` — lowercase letters / numbers / hyphens, matching the large requirement (e.g. `permission-system`, `notification-center`). Flat layout, no nested epic/sub-epic. `drafts/` created on demand, AI does not force archiving.

---

## Main Document Structure

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

## Workflow

### Phase 1: Lock Target

Mode + target + scope. `new` mode first settle an English slug (following existing slug conventions).

### Phase 2: Read Materials

**Common required reads**: `../shared-conventions.md` + `../record-boundaries.md` + user source material + `plans/` other swe-plans (prevent duplication) + relevant architecture docs + relevant workstream notes.

**Contextual reads**:
- Related compound artifacts: `python {skill_dir}\tools\search-yaml.py --dir project/compound --query "{keyword}"`
- Existing related feature designs

**Update additional**: current main document full text + items.yaml current state + launched/completed child feature design/acceptance docs.

### Phase 3: Decompose and Draft

Write **complete first draft** per main document structure and items.yaml format — do not output in batches.

**Decomposition Discipline** (7 rules):

1. **Architecture before features** — sequence: think module decomposition (section 3) → module interfaces/data structures/protocols (section 4) → then break into child features (section 5). **Architecture unclear when decomposing features results in each feature reinventing its own wheel, interfaces misaligned**
2. **Interface contracts must be executable-level** — function signatures / data structures / protocol fields / error codes at this level. Cannot reach this level → go back and think harder. No cross-module interface (e.g. pure frontend style adjustment) → explicitly write "no cross-module interface"
3. **Each child feature must be independently runnable** — can go through feature design / implementation / acceptance independently. Cannot → granularity is wrong
4. **Dependency graph must be a DAG** — A depends on B, write it clearly, no cycles
5. **Dependency reasons must be concrete** — "B depends on A because A provides XX table structure" not "A goes first"
6. **Mark the minimal runnable loop first** — after completion, the narrowest path that runs end-to-end is marked as the first item
7. **Explicit non-goals** — user's mental "permission system" may include audit logging / data masking; if not covering, write into "explicitly out of scope"

Additionally: **do not decide product priority for the user** — ordering beyond technical dependencies lets the user decide.

### Phase 4: Self-Check List

Before user review, self-run this 10-item check:

1. Module decomposition clear? Each module's responsibility expressible in one sentence?
2. Interface contracts at executable level? Feature design can follow without coming back to ask?
3. Each child feature slug standard? (grep `{artifact_root}/features/` to confirm no conflicts)
4. Each description one clear sentence? Cannot express clearly → not decomposed enough or scope too vague
5. Dependency graph is DAG? No self-reference or A→B→A loops?
6. Minimal loop truly minimal? First item done can independently demo something?
7. "Explicitly out of scope" written? If none, say "no explicit non-goals"
8. Conflicts with existing architecture / requirements? If yes, write "conflicts with {doc}, pending user decision" — do not silently pick a side
9. **Update-specific**: every new/changed item has source evidence? Fabricating "add one to look more complete" is scope drift
10. **Update-specific**: if interface contracts changed, are in-progress/done child features affected? List affected ones as "observation items" and alert user

### Phase 5: User Review

Present main document + items.yaml in full to user. Revise until user explicitly says "looks good".

**Review prompt**:

> swe-plan drafted, please review as a whole. **Read architecture design first, then feature decomposition** — if architecture changes, all downstream must be re-ordered:
>
> **Architecture layer**
> 1. Module decomposition correct? Boundaries reasonable? Merge/split needed?
> 2. Interface contracts specific enough? Feature design can follow directly? Any "negotiate between sides" ambiguity?
> 3. Shared data structures / protocol fields / error codes missing?
>
> **Feature decomposition layer**
> 4. Decomposition granularity appropriate? Each can independently become a feature?
> 5. Each mapped to correct module?
> 6. Dependencies correct? Missing prerequisites or unnecessary dependencies?
> 7. Minimal loop chosen correctly? First item done can truly demo something end-to-end?
> 8. "Explicitly out of scope" complete?
> 9. Order matches your product priorities?

### Phase 6: Persist

**new**: Create `{artifact_root}/plans/{swe-plan-slug}/`; write main document (`status: active`, `created` / `last_reviewed` today); write items.yaml (each item `status: planned`, `feature: null`); `validate-yaml.py` validate.

**update**: Modify main document (`last_reviewed` today, structural changes add changelog entry at end); modify items.yaml corresponding items (dropped items not deleted, `status: dropped` with reason preserved); re-validate yaml.

**Do not modify requirements / architecture** — swe-plan is the planning layer, those layers only describe current state. Issues found during decomposition go into "observations" for user, do not modify on the side.

---

## Update Mode

When adding or changing items in an existing swe-plan:

- **Add child features**: new items follow decomposition discipline rules; confirm slug does not conflict with existing features
- **Reorder**: only reorder items without dependencies; dependency-constrained items maintain their order
- **Mark dropped**: do not delete — set `status: dropped`, write drop reason in `notes`
- **Interface contract changes**: mandatory impact assessment — list all in-progress/done child features affected by the contract change; present to user for decision before proceeding

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

## Hard Boundaries

1. **No single-feature implementation details** — swe-plan stops at "module boundaries / interface contracts / shared protocols"; single-module internal implementation belongs to feature design. Criterion: **shared by multiple features** → swe-plan; **used within one feature** → feature design
2. **No modifying vision or structure archives** — do not modify requirements / architecture / code / existing features on the side. Issues go into "observations"
3. **No deciding product priority for user** — ordering beyond technical dependencies lets user decide
4. **Single target** — one swe-plan per run
5. **No scope expansion** — issues outside user scope go into observations, do not expand
6. **Interface contracts either executable-level or explicitly "no cross-module interface"** — "TBD / figure it out later" is not allowed. Ambiguous contracts cause each feature to fill them independently, guaranteed inconsistency

---

## Exit Conditions Checklist

- [ ] Locked single mode + single target
- [ ] Main document frontmatter complete (`doc_type: swe-plan` / `slug` / `status` / `created` / `last_reviewed` / `tags`)
- [ ] Main document contains: background / scope and explicit non-goals / **module decomposition** / **interface contracts** / child feature seeds / progression rationale / observations
- [ ] Module decomposition section: each module's responsibility in one sentence
- [ ] Interface contracts section at executable level (function signatures / data structures / protocol fields / error codes) or explicitly "no cross-module interface"
- [ ] items.yaml each item has `slug` / `description` / `depends_on` / `dependency_reason` / `status` / `feature`
- [ ] Dependency graph is DAG with no cycles
- [ ] Minimal runnable loop item marked
- [ ] items.yaml passes `validate-yaml.py` validation
- [ ] Phase 4 self-check list run item by item and reported
- [ ] User review passed
- [ ] No side modifications to requirements / architecture / code / existing features

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
