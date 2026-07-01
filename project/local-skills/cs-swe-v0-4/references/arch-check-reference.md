# Architecture Check Mode Reference

Extracted from `workflows/arch.md`. Coverage items, report template, and check-mode-specific error list.

---

## Check Mode Coverage Items

Three sub-targets, each covering 6 items.

### design-internal (one design document's internal consistency)

1. **Terminology consistency** — terms defined in section 0 later replaced by synonyms or semantically drifted
2. **Requirement alignment** — section 1 summary is self-consistent, hasn't drifted from confirmed target
3. **Contract closure** — section 2 contract examples have corresponding change plan in section 3
4. **Example-decision consistency** — contract example behavior contradicts key decisions
5. **Scope guard** — change plan doesn't exceed "explicit non-goals"
6. **Execution viability** — progression steps are verifiable, dependencies have no forward-backward contradictions

### design-vs-code (design matches code)

1. **Type consistency** — core types/fields defined in design exist in code with matching semantics
2. **Behavior consistency** — input→output pairs declared in design match code's actual behavior
3. **Write-path consistency** — write entry points declared in design have no extra bypass writes in code
4. **Boundary behavior consistency** — exception / boundary rules in design are implemented in code
5. **Change boundary consistency** — code hasn't gone beyond or missed implementing design scope
6. **Progression result consistency** — each step's exit signal corresponds to verifiable code state

### architecture-folder-internal (consistency across multiple docs)

1. **Terminology consistency** — same concept called uniformly, no synonym drift or same-name-different-meaning
2. **Module boundary consistency** — doc A says responsibility X belongs to module Y, does doc B agree; do two docs both claim ownership of the same responsibility
3. **Cross-document reference validity** — `see xxx.md` / `definition in yyy.md` targets actually exist
4. **Interface / contract alignment** — when multiple docs involve the same interface / type, signatures / fields / semantics are consistent
5. **Dependency closure** — A declares depending on capability provided by B, does B actually expose it; any one-way dangling dependencies
6. **Same-type aggregation and naming** — same-type docs follow `{type}-{slug}.md`, root directory any type ≥6 still flat (reference `../shared-conventions.md`)

---

## Check Report Template

```markdown
# Architecture Consistency Check Report

> Target: design-internal | design-vs-code | architecture-folder-internal
> Scope: {feature}/{module}/{section range}
> Date: YYYY-MM-DD
> Conclusion: pass | pass-with-risk | fail

## 1. Check Summary

One-sentence summary.

## 2. Inconsistency List

| ID | Severity | Location | Phenomenon | Impact | Suggested Fix |
|---|---|---|---|---|---|
| AC-01 | high/medium/low | `{file}:{line}` or `design section X` | description | consequence | fix suggestion (not executed) |

## 3. Observations (out of scope, no action taken)

Structural issues discovered while reading `architecture/`: some type ≥6 still flat (should trigger `update` migration); filenames not following `{type}-{slug}.md`; other unreasonable points spotted. None → omit section.

## 4. Consistency Passes

List 2-5 key points that checked out fine — reports with only negative information erode user's overall confidence in the system.

## 5. Suggested Next Steps

- **fail**: suggest which items to fix first before re-running
- **pass-with-risk**: which points to focus regression on during implementation / acceptance
- **pass**: can proceed to next stage
```

**Severity levels**:

- **high**: would send implementation in wrong direction, or code has substantially diverged from design (missing critical contract / opposite behavior / terminology pointing to different things)
- **medium**: intent guessable but ambiguity remains (synonym drift / contract example and decision superficially match but detail conflicts / exit signal unclear)
- **low**: awkward phrasing or readability issue, doesn't affect understanding

---

## Check Mode Common Errors

- Running multiple sub-targets simultaneously
- `architecture-folder-internal` reading code — that's `design-vs-code`
- Finding issues and silently fixing code or documents
- Saying "this seems off" without evidence position
- Suggestions too abstract ("optimize the architecture")
- Expanding from one target to full-repo audit infinitely
- Report with only problems, no consistency passes — erodes system confidence
- Check report containing actual file modifications — check and fix must be separate
