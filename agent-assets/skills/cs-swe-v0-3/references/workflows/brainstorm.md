# Brainstorm Workflow

Use when a coding idea is not yet ready for feature design or `swe-plan`.

Brainstorm is a thinking artifact, not an implementation commitment.

## Cases

| Case | Meaning | Output |
|---|---|---|
| 1 | Clear enough for design | No file required; go to feature design |
| 2 | Small fuzzy feature | Optional `{slug}-brainstorm.md` in the feature directory |
| 3 | Multi-feature demand ready to split | Go to `swe-plan` |
| 4 | Multi-feature/open exploration not ready to split | Optional central brainstorm |

Cases can change during discussion.

## How To Talk

- First distinguish the user's stated solution from the problem it is meant to solve.
- Offer realistic options, not false binaries.
- Include non-extreme guesses and tradeoffs.
- If a factual uncertainty can be tested quickly and affects direction, propose a small spike.
- Stop grilling when the user says the discussion is enough or no new information is appearing.

## Feature Brainstorm Path

For case 2:

```text
{artifact_root}/features/YYYY-MM-DD-{slug}/{slug}-brainstorm.md
```

Use only when the note will help design avoid repeating the same discussion.

## Central Brainstorm

For broader exploration, use a central brainstorm only when useful for retrieval or comparison:

```text
project/brainstorms/{YYYY-MM-DD}-{slug}.md
```

Minimum frontmatter:

```yaml
---
doc_type: brainstorm
created: YYYY-MM-DD
anchors:
  - type: workstream
    target: project/workstreams/{workstream}/
    note: Natural-language relationship.
  - type: open-question
    target: {question}
    note: Why this remains unresolved.
---
```

Anchors carry belonging and recovery. They can point to workstream, plan-record, skill, architecture, requirement-like source, roadmap, or open question.

If a plan-record already captures the discussion well, do not create a separate brainstorm just to satisfy a form.
