# Decide Workflow

Archive important "already decided" choices as permanent decision documents.

## When To Use

Use when the user wants to record an already-made decision:

- user says "record a decision", "archive tech selection", "ADR", "record this constraint", "write down this convention"
- or a significant choice was made during design / analysis that should persist

**Only archive already-decided matters.** Decisions still under discussion are not archived — they mislead future readers into thinking the matter is settled.

## Four Decision Categories

Each decision belongs to one of four categories (frontmatter `category` field):

| Category | Applicable situation | Example |
|---|---|---|
| `tech-stack` | Technology / library / framework selection | "Use Vite instead of Webpack", "state management is Pinia" |
| `architecture` | System structure, module breakdown, data flow direction | "frontend-backend fully separated", "event bus only at top level" |
| `constraint` | Hard constraint — certain things **must not** be done | "No jQuery", "all API calls must go through unified http module" |
| `convention` | Soft convention — certain things **uniformly done this way** | "Component names use PascalCase", "side effects concentrated in composables/" |

Query uses: "what tool to use" → tech-stack; "how is system organized" → architecture; "why can't this change" → constraint; "what's the uniform approach" → convention.

---

## Output Path

```text
project/compound/YYYY-MM-DD-decision-{slug}.md
```

Frontmatter top field `doc_type: decision`.

## Document Format

### Frontmatter

```yaml
---
doc_type: decision
category: tech-stack | architecture | constraint | convention
date: YYYY-MM-DD
slug: {English description, hyphen-separated}
status: active | superseded | deprecated
superseded-by: {optional}
area: {affected area}
tags: []
---
```

### Body Template

```markdown
## Background

## Decision

## Rationale

## Alternatives Considered

## Consequences

## Related Documents
```

`Alternatives Considered` and `Related Documents` are optional sections — user says "nothing" → omit.

### Constraints

- `category` only allows `tech-stack` / `architecture` / `constraint` / `convention`
- `status` only allows `active` / `superseded` / `deprecated`
- Encourage writing "alternatives considered" even if just intuition — future readers most want to know "why not X"

---

## Workflow

### Phase 1: Identify Decision

Use **one question at a time** to confirm key information — don't present user with a big form:

1. "What is this decision about? (tech selection / architecture / constraint / convention)" → determine `category`
2. "Already decided or still discussing?" → **this workflow only archives decided matters.** Still discussing → suggest returning after decision is made. Reason: archiving under-discussion options causes future searchers to assume it's settled, actively misleading
3. Description unclear → "why was this chosen over alternatives?"

### Phase 1.5: Check Overlap and Intent Routing (mandatory)

- User's words contain "change / update / overturn / certain decision / certain selection" or explicitly point to an old decision → go directly to **update or supersede**. Decision document characteristic: **conclusion changes almost always require supersede** (old conclusion preserved, cannot be overwritten in-place); only supplementing background / alternatives / impact description → "update existing"
- Otherwise use search tool (see below) to check by category + keyword; hit similar old decision → list candidates for user

**Update vs supersede**: conclusion changed → supersede; conclusion unchanged, only supplementing → update. Unsure → ask user.

### Phase 2: Extract Key Points (one question at a time)

User can say "nothing" at any time to skip:

1. "What was the background or problem at the time?"
2. "What is the decision conclusion?" (already stated clearly → skip)
3. "Why this choice? Most important reason?"
4. "Were other alternatives considered? Why not chosen?" (encourage writing even if just intuition — future readers most want to know "why not X")
5. "What impact or constraint does this decision have on subsequent work?"

### Phase 3: Draft + User Review

AI drafts complete document based on conversation (YAML frontmatter + all body sections). Present to user for review **all at once** — don't present section by section. Only with the complete version can user judge whether logic across sections is self-consistent.

### Phase 4: Archive

- **New**: write to `project/compound/YYYY-MM-DD-decision-{slug}.md`, frontmatter top `doc_type: decision`
- **Update**: write back to file located in Phase 1.5, add `updated: YYYY-MM-DD` to frontmatter
- **Supersede**: old document `status: superseded` + `superseded-by: {new slug}`; new document written with full content; old document body top add `**[Superseded]** See {new document slug}`

### Phase 5: Related Workflow Update Prompt

After writing, check two items and prompt user if applicable (**do not modify files without authorization**):

1. Should `architecture/ARCHITECTURE.md` "key architecture decisions" section reference this — `architecture` or `tech-stack` category usually should
2. Should project-level constraint summary reference this — `constraint` or `convention` category usually should

---

## Search Tool

```powershell
# List all currently active decisions
python {skill_dir}\tools\search-yaml.py --dir project/compound --filter doc_type=decision --filter status=active

# By category + status combination
python {skill_dir}\tools\search-yaml.py --dir project/compound --filter doc_type=decision --filter category=constraint --filter status=active

# After archiving, check for overlaps
python {skill_dir}\tools\search-yaml.py --dir project/compound --filter doc_type=decision --query "{keyword}" --json
```

---

## Guardian Rules

Shared archival workflow rules (only add never delete / quality over quantity / don't write for user / discoverability / post-archive overlap check) — see `../shared-conventions.md` section 6. This skill's specific rules:

1. **Only archive already-decided matters** — under-discussion options are not archived
2. **status=superseded ≠ delete** — superseded document preserves original text + `superseded-by` + body top `**[Superseded]** See {new document slug}`
3. **Don't write rationale for user** — if user cannot articulate, write "no systematic evaluation was done", don't fabricate (fabricated rationale becomes historical "fact" misleading future readers)
4. **Don't proactively modify architecture docs or constraint summaries** — Phase 5 only prompts, user decides
5. **Cross-skill consistency** — when decision and summary describe the same thing differently, decision is the detailed version, summary is the abstract version; they should link, not contradict
6. **Only recognize own doc_type** — only read/write `doc_type: decision`

---

## Common Errors

- Archiving under-discussion options → future readers assume settled, actively misleading
- Fabricating rationale when user cannot articulate → becomes false historical "fact"
- Supersede by overwriting old document → history lost, cannot trace why original decision was made
- Writing decision without checking for existing similar ones → duplicates or contradictions
- Presenting draft section by section instead of complete document → user cannot see cross-section consistency
- Updating instead of superseding when conclusion actually changed → old conclusion silently overwritten
- Skipping Phase 5 prompts → decision written but nobody links it, future readers don't find it
- Writing "no alternatives considered" as empty section instead of omitting → adds noise
