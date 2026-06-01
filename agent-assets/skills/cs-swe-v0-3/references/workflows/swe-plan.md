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

Full items.yaml format, field rules, state machine, plan document structure template, lifecycle, child feature handoff, and common errors: [`references/swe-plan-items-format.md`](swe-plan-items-format.md)

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

Write **complete first draft** per main document structure and items.yaml format — do not output in batches. (Full template in [`references/swe-plan-items-format.md`](swe-plan-items-format.md))

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

Before user review, self-run this 12-item check:

1. Module decomposition clear? Each module's responsibility expressible in one sentence?
2. Interface contracts at executable level? Feature design can follow without coming back to ask?
3. Each child feature slug standard? (grep `{artifact_root}/features/` to confirm no conflicts)
4. Each description one clear sentence? Cannot express clearly → not decomposed enough or scope too vague
5. Dependency graph is DAG? No self-reference or A→B→A loops?
6. Minimal loop truly minimal? First item done can independently demo something?
7. "Explicitly out of scope" written? If none, say "no explicit non-goals"
8. Conflicts with existing architecture / requirements? If yes, write "conflicts with {doc}, pending user decision" — do not silently pick a side
9. Shared data structures / persistence / global state listed?
10. Should this be a requirement change instead of a feature?
11. **Update-specific**: every new/changed item has source evidence? Fabricating "add one to look more complete" is scope drift
12. **Update-specific**: if interface contracts changed, are in-progress/done child features affected? List affected ones as "observation items" and alert user

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
