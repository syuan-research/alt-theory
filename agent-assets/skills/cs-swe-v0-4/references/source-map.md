# Source Map

This file records where v0.4 came from. It is not part of the runtime workflow.

Current revision: v0.4 action-for-reflection. The bundle folder is
`cs-swe-v0-4`; revision is tracked by folder name and this source map.

## Sources

- CodeStable raw repo: `https://github.com/liuzhengdongfortest/CodeStable`
- Previous adaptation: the v0.2 CS-SWE skill folders in this repository.
- v0.3 adaptation: `agent-assets/skills/cs-swe-v0-3/`
- Current design records:
  `project/cross-workstream/skill-cs-swe-adaptation/notes-and-status/`

## Main Adaptations

| v0.4 file | Source / adaptation |
|---|---|
| `SKILL.md` | Router and project-specific boundary entry. |
| `references/shared-conventions.md` | v0.4 path conventions after the 2026-06-08 restructure, relative internal-reference rule, observation boundary, compound guard, central brainstorm naming. |
| `references/record-boundaries.md` | Boundary between plan-record, CS-SWE artifacts, brainstorm, architecture, and requirements references. |
| `references/workflows/feature.md` | Adapts cs-feat-design + reference.md. Design gate, entry modes, document structure, section 2.5, startup check, review. |
| `references/workflows/feature-impl.md` | Adapts cs-feat-impl. Three stances, startup check, reflection triggers, completion report. |
| `references/workflows/feature-acceptance.md` | Adapts cs-feat-accept + reference.md. 9-section verification, mount point reverse grep, architecture/req/swe-plan writeback. |
| `references/workflows/issue.md` | Adapts cs-issue (router) + cs-issue-report + cs-issue-analyze + cs-issue-fix + fix reference.md. Full report/analyze/fix phases with templates. |
| `references/workflows/refactor.md` | Adapts cs-refactor + cs-refactor-ff. 7 refusal checks, scan/design/apply phases, fast-forward mode. |
| `references/refactor/methods.md` | Copied from cs-refactor/reference/methods.md. L1-L4 method library (394 lines). No adaptation needed (universal methodology). |
| `references/refactor/refusal-routing.md` | Copied from cs-refactor/reference/refusal-routing.md. Pre-scan checks (143 lines). |
| `references/refactor/scan-checklist-format.md` | Copied from cs-refactor/reference/scan-checklist-format.md. Scan item format (164 lines). |
| `references/workflows/swe-plan.md` | Lightweight adaptation: document structure, drafting discipline, optional items.yaml, child feature handoff. Does NOT prescribe CS raw's 6-phase pipeline — design decision: flexible, not forced. |
| `references/workflows/brainstorm.md` | Adapts cs-brainstorm + reference.md. v0.4 narrows brainstorm landing paths to plan-record continuation, feature-local with an existing anchor, and central brainstorm. |
| `references/workflows/decide.md` | Adapts cs-decide + reference.md. Four categories, Phase 1-5, update/supersede. |
| `references/workflows/learn.md` | Adapts cs-learn + reference.md. Pitfall/knowledge tracks, Phase 1-5, update/supersede. |
| `references/workflows/explore.md` | Adapts cs-explore + reference.md. Three types, Phase 1-5, evidence discipline. |
| `references/workflows/trick.md` | Adapts cs-trick + reference.md. Three types, Phase 1-6, mandatory code investigation. |
| `references/workflows/arch.md` | Adapts cs-arch + reference.md. All three modes (update/check/backfill), Phase 1-6, 18 check coverage items. |
| `references/feature-design-template.md` | Extracted from feature.md. Design document structure template (sections 0-4 writing requirements). |
| `references/issue-fix-reference.md` | Extracted from issue.md. Fix-note templates, log-debugging protocol, per-change report template. |
| `references/arch-check-reference.md` | Extracted from arch.md. Check mode 18 coverage items, check report template, check-mode common errors. |

## Historical / Non-Active

- v0.2 remains action-for-reflection evidence.
- v0.3 remains the previous active bundle and comparison baseline.
- `cs-modified-v0-1` was a wrong-path artifact, not a valid active skill version.
- Git history can recover tracked old versions for comparison.
