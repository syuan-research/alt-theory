# Feature Implementation

Use after design is approved and checklist exists.

## Three Implementation Stances

Understanding these stances matters more than memorizing rules.

### 1. Write minimal code by default

Only write what the current step explicitly needs. No "might need later" configurables, abstraction layers, parameter switches, or defensive catch-alls. Criterion: after writing a section, feel "should I add X?" → ask if X is currently user-perceptible. If not, don't add. 200 lines that could be 50 → rewrite.

### 2. Only touch what needs touching, don't "improve" neighbors

When modifying a function, only modify that function. Other functions in same file with ugly style or weird naming — unless directly conflicting with this change, don't touch. New code matches existing file style. Mixed-in "while here" changes dilute the feature PR, multiplying review cost. Worth fixing → record as side-discovery for later issue.

Orphan handling: if your change makes an import/function dead code → delete it. Dead code **not** caused by your change → leave it, record as side-discovery.

### 3. Don't decide what design didn't say

Mid-implementation discovery of un-covered corners (boundary conditions, error paths, out-of-scope files) → default to stopping and going back to design. Any "design didn't explicitly say, so I chose" moment triggers this.

---

## Startup Check

### 1. Design file sufficient for implementation?

Frontmatter: `doc_type=feature-design` / `feature` matches / `status=approved` / `summary` non-empty / `tags` ≥ 2.

Standard design (sections 0/1/2/3/4):
- Section 0 has content; section 1 contains "non-goals" and complexity tier
- Section 2.1 noun layer uses "current state → change", each new/changed interface has example + source location
- Section 2.2 orchestration starts with flow diagram, "current state → change" complete, flow-level constraints recorded
- Section 2.3 mount points use "remove it, does feature disappear" criterion
- Section 3 has key scenario list + reverse-check items (no test code / framework selection)

Any item not met → return to feature design. Reason: design gaps mean implementation must fill them on the fly, bypassing checkpoint.

**Note**: Section 3 "acceptance contract" says "what should hold after completion", not "how to do it". Modification file lists / function-level targets / test code belong to implementation self-determination. Don't return design for missing these.

### 2. Checklist exists and is valid

- File exists, `feature` field matches
- `steps` non-empty (paradigm-dimension slices, 4-8 steps); `checks` non-empty
- Missing → return to feature design to generate

### 3. Read full context

- Design document full text (focus: section 1, 2.1/2.2/2.3/2.4, 3)
- `{slug}-checklist.yaml`, requirement source (user description + brainstorm note)
- Section 2.1 interface example source locations — read relevant functions

### 4. Confirm starting step with user

Usually step 1. Resuming from interruption → continue from first non-`done` step.

**Design section 2.5 micro-refactor handoff**:

- If 2.5 conclusion is "micro-refactor (split files)" or "micro-refactor (reorganize directory)", checklist step 1 is it — **run independently to completion**, verify per 2.5 "behavior unchanged" criteria:
  - Split files: compiler green + existing tests pass + external interface signatures zero diff
  - Reorganize directory: compiler green + existing tests pass + diff limited to file moves + import path updates (**no function body changes**)
- **Do not merge into next step** — once mixed, behavior changes and structural changes become inseparable, cannot roll back to clean intermediate state
- If 2.5 concludes "skip" but reflection trigger fires mid-implementation → follow reflection check path (stop, align with user, add independent step if provable), **don't bypass user confirmation**
- If 2.5 has "suggested convention" note: implementation stage **does not proactively archive** — only after reorganization runs and behavior-zero-change confirmed, mention in report "design 2.5 suggested convention is ready, defer to acceptance stage for cs-decide decision", hand decision to acceptance/user

---

## Core Constraints During Implementation

### Follow steps in strict order

Execute by `steps` list order, no merging, no skipping. Complete each step and immediately update status `pending` → `done`.

Most common violation: "do the next step too while at it". Each step has an independently verifiable exit signal. Two steps merged means when something goes wrong, you can't tell which step introduced it, and can't roll back to clean intermediate state.

### No out-of-scope changes

Discover refactoring-worthy points — as long as **not within this feature's impact scope**, record for later issue:

```markdown
> Side discovery: {file:line} {problem summary}. Not in scope, recorded for future issue.
```

Side-modified code isn't in the design; acceptance can't verify it. Later git blame can't distinguish feature work from side changes.

### Terminology guard

New types/functions/variable names must be checked against design doc section 0. Concepts not in doc not allowed. Need new concept → stop, update section 0, grep for conflicts, user confirms.

### Stop when patch-branch impulse arises

Writing code and `if (special_case) { special_handling }` structure appears → **stop**. This branch almost always means design didn't cover this case. Continuing produces "special logic added to make code run" — next person modifying won't know why this branch exists. Go back to design: supplement / cut / explicitly mark as legacy.

