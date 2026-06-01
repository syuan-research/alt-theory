# Learn Workflow

Archive pitfalls encountered or best practices discovered as searchable learning documents.

## When To Use

| Situation | Description |
|---|---|
| Feature workflow complete | Prompt user "want to record learnings from this?" |
| Issue workflow complete | Prompt user "want to record this pitfall?" |
| User initiative | "record this", "archive knowledge", "learning" |
| One-off hard problem solved | Engineering problem outside feature/issue that took significant time |

One-sentence prompt is sufficient; user says "no" → skip immediately. Repeated prompting makes user feel AI is grandstanding.

---

## Two Tracks

Each learning belongs to one of two tracks (frontmatter `track` field):

| Track | What to write |
|---|---|
| `pitfall` | Debugged bug / bypassed config trap / environment issue / integration failure — everything "should have worked but didn't" |
| `knowledge` | Discovered best practice / workflow improvement / architecture insight / reusable design pattern — everything "should default to doing this way" from now on |

Both have elements → split into two documents.

## Output Path

```text
project/compound/YYYY-MM-DD-learning-{slug}.md
```

Frontmatter top field `doc_type: learning`. Date is **archive day**, not discovery day.

---

## Document Format

### Pitfall Track Frontmatter

```yaml
---
doc_type: learning
track: pitfall
date: YYYY-MM-DD
slug: {English description, hyphen-separated}
component: {affected module/layer}
severity: low | medium | high
tags: []
---
```

### Pitfall Track Body

```markdown
## Problem

## Symptoms

## What Didn't Work

## Solution

## Why It Works

## Prevention
```

### Knowledge Track Frontmatter

```yaml
---
doc_type: learning
track: knowledge
date: YYYY-MM-DD
slug: {English description, hyphen-separated}
component: {applicable module/area}
tags: []
---
```

### Knowledge Track Body

```markdown
## Background

## Guiding Principle

## Why It Matters

## When Applicable

## Example
```

---

## Workflow

### Phase 1: Identify Source (automatic)

Extract from conversation context:

- **Source type**: feature workflow / issue workflow / standalone problem
- **Related artifact**: feature directory / issue directory path (if any)
- **Track classification**: pitfall or knowledge. "Fixed something broken" = pitfall; "discovered a better way" = knowledge. Both → split into two

Source unclear → ask user **one question** to clarify, don't guess.

### Phase 1.5: Check Overlap and Intent Routing (mandatory)

- User's words contain "change / update / supplement / certain learning" or point to an old document → go directly to **update existing**
- Otherwise use search tool by `--filter tags~=` or `--query` to check; hit similar old document → list candidates for user

**Update path**: read old document → align with user which sections to change (common: supplement newly encountered pitfall, supplement root cause for previously "couldn't find reason") → draft diff → write back to original file + `updated: YYYY-MM-DD`, no new file.

### Phase 2: Extract Key Points (one question at a time)

**Pitfall track** asks:

1. "What was the first thing you observed?"
2. "What solutions were tried but didn't work?" (encourage writing — failed attempts are future readers' most valuable information, knowing which path doesn't work saves massive time)
3. "How was the real cause eventually discovered?"
4. "Can it be caught earlier next time? How?"

**Knowledge track** asks:

1. "In what situation is this pattern most valuable?"
2. "What goes wrong without doing it this way?"
3. "Are there counter-examples where it doesn't apply?"

User says "nothing" or "skip" on any question → skip. Better to have fewer sections than filler.

### Phase 3: Draft + User Review

AI drafts complete document (YAML frontmatter + all body sections) in one shot. Present to user.

### Phase 4: Archive

- **New**: write to `project/compound/YYYY-MM-DD-learning-{slug}.md`, frontmatter `doc_type: learning`
- **Update**: write back to file located in Phase 1.5 + `updated: YYYY-MM-DD`
- **Supersede**: per `../shared-conventions.md` section 6 item 5 processing; old document `status: superseded` + `superseded-by`

### Phase 5: Discoverability Check

After writing, if one or two lines of "every workflow startup should know" project hard constraint surfaced, prompt user to add via appropriate mechanism. Do not modify files without authorization.

---

## Search Tool

```powershell
# Filter pitfall track
python {skill_dir}\tools\search-yaml.py --dir project/compound --filter doc_type=learning --filter track=pitfall --filter severity=high

# Query by component
python {skill_dir}\tools\search-yaml.py --dir project/compound --filter doc_type=learning --filter component~={component-name}

# After archiving, check for overlaps
python {skill_dir}\tools\search-yaml.py --dir project/compound --filter doc_type=learning --filter tags~={main-tag} --json
```

---

## Guardian Rules

Shared archival rules per `../shared-conventions.md` section 6. This skill's specific rules:

1. **Don't mix into spec** — learning doesn't go into `features/` or `issues/`; spec doesn't go into `project/compound/`
2. **Only recognize own doc_type** — only read/write `doc_type: learning`
3. **Don't write rationale for user** — user cannot articulate why solution works → write "rationale to be supplemented", don't fabricate
4. **Encourage recording failed attempts** — "what didn't work" is often more valuable than "what worked"

---

## Common Errors

- Writing "what was done" (spec content) instead of "what was learned" — spec records actions, learning records insights
- Omitting "what didn't work" section — this is the most valuable section for future readers
- Archiving without checking for similar existing learnings → duplicate or contradictory entries
- Mixing pitfall and knowledge into one document when both apply → split into two
- Fabricating root cause when user doesn't know → write "root cause unknown, to be investigated" instead
- Updating when supersede is needed → old learning with wrong conclusion still shows as active
- Writing during conversation instead of after convergence → premature archiving of incomplete understanding
- Empty filler sections — user said "nothing" but section left with boilerplate text
