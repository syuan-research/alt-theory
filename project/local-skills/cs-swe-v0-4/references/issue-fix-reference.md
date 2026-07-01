# Issue Fix Reference

Companion to `workflows/issue.md`. Contains fix-note templates, log-debugging protocol, and fix-phase-specific guidance.

---

## Log-Debugging Protocol

When first fix attempt fails:

1. Declare failure to user: "first fix didn't resolve, switching to logging"
2. Determine log points (minimal, focused on failure path)
3. Add logging, user runs, captures output
4. Analyze logs → update root cause hypothesis
5. Clean up logging (remove debug logs)
6. Re-enter fix with new hypothesis

**2-round limit**: after 2 rounds of log-debugging without resolution, return to analyze phase instead of piling on patches. User prompt: "Two debugging rounds haven't resolved. Recommend returning to analysis to re-examine root cause."

---

## Per-Change Report Template (Standard Path)

```markdown
## Fix Changes

### Files Changed
{file:line — what changed}

### Scope Check
{Did fix touch files outside analyzed scope? Yes/No + why}

### New Concepts Introduced?
{Any new types/functions not in analysis? Yes/No + why}

### Reproduction Verification
{How was the fix verified? Steps + result}
```

---

## Fix-Note Templates

### Standard Path

```markdown
---
doc_type: issue-fix
issue: YYYY-MM-DD-{slug}
path: standard
fix_date: YYYY-MM-DD
tags: []
---

# {slug} Fix Note

## 1. Problem

## 2. Root Cause

## 3. Fix

## 4. Files Changed

## 5. Verification

## 6. Follow-Up Observations
```

### Fast Track

More context needed since no separate report/analysis:

```markdown
---
doc_type: issue-fix
issue: YYYY-MM-DD-{slug}
path: fast-track
fix_date: YYYY-MM-DD
root_cause_type: {category}
severity: {P0-P3}
tags: []
---

# {slug} Fix Note (Fast Track)

## 1. Problem

{Observed behavior}

## 2. Expected Behavior

{What should happen}

## 3. Root Cause

{Root cause + category}

## 4. Fix

{What was changed}

## 5. Files Changed

{file:line — what changed}

## 6. Verification

{How verified}

## 7. Reproduction Steps

{Steps to reproduce original issue, for future reference}

## 8. Follow-Up Observations
```
