# CS-SWE v0.2 Source Map

Status: active.

Source repo:

```text
https://github.com/liuzhengdongfortest/CodeStable
```

## Copied And Adapted Skill Files

| Source | Target |
|---|---|
| `cs-brainstorm/SKILL.md` | `agent-assets/skills/cs-swe-brainstorm-v0-2/SKILL.md` |
| `cs-feat/SKILL.md` | `agent-assets/skills/cs-swe-feat-v0-2/SKILL.md` |
| `cs-feat-design/SKILL.md` | `agent-assets/skills/cs-swe-feat-design-v0-2/SKILL.md` |
| `cs-feat-ff/SKILL.md` | `agent-assets/skills/cs-swe-feat-ff-v0-2/SKILL.md` |
| `cs-feat-impl/SKILL.md` | `agent-assets/skills/cs-swe-feat-impl-v0-2/SKILL.md` |
| `cs-feat-accept/SKILL.md` | `agent-assets/skills/cs-swe-feat-accept-v0-2/SKILL.md` |
| `cs-issue/SKILL.md` | `agent-assets/skills/cs-swe-issue-v0-2/SKILL.md` |
| `cs-issue-report/SKILL.md` | `agent-assets/skills/cs-swe-issue-report-v0-2/SKILL.md` |
| `cs-issue-analyze/SKILL.md` | `agent-assets/skills/cs-swe-issue-analyze-v0-2/SKILL.md` |
| `cs-issue-fix/SKILL.md` | `agent-assets/skills/cs-swe-issue-fix-v0-2/SKILL.md` |
| `cs-refactor/SKILL.md` | `agent-assets/skills/cs-swe-refactor-v0-2/SKILL.md` |
| `cs-refactor-ff/SKILL.md` | `agent-assets/skills/cs-swe-refactor-ff-v0-2/SKILL.md` |

## Copied Support Files

| Source | Target |
|---|---|
| `cs-feat-design/reference.md` | `agent-assets/skills/cs-swe-v0-2/references/feature-design-reference.md` |
| `cs-issue-fix/reference.md` | `agent-assets/skills/cs-swe-v0-2/references/issue-fix-reference.md` |
| `cs-refactor/reference/methods.md` | `agent-assets/skills/cs-swe-v0-2/references/refactor-methods.md` |
| `cs-refactor/reference/refusal-routing.md` | `agent-assets/skills/cs-swe-v0-2/references/refactor-refusal-routing.md` |
| `cs-refactor/reference/scan-checklist-format.md` | `agent-assets/skills/cs-swe-v0-2/references/refactor-scan-checklist-format.md` |
| `cs-onboard/tools/search-yaml.py` | `agent-assets/skills/cs-swe-v0-2/tools/search-yaml.py` |
| `cs-onboard/tools/validate-yaml.py` | `agent-assets/skills/cs-swe-v0-2/tools/validate-yaml.py` |
| `cs-onboard/reference/tools.md` | `agent-assets/skills/cs-swe-v0-2/references/tools.md` |
| `cs-onboard/reference/code-dimensions.md` | `agent-assets/skills/cs-swe-v0-2/references/code-dimensions.md` |
| `cs-onboard/reference/system-overview.md` | `agent-assets/skills/cs-swe-v0-2/references/system-overview.raw.md` |

## Rewritten By Hand

| File | Reason |
|---|---|
| `cs-swe-v0-2/SKILL.md` | Router and scope boundary must be Alt Theory specific. |
| `references/startup-context.md` | Replaces `.codestable/attention.md`. |
| `references/shared-conventions.md` | Path mapping and deferred workflow policy must be explicit. |
| `references/acceptance-criteria.md` | Defines v0.2 validation criteria. |
| `references/adaptation-diagnosis.md` | Records why Option 2 was chosen. |

## Mechanical Rewrites

The initial copy applied mechanical replacements for skill names and paths. Residual raw references should be treated as audit targets unless they are inside raw-source notes, source-map rows, or explicit discussion of rejected/deferred raw behavior.
