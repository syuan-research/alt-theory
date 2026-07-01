# Explore Workflow

Directed code exploration that archives "question → read code → conclusion" as searchable, evidence-based documents.

## When To Use

- Newcomer to repo quickly understanding module boundaries / call chains / entry points
- User has a specific question but doesn't yet need a solution or fix produced
- Before feature design / issue analysis / issue fix, supplement with evidence-based exploration
- Technical direction still under discussion, need lightweight spike (explore only, no decisions)

This skill only handles "what was observed" evidence-based recording. User intent is something else (make a decision / prescribe a fix / fix a bug) → route to the appropriate workflow.

Do not use for: recording decisions (→ decide), recording learnings (→ learn), recording techniques (→ trick).

---

## Three Exploration Types

Frontmatter `type` field:

| Type | Applicable situation |
|---|---|
| `question` | Investigate code around a specific question and give conclusion |
| `module-overview` | Quickly map a module's structure / boundaries / entry points / dependencies |
| `spike` | Lightweight technical probe across multiple possible directions (no final decision) |

## Output Path

```text
project/compound/YYYY-MM-DD-explore-{slug}.md
```

Frontmatter top field `doc_type: explore`.

---

## Document Format

### Frontmatter

```yaml
---
doc_type: explore
type: question | module-overview | spike
date: YYYY-MM-DD
slug: {English description, hyphen-separated}
topic: {one sentence describing exploration question}
scope: {exploration scope}
keywords: []
status: active | outdated
confidence: high | medium | low
---
```

### Body Structure

```markdown
## Question and Scope

## Quick Answer

## Key Evidence

## Detail

## Open Questions

## Next Steps

## Related Documents
```

### Writing Constraints

- **Quick answer must appear before evidence** — reader sees conclusion first, then decides whether to read evidence
- Conclusion must be traceable to evidence; pure speculation is not allowed
- Evidence insufficient → `confidence` must be `medium` or `low`
- Old exploration expired: old document `status: outdated`, new current version created

---

## Workflow

### Phase 1: Converge Exploration Question

Maximum two questions:

1. "What is the single question you most want answered first?"
2. "Which module / directory should we focus on?"

User description already clear → skip directly to Phase 1.5.

### Phase 1.5: Check Overlap and Intent Routing (mandatory)

- User's words contain "update / re-check / certain explore / this module was explored before" or point to an old explore → go to **update or supersede**. Explore characteristic: **code has changed making old conclusions invalid** → old document `status: outdated` + create new one (supersede); only supplementing evidence / tightening conclusions but core conclusion unchanged → "update existing"
- Otherwise use search tool by keyword / module to check; hit similar old explore → read it first; if it already answers the question → tell user "existing document at `{path}`, reuse or re-explore?"

**Update path**: read old document → supplement evidence per Phase 2 → rewrite quick answer section → write back to original file + `updated: YYYY-MM-DD`.

### Phase 2: Evidence-Based Exploration

- Use glob / grep / read to **actually read code**, don't guess
- Read and accumulate evidence simultaneously; **think about which conclusion each piece of evidence supports** — evidence supporting no conclusion is not recorded
- Key evidence: 3-8 items, each annotated with `file:line`
- Multi-module collaboration or `module-overview` / `spike` type → prepare a Mermaid diagram for the quick answer section
- After forming preliminary conclusions, actively check: would the current evidence convince a skeptical reader? Enough → stop, no need to expand search

Why "enough then stop": exploration is not exhaustive, it's building an evidence chain to "reader can trust." Continuing to expand only makes the document longer, not more credible.

### Phase 3: Draft and Confirm

- **Write quick answer section first, then backfill key evidence** — this order matters: having conclusions first then checking whether evidence truly supports them forces you to verify each piece of evidence's actual weight
- AI drafts complete document in one shot, user reviews and confirms
- Modifications → revise per feedback, then archive

### Phase 4: Archive

- **New**: write to `project/compound/YYYY-MM-DD-explore-{slug}.md`, frontmatter `doc_type: explore`
- **Update**: write back to file located in Phase 1.5 + `updated: YYYY-MM-DD`
- **Supersede**: old document `status: outdated` + `superseded-by: {new slug}`; new document written with full content

### Phase 5: Next Step Suggestion

After evidence is collected, one-sentence prompt for next direction ("want to design a solution based on this explore?"). User says "no" → skip. Next step is user's decision.

---

## Search Tool

```powershell
# Filter by type
python {skill_dir}\tools\search-yaml.py --dir project/compound --filter doc_type=explore --filter type=module-overview --filter status=active

# After archiving, check for overlaps
python {skill_dir}\tools\search-yaml.py --dir project/compound --filter doc_type=explore --query "{keyword}" --json
```

---

## Exit Conditions

- [ ] Exploration question and scope clearly defined
- [ ] Quick answer section gives core conclusion (conclusion first)
- [ ] Key evidence 3-8 items, each with file:line and explanation of which conclusion it supports
- [ ] Multi-module or module-overview / spike type → quick answer section has Mermaid diagram
- [ ] Document archived to `project/compound/`
- [ ] Next step suggestion given

---

## Guardian Rules

Shared archival rules per `../shared-conventions.md` section 6. This skill's specific anti-patterns:

- Don't give conclusions without reading code
- Evidence only says "looks like" without file:line
- Conclusion written after evidence — quick answer section must precede key evidence section
- Evidence section multiple times longer than quick answer — trim evidence, remove items not supporting conclusions
- Cross-module flow has no Mermaid diagram, relies on text description alone
- Making decisions — explore only records "what was observed", never "what should be done going forward"
- Giving prescriptions without evidence chain — every conclusion must trace back to file:line
- Historical explore is expired but still cited without `status` annotation
- Reading/writing documents with `doc_type` other than `explore`

---

## Common Errors

- Giving conclusions without reading code — speculation presented as evidence
- Evidence without file:line references — "seems like" is not evidence
- Writing evidence-heavy documents with conclusions buried at the end — quick answer must come first
- Expanding search indefinitely — exploration is not exhaustive, stop at "convincing"
- Making architecture decisions during exploration — explore records observations, decide makes decisions
- Skipping Phase 1.5 overlap check → duplicate explore documents on same topic
- Not marking old explores as `outdated` when code has changed → future readers trust stale conclusions
- Multi-module exploration with only text description, no diagram — harder to follow
- Writing "should do X" in explore — prescriptive statements belong in decide/learning, not explore
- Evidence items not explaining which conclusion they support — reader cannot evaluate evidence weight
