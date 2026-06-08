# Issue Workflow

Use for bugs, regressions, broken behavior, errors, or unexpected output.

Do not mix issue work with new feature scope unless the user explicitly approves.

## Flow

```text
report -> analyze -> fix
```

Fast path is allowed only when:

- the root cause is obvious;
- the change is tiny;
- risk is low;
- verification is clear.

Otherwise use the standard path.

**Fast track gate**: only the report phase startup check makes the formal determination (standard vs fast). Once in standard path, no re-judgment to fast track later — prevents different phases disagreeing on path.

## Paths

```text
{artifact_root}/issues/YYYY-MM-DD-{slug}/
  {slug}-report.md
  {slug}-analysis.md
  {slug}-fix-note.md
```

Date is when the issue was discovered/reported, fixed once set. Slug should be recognizable (e.g. `auth-token-leak`, `null-pointer-on-empty-list`).

`{slug}-fix-note.md` is a **required output** regardless of path complexity. Without it, future similar issues can only be reconstructed from git diff.

---

## Routing

Enter this workflow, first glob `{artifact_root}/issues/` to detect existing files:

| Current state | Trigger which phase |
|---|---|
| Just discovered, no files | Report phase (determines standard vs fast there) |
| `report.md` exists, no `analysis.md` | Analyze phase |
| `analysis.md` exists, code not changed | Fix phase |
| Code changed, no fix verification record | Fix phase (verification) |
| Uncertain | Read existing files and match table above |

User describes **new feature requirement, not a bug** → tell user to use feature workflow.

## Feature-Issue Boundary

- Issue: something that should work is broken — existing code bug / unexpected behavior / doc error / performance problem
- Feature: something that never existed needs adding — new capability

Gray area: fixing an issue reveals new capability is needed → **complete issue workflow first (report + analysis)**, then open feature separately. Don't mix new capability into issue fix — same reason features don't hide bug fixes.

---

## Report Phase

Core principle: **record phenomena, not root cause**. Root cause belongs to analyze phase. Mixing them loses the separation between "what was observed" and "what was diagnosed".

### Questions (ask one at a time, not all at once)

Asking all 5 simultaneously lets users skip the hard ones. One at a time prevents this:

1. **"What did you observe?"** — expected: concrete behavior description. Vague signals ("it doesn't work") → follow up: "what specifically happened? error message? unexpected output? which screen?" Still unclear → ask for screenshot/log
2. **"What did you expect?"** — expected: contrast with observed. If same as #1 → rephrase: "if it worked correctly, what would you see?"
3. **"Can you reproduce it? How?"** — expected: steps. If can't reproduce → don't guess fix, first narrow reproduction path
4. **"Is this a regression? Did it work before?"** — expected: yes/no + when it changed. If regression → identify commit range
5. **"How severe?"** — present severity levels:

| Level | Meaning | Example |
|---|---|---|
| P0 | System unusable / data loss / security | Production down, data corruption |
| P1 | Core functionality broken, no workaround | Login fails for all users |
| P2 | Feature broken, workaround exists | Export fails but copy-paste works |
| P3 | Minor inconvenience / cosmetic | Wrong tooltip text, alignment off |

User says "skip" or "not sure" on any → skip that question.

### User Log Collection

When user-reported logs are needed, provide a structured prompt asking for: steps to reproduce, expected vs actual behavior, error messages, timestamps, environment info.

### Report Template

```markdown
---
doc_type: issue-report
issue: YYYY-MM-DD-{slug}
status: open
severity: P0 | P1 | P2 | P3
summary: {one-sentence description}
tags: []
---

# {slug} Report

## 1. Observed Behavior

## 2. Expected Behavior

## 3. Reproduction Steps

## 4. Environment / Context

## 5. Related Files / Logs / Screenshots

## 6. Regression? (yes/no + when)
```

### Report Phase Exit Conditions

- [ ] All 5 questions asked (one at a time)
- [ ] Severity classified P0-P3
- [ ] Report file saved with complete frontmatter
- [ ] Fast track determination made and recorded
- [ ] If standard path: user confirmed report content

---

## Analyze Phase

Do not skip to fix. Root cause analysis prevents patching symptoms.

### Startup

1. Read `{slug}-report.md` full text
2. Read relevant code files mentioned in report
3. Breakpoint recovery: if `analysis.md` exists and partially filled → resume from next section, report "last completed section X"
4. Context sweep: glob `project/architecture/`, search `project/compound/` for related tricks/explores/learnings that might inform analysis

