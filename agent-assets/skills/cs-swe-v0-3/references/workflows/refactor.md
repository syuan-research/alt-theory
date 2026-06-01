# Refactor Workflow

Use only for behavior-preserving cleanup, restructuring, or technical-debt reduction.

If behavior changes, route to feature or issue.

## Flow

```text
scan -> design -> apply
```

Three phases with human checkpoint between each. Scan → user selects items → design → user approves → apply → user confirms each step.

## Paths

```text
{artifact_root}/refactors/YYYY-MM-DD-{slug}/
  {slug}-scan.md
  {slug}-refactor-design.md
  {slug}-checklist.yaml
  {slug}-apply-notes.md
```

---

## Refusal / Routing Checks (Before Scan)

Before scanning any code, run these 7 checks. Hit any → **stop scan, give routing recommendation**, don't force it:

1. **Is this actually behavior-preserving?** User says "refactor" but description includes new capability, bug fix, or behavior change → route to feature or issue
2. **Is there test coverage?** Target code has no tests → can't verify behavior equivalence. Route: add tests first (feature or separate task)
3. **Is scope reasonable?** > 15 files or > 3000 lines → ask user to narrow scope before scanning
4. **Is this a cross-module architecture change?** Moving module boundaries, changing layered architecture → this is architecture work, not a single refactor. Route: architecture update + decisions + N module-level refactors
5. **Is this a naming/style preference?** No functional issue, just "I don't like how it looks" → route to cs-decide for convention, or skip
6. **Is there an existing decision that already answers this?** Search compound for convention decisions → follow existing rule
7. **Has the user described a specific concern?** Vague "optimize this" with no concrete problem → ask user to narrow: performance? readability? size? Maintainability is not a goal by itself without specific symptoms

Zero legitimate items found after scanning → say so honestly, don't fabricate items.

---

## Fast-Forward Mode (Small Refactor)

For very small, obvious, behavior-preserving cleanup with clear verification.

**Entry conditions (all 3 must hold)**:
1. Behavior unchanged confirmed
2. Scope is small (single function/component, 1-3 touch points)
3. Tests exist that can self-prove

**Flow**: identify → align with user → change → verify → report. No scan/design/checklist.

**Bail-out triggers** (hit any → switch to standard flow from scan):
- Touch points expand beyond 3
- Need to change a public interface (requires Parallel Change)
- Cross-module impact discovered
- No test coverage after all
- User asks for more thorough treatment

Don't enter ff: change crosses > 1 file, expected touch points > 3, needs visual verification, changes public interface, no test coverage, cross-module.

---

## Scan Phase

### Scope Locking

Confirm before scanning: **which files to scan**. Defaults:

- User named specific file/component → scan those only
- "This page" → entry component + directly imported internal modules, don't chase shared dependencies
- "This module" → files under module directory, don't chase beyond module boundary
- Scope > 15 files or > 3000 lines → trigger refusal check #3, ask user to narrow

Include test files in scope (needed for coverage check).

### What To Look For

Scan using the 4-layer method library as template:

- **L1 Behavior-equivalent migration**: function called many places but interface/implementation needs change → Parallel Change; old logic block being replaced by new implementation → Strangler Fig
- **L2 Code-level refactor**: long functions (> 50 lines / cyclomatic complexity > 10), repeated conditional fragments, mysterious temp variables, deeply nested if-else
- **L3 Structural split**: component > 300 lines / file doing multiple things / container and presentation mixed / same logic written separately in multiple components (frontend); Controller directly calling DB / Service missing / Repository bypassed (backend)
- **L4 Performance**: repeated computation (memoizable) / N+1 queries / list without virtualization or pagination / event listeners not cleaned up / large objects with deep reactivity (Vue)

Full method library in `references/refactor-methods.md`. Load entire library during scan as matching table.

### Scan Output Format

`{slug}-scan.md` has two parts:

1. **Top overview** (one paragraph): scan scope / items found / distribution by category / distribution by risk / suggest which to do first / which to be careful with
2. **Checklist items** (one block per item). Each item has these fields in order:

```text
ID: {scan item ID, e.g. S-01}
Location: {file:line or file range}
Category: {L1/L2/L3/L4}
Risk: {low/medium/high}
Method: {M-Ln-NN from method library}
Description: {what was found, concrete and specific}
Current state: {what the code looks like now}
Proposed change: {what to do, one concrete thing}
Evidence: {why this is a problem — not "code smells", but measurable issue}
Verification: {how to confirm behavior unchanged after fix}
```

