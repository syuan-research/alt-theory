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

## Paths

```text
{artifact_root}/issues/YYYY-MM-DD-{slug}/
  {slug}-report.md
  {slug}-analysis.md
  {slug}-fix-note.md
```

## Report

Capture:

- observed behavior;
- expected behavior;
- reproduction steps;
- environment/context;
- related files/logs/screenshots if available;
- whether this is a regression.

If reproduction is unclear, do not guess a fix. First narrow the reproduction path.

## Analyze

Analyze before fixing:

- inspect relevant code;
- identify likely root cause;
- distinguish root cause from symptoms;
- list touched files expected for the fix;
- note out-of-scope discoveries.

If the investigation changes the issue boundary, update the analysis instead of patching around it.

## Fix

The fix should:

- address the recorded root cause;
- stay within the analyzed scope;
- avoid side refactors;
- include verification evidence;
- record touched files and actual change.

If the first fix fails, use logging or targeted probes, then revise the root-cause hypothesis. After repeated failure, return to analysis instead of piling on patches.

## Fix Note Template

```markdown
---
doc_type: issue-fix
issue: YYYY-MM-DD-{slug}
path: standard | fast-track
fix_date: YYYY-MM-DD
tags: []
---

# {Issue} Fix Note

## 1. Problem

## 2. Root Cause

## 3. Fix

## 4. Files Changed

## 5. Verification

## 6. Follow-Up Observations
```