### Analysis Structure (5 steps)

**Step 1: Locate code** — identify which files/functions are involved in the observed behavior. Record file:line references

**Step 2: Reproduce failure path** — trace the code path from trigger to failure point. Record the chain

**Step 3: Confirm root cause** — distinguish root cause from symptoms. Root cause classification:

| Category | Meaning |
|---|---|
| logic | Wrong condition, wrong branch, missing case |
| state-pollution | Stale state, shared mutable state, race condition |
| data-format | Unexpected input format, missing validation, encoding |
| concurrency | Race, deadlock, ordering assumption |
| config | Wrong default, missing config, environment-specific |
| missing-guard | Missing null check, missing error handling, missing boundary check |

**Step 4: Impact assessment** — what other code depends on this? Does fixing it risk breaking something else? List touched files expected for fix. Assess across four dimensions:

- **Impact scope (影响范围)**: which modules/features affected
- **Potential victims (潜在受害者)**: which users/systems impacted
- **Data integrity (数据完整性)**: any data corruption risk
- **Severity review (严重程度复核)**: confirm severity after full assessment

**Step 5: Fix options** — present 1-3 options with tradeoffs. Don't self-select — let user decide. Each option should state: approach, files touched, risk level

### Analysis Template

```markdown
---
doc_type: issue-analysis
issue: YYYY-MM-DD-{slug}
status: analyzed
root_cause_type: logic | state-pollution | data-format | concurrency | config | missing-guard
path: standard
tags: []
---

# {slug} Analysis

## 1. Problem Location

| File | Function/Line | Role |
|---|---|---|
| {path} | {function}:{line} | {what it does in failure path} |

## 2. Failure Path

{Step-by-step trace from trigger to failure}

## 3. Root Cause

{Root cause description + category}

## 4. Impact Assessment

{What else depends on this, fix risk}

## 5. Fix Options

| Option | Approach | Files | Risk |
|---|---|---|---|
| A | {description} | {list} | {high/medium/low} |
```

### Checkpoint Before Fix

After analysis complete, **orally summarize root cause and recommended option** for user. Don't hand the whole document — one-sentence root cause + one-sentence recommendation + ask for confirmation. User confirms → proceed to fix.

### Analyze Phase Exit Conditions

- [ ] Root cause identified and categorized
- [ ] Failure path traced with file:line references
- [ ] Impact assessed
- [ ] Fix options presented to user
- [ ] User selected fix option
- [ ] Out-of-scope discoveries recorded

---

## Fix Phase

### Standard Path Entry

1. Read `{slug}-analysis.md`
2. Confirm scope with user (which option, which files)
3. Search `project/compound/` for tricks and explores related to fix approach

### Fast Track Entry

1. State root cause clearly (must be obvious, file:line level certainty)
2. State fix plan
3. User confirms
4. Then search compound for related knowledge

### Scope Discipline

Fix addresses the recorded root cause. Stays within analyzed scope. Side discoveries recorded, not fixed:

```markdown
> Side discovery: {file:line} {problem summary}. Not in this fix scope, recorded for future issue.
```

### Reflection Triggers (Issue-Fix Specific)

Same reflection triggers as feature implementation, plus: if reflection fires "should split" but current analysis didn't plan for it, **default is NOT to refactor in this PR**. Only exception: can't cleanly fix without the refactoring. In that case, stop and discuss with user first.

### Fix-Phase Reference

Fix-note template and log-debugging protocol: `references/issue-fix-reference.md`

---

## Post-Fix Recommendations

After fix-note written, prompt each item individually (user says "no" → skip immediately):

1. **Learning**: "Record this pitfall? (cs-learn)"
2. **Decision**: "Record any long-term constraint discovered? (cs-decide)"
3. **Commit**: "Scoped-commit this fix?"

---

## Common Errors

- Writing root cause in report — report is for phenomena, analyze is for diagnosis
- Asking all report questions at once — user skips hard ones
- Guessing fix without analysis — patches symptom, root cause remains
- Mixing new feature into issue fix — can't tell what fixed what
- Side discoveries secretly fixed — not in scope, can't verify
- "Tests all pass" → tests passing ≠ issue resolved, verify against original reproduction
- Fix-note not written — "just a one-liner" → next similar issue has no reference
- Only changing items.yaml without syncing main doc — two files inconsistent
- Piling patches after repeated fix failures → return to analysis instead