**Hard constraints on scan items**:
- No pure adjectives without measurement ("code is ugly" → rejected)
- No open suggestions without specific action ("could be improved" → rejected)
- One thing per item (don't bundle 3 issues into one item)
- Max 3 items per location (if more, split the location or scope)
- No taste items (naming preference, quote style, arrow vs function — route to decide)
- Every item must map to a method in the library

Present entire scan to user. **User checks ✓ / ✗** (✗ needs reason). **Don't check for the user.**

---

## Design Phase

### Input

- User-checked `{slug}-scan.md`
- Method library (every checked item must map to method ID M-Ln-NN)

### Steps

1. **Order items** — checked items with dependencies go first (L1 Parallel Change usually before L2 extraction). Independent items: "low risk + AI self-provable" first, HUMAN verification items batched later
2. **Add execution detail per item**: method ID / steps / prerequisites / exit signal / verification responsibility (AI / HUMAN) / rollback strategy
3. **Identify prerequisites** — items with insufficient test coverage → prepend "add characterization tests"; items changing public interfaces → prepend "search call sites"
4. **Whole-document review**: present complete draft to user, approved → `status: approved`
5. **Extract checklist**: steps correspond to execution order, checks correspond to exit signals per step

### Design Template

```markdown
---
doc_type: refactor-design
refactor: YYYY-MM-DD-{slug}
status: draft | approved
scope: {one-sentence scan scope}
summary: {what this refactor does, one sentence}
---

# {slug} Refactor Design

## 1. Scope
- Items selected from scan (IDs)
- Items excluded (✗) with reasons
- Estimated total effort / risk level

## 2. Prerequisites
- Test coverage additions (if needed)
- Call site searches (if needed)
- Other one-time prep

## 3. Execution Order
Per step:
- Step N: {one-sentence action}
- Method: M-Ln-NN {method name}
- Specific operations: {method library steps applied to this project's files/functions}
- Exit signal: {what test AI runs / what page HUMAN checks}
- Verification: AI self-proof | HUMAN
- Rollback: {how to revert, typically git revert that step}

## 4. Risks and Watch Points
- High-risk steps summary
- Easy-to-miss points (cross-step data flow changes etc.)
```

---

## Apply Phase

### Rules

1. **One step at a time** — strict checklist order, current step not complete → don't open next
2. **Verify after each step**:
   - AI self-proof: run specified tests / type check / lint / grep for no residual old references. Pass → record in apply-notes, continue
   - HUMAN verification: **stop** and report "step N complete, please visually confirm at {specific page/operation}, confirm to proceed". User doesn't explicitly say "continue" → don't proceed
3. **Record deviations on the spot** — execution finds something design didn't consider (e.g., a call site in dynamic import) → **stop and report, don't improvise**. Align with user, add to apply-notes, return to design if necessary
4. **Behavior equivalence self-check** — after each step, ask "could this step have changed externally observable behavior?" Any doubt → revert the step

### Apply-Notes Template

```markdown
---
doc_type: refactor-apply-notes
refactor: YYYY-MM-DD-{slug}
---

# {slug} Apply Notes

## Step 1: {action}
- Completed: {date}
- Files changed: {file list}
- Verification result: {test output / HUMAN confirmation quote}
- Deviations: {none / specific description}

## Step 2: ...
```

### After All Steps Complete

- Run full test suite + type check + lint
- Final user visual confirmation (frontend: open main pages, click through)
- Confirmed → commit, message references refactor directory

---

## Exit Conditions

- [ ] Refusal/routing checks run, hits routed, non-hits entered scan
- [ ] `{slug}-scan.md` user-checked (✓/✗)
- [ ] Design maps each checked item to method ID
- [ ] Design user whole-review approved `status: approved`
- [ ] checklist.yaml generated and validated
- [ ] Apply each step has verification record (AI: log output, HUMAN: user quote)
- [ ] Full tests / type check / lint pass
- [ ] User final visual confirmation passed

---

## Workflow Boundaries

- **Feature**: adding capability / changing requirements. "Also implement X" found during refactor → stop, split out
- **Issue**: fixing bugs / wrong behavior. Bug found during refactor → record as new issue, don't silently fix
- **Decisions**: project-wide long-term constraints. Refactor can reference existing decisions but doesn't produce them
- **Architecture**: cross-module boundary changes / layer adjustments. Single refactor doesn't cross modules; cross-module → architecture update + decisions + N module-level refactors
- **Tricks / Learning**: methods discovered during refactor → tricks; pitfalls hit → learning

---

## Common Errors

- AI fabricating scan items — refusal checks clearly hit but finding excuses to bypass, scanning "code could be more elegant" items without quantified issues
- Sneaking behavior changes — "also fixed a bug / improved copy" during refactor — split into separate issue or feature
- Merging steps — one commit doing 2-3 steps, losing "single-step rollback" ability
- Listing taste items — naming preference / quotes / arrow vs function → route to decide
- Scanning large modules without splitting — > 15 files / > 3000 lines without narrowing, producing undecidable long lists
- Skipping HUMAN verification — frontend effects AI can't see, "typecheck passed" doesn't substitute for visual check
- Refactoring without test coverage — "behavior equivalent" is just verbal promise without tests