### Reflection triggers

| Trigger scenario | Stop and ask yourself |
|---|---|
| Adding code to an already long file | How many things does this file do? Is the addition an extension of existing responsibility or the N+1th thing? N+1 → default to new file |
| Adding another method to a class with many methods | Is this a natural extension of core responsibility, or pushing toward "can do anything"? |
| Function exceeds one screen | How many things does it do? Multiple → split |
| Adding `if (special) { special_handling }` branch | Wrong abstraction level? Correct approach might be separating special and general paths into different functions/strategies/classes |
| Copy-pasting code | Can it be extracted as shared, or just literally similar? Extractable → extract |
| Adding 4th+ parameter to function | Is the function doing too much? Parameter list is early API degradation signal |
| Creating "utility/helper" class | No real owner, or just can't think of where to put it so stacking in util? |

Reflection conclusion is "should split / new file / rename / extract shared" and goes beyond current steps → align with user before deciding (add as current step / record as side-discovery for later). Judgment criteria consistent with design 2.5 boundary:

- **Can resolve with "only move, no behavior change"** (split functions / split files / move definitions, compiler green全程, external signatures zero diff) → align with user, **add as independent step** before current step, run with independent verification
- **Exceeds "only move, no behavior change" boundary** (need to change function signatures / return structures / call semantics / module splits) → **don't do in this feature**, record in "side-discovery" format, suggest cs-refactor later, current step uses minimal workaround

---

## Completion Report

After all steps complete, output report using template below, then **stop and wait for user review**.

Fixed template exists because vague reporting pushes verification responsibility back to user. Template forces explicit statement of files touched, scope compliance, new concepts.

```markdown
## Implementation Complete Report

### Files touched
{git status actual output}

### Functions / types changed (grouped by step)
**Step N: {step name}**
- file:line  function_name  change_type (new / modified / deleted)

### Did any out-of-scope files get touched?
{Yes / No. If yes, explain reason + whether design doc was synchronized}

### Were any new concepts / abstractions introduced not in design doc?
{Yes / No. If yes, explain backfill to design doc (section 0 + section 2.1 for standard design)}

### Reflection trigger self-check
{Against each trigger, which fired + how handled; none → write "no triggers"}

### Step exit signal verification
{Against steps, list action + exit_signal + status (should all be done)}

### Acceptance scenario self-check
{Standard design: against section 3 key scenario list, evidence per scenario (type system / unit test / integration / manual / assert) + reverse-check items guarded}
```

After report, stop and wait for review.

---

## Test Coverage

Standard design section 3 "key scenario list" each item = one verifiable behavior constraint. Your job is turning each into observable evidence: unit test / integration / manual operation / type compilation guarantee.

How specifically to test, what framework, mock setup — design didn't specify, you decide. But you must write in `steps` which step delivers which test, and verify in report that each scenario has evidence.

**Tests passing ≠ acceptance scenarios satisfied** — former only means your test cases passed, not that each scenario has test coverage.

Type-system guaranteed (e.g., TypeScript signature directly prevents certain calls) → state in report "type signature implemented, compile-time guarantee".

---

## Exit Conditions (Implementation)

- [ ] All steps status `done`
- [ ] Completion report output, user review passed
- [ ] No unhandled "stop" signals
- [ ] Section 3 key scenarios each have evidence/test coverage
- [ ] No side discoveries secretly fixed (all in issue list)
- [ ] No out-of-scope file changes (or design doc synchronized)

---

## After Implementation

Tell user: "All steps complete, design doc synchronized. Next: stage 3 acceptance, trigger feature acceptance."

Don't proactively start writing acceptance report — acceptance needs independent checklist rhythm, premature entry invalidates the gate.

During implementation, if you discover project-universal hard constraints / command traps / environment setup ("ah, this project needs X before Y", explainable in 1-2 lines, next feature's AI will hit again) → before telling user to proceed with acceptance, **briefly mention**: "Discovered {specific item}, should cs-note this to avoid next time?" Single item only, don't batch. User says "handle at acceptance" → skip, acceptance exit sequence covers it.

---

## Common Errors (Implementation)

- Sending completion report with partial code — report only sent once after all complete
- Writing "modified related files" instead of listing file:line
- Modifying out-of-scope code seen along the way
- Introducing new types/concepts without updating design doc
- Adding `if (special_case) { special_handling }` patch branch without stopping
- Entering acceptance before user review passed
- Key scenario list items with no evidence
- Reading paradigm-dimension steps as file:line — steps are slice strategy not modification list; secretly splitting sub-steps without user alignment = bypassing review
