# Trick Workflow

Archive reusable programming patterns, library usage, and technical techniques as prescriptive reference documents.

## When To Use

- user says "record a technique", "this usage is worth noting", "tricks", "record library usage"
- or during design / analysis, a technique worth preserving is discovered

This skill produces a **prescriptive reference library** answering: **to do X, what is the verified correct approach?** No trigger event needed — whenever a pattern or usage worth preserving is found, write it directly.

Do not use for: recording "what happened" (→ learn), recording decisions (→ decide), exploring code (→ explore).

---

## Three Trick Types

Frontmatter `type` field:

| Type | Applicable situation | Example |
|---|---|---|
| `pattern` | Design pattern / architecture pattern / programming idiom | "Use Repository pattern to isolate data access layer", "Use Builder to construct complex config" |
| `library` | Specific library / framework usage / configuration / known pitfalls | "Correct way to write Prisma transactions", "Pinia store action error handling" |
| `technique` | Specific operation technique / tool usage / command recipe | "Use jq to extract nested fields from JSON", "git bisect to locate bug-introducing commit" |

Query uses: "how should code be organized" → pattern; "how to use library/framework API" → library; "how to do this type of operation" → technique. Can't distinguish → pick closest, `type` doesn't affect search usability.

## Output Path

```text
project/compound/YYYY-MM-DD-trick-{slug}.md
```

Frontmatter top field `doc_type: trick`.

---

## Document Format

### Frontmatter

```yaml
---
doc_type: trick
type: pattern | library | technique
date: YYYY-MM-DD
slug: {English description, hyphen-separated}
topic: {one sentence describing what problem this trick solves}
language: {optional}
framework: {optional}
tags: []
status: active | superseded
superseded-by: {optional}
---
```

### Body Template

```markdown
## Applicable Scenario

## How To Do It

## Why It Works

## Example

## When Not Applicable

## Known Pitfalls

## Related Documents
```

`When Not Applicable`, `Known Pitfalls`, `Related Documents` are optional sections — user says "nothing" → omit.

---

## Workflow

### Phase 1: Identify Type

Maximum two questions:

1. "Is this about a pattern/structure, a specific library/framework usage, or an operation technique/command?" → determine `type`
2. "One sentence: in what situation would someone reach for this?" → determine `topic`

User description already clear → skip directly to Phase 1.5.

### Phase 1.5: Check Overlap and Intent Routing (mandatory)

- User's words contain "change / update / revise / supplement / certain trick" or point to an old document → go directly to **update existing**, skip new document flow
- Otherwise use search tool `--query` to check `topic`; hit similar → list candidates for user

**Update flow**: read old document → align with user which sections to change → skip Phase 2 full code investigation (sections being changed involving code must be re-read to confirm not stale) → draft diff for user review → write back + `updated: YYYY-MM-DD`.

### Phase 2: Code Investigation (mandatory, cannot be skipped)

Tricks are embodied in code — **user not pasting code doesn't mean code doesn't need to be examined**. AI must proactively investigate the codebase.

Why mandatory: tricks written without looking at code stay abstract; next time someone follows the trick looking for code, they can't find corresponding real examples, losing confidence in the reference.

1. **Search codebase by topic + type** — grep keywords (function names / class names / library imports / pattern characteristics); search related files; supplement with semantic search when needed
2. **Read key files** — locations where trick is actually used/implemented:
   - `library` type: find import and call sites
   - `pattern` type: find structural code (interface definitions / class inheritance / composition)
   - `technique` type: find scripts or configs corresponding to operation steps
3. **Output** — note file paths and key code snippets. Completely not found (pure experiential tricks, external tool usage) → in Phase 3 draft, note "this trick currently has no in-project code example"

Additional: user provides file → still search codebase to confirm no other usage points; search results empty → can continue but must note in document; found code contradicts user description → proactively confirm with user.

### Phase 3: Extract Key Points (one question at a time)

**Ask questions informed by Phase 2 code findings** — don't ask about things already visible in code:

1. "What is the standard approach?" (already see implementation → present understanding for user confirmation)
2. "Why does this work? What's the principle?"
3. "When should this NOT be used?" (optional)
4. "Any pitfalls or things to watch for?" (optional, prioritize for library type)
5. "Code snippet or command example?" (already found actual code → skip, use real code as example directly)

User says "nothing" or "skip" → skip. Better fewer sections than filler.

### Phase 4: Draft + User Review

AI drafts complete document (YAML frontmatter + body) in one shot. Example code prioritizes real project code found in Phase 2 (can be trimmed), don't fabricate examples. Present to user.

### Phase 5: Archive

- **New**: write to `project/compound/YYYY-MM-DD-trick-{slug}.md`, frontmatter `doc_type: trick`
- **Update**: write back to file located in Phase 1.5 + `updated: YYYY-MM-DD`
- **Supersede**: per `../shared-conventions.md` section 6 item 5 processing; old document `status: superseded` + `superseded-by`

### Phase 6: Discoverability Check

After writing, if one or two lines of "every workflow startup should know" project hard constraint surfaced, prompt user to add via appropriate mechanism. Do not modify files without authorization.

---

## Search Tool

```powershell
# Filter by type + framework
python {skill_dir}\tools\search-yaml.py --dir project/compound --filter doc_type=trick --filter type=library --filter framework~={library-name}

# Browse by tech stack
python {skill_dir}\tools\search-yaml.py --dir project/compound --filter doc_type=trick --filter language=typescript --filter status=active

# After archiving, check for overlaps
python {skill_dir}\tools\search-yaml.py --dir project/compound --filter doc_type=trick --query "{keyword}" --json
```

---

## Guardian Rules

Shared archival rules per `../shared-conventions.md` section 6. This skill's specific rules:

1. **Only archive verified approaches** — "maybe should do it this way" is not archived; must be confirmed effective by user or AI
2. **Must investigate codebase** — Phase 2 cannot be skipped. Example code prioritizes real project code, don't fabricate
3. **Don't write rationale for user** — user cannot articulate "why it works" → write "rationale to be supplemented", don't fabricate
4. **Examples over descriptions** — if code can explain clearly, use code
5. **Only recognize own doc_type** — only read/write `doc_type: trick`

---

## Common Errors

- Skipping Phase 2 code investigation — writing tricks from imagination without looking at actual code
- Fabricating code examples instead of using real project code found in codebase
- Writing "maybe should do it this way" as trick — not yet verified, belongs in explore or brainstorm
- User cannot explain rationale but AI fabricates one → becomes false "knowledge"
- Not searching for existing similar tricks before archiving → duplicates
- Mixing trick with learning — trick is prescriptive ("how to do X"), learning is retrospective ("what happened and why")
- Empty filler sections — user said "nothing" but boilerplate text left behind
- Update flow not re-reading code for changed sections → stale examples
- Writing tricks without `topic` field → future readers cannot quickly determine applicability
- `library` type tricks without noting framework version → usage may not apply to other versions
