# Architecture Workflow

Maintain `project/architecture/` — the system map that only records current state. Three modes: update / check / backfill.

## What This Skill Does

`project/architecture/` is the project's "map" — feature design reads it for positioning before writing proposals, issue analysis reads it to understand module boundaries, newcomers read it to grasp system shape. This skill is the unified entry point for "draft / refresh / health-check."

**Architecture is a cumulative, self-contained system map**, not a particular feature's detailed plan, but the "what does the system look like right now" overview distilled from all landed features. Readers should understand the overall structure without jumping back to historical designs. Design documents are temporary incremental drafts; acceptance distills stable terminology / orchestration / constraints back here; design files get archived, only consulted when追究 specific decision details.

**Only record current state, never plans** — defaults to syncing with code during acceptance; this skill actively backfills / updates when needed. **Never write "future will add X layer", "next step plans to split out Y module"** — those belong in swe-plan. User says "I want to refactor to X architecture" → go to swe-plan first to split features, each acceptance distills the actually-reached structure back to architecture.

Level of detail criterion: **enough for readers to understand the system without jumping elsewhere** — the stable, cross-feature-visible layer is written fully; module-internal loops, helper functions, one-off implementation decisions stay out.

Architecture document value is in **accurate, stable, searchable**. Several ways AI easily breaks these:

- **Fabricating systems** — document says `AuthManager coordinates TokenService`, code has no `AuthManager`
- **Deciding for user** — quietly choosing some layering approach, readers assume it's established fact
- **Code restatement** — each section only says "here's what exists", not "why split this way", information equals `ls -R`
- **Checking by glancing and feeling fine** — not giving specific location evidence

---

## Mode Routing

On startup, auto-detect mode from user words (don't present a menu):

| What user says | Mode |
|---|---|
| "refresh {certain doc}", "code changed, sync architecture doc", "update to latest" | `update` |
| "check design consistency", "does plan match code", "do any docs conflict", "run architecture health check" | `check` |
| "add an architecture doc", "this module has never been documented", "write down the already-running subsystem structure" | `backfill` |

Cannot determine → ask user. User says "I want to refactor to X / plan to build new Y module" — not this skill's job, route to swe-plan.

---

## Single Target Rule

Each run targets exactly one mode and one target:

- `backfill`: one module that exists in code but has never been documented (`architecture/{type}-{slug}.md` or update `ARCHITECTURE.md`)
- `update`: one existing architecture doc refreshed to latest code state + user material
- `check`: one of three sub-targets:
  - `design-internal` — one design document's internal consistency
  - `design-vs-code` — one design document vs actual code consistency
  - `architecture-folder-internal` — consistency across multiple docs in `architecture/`

Why not do multiple at once? Drafting multiple docs means user cannot review them all thoroughly; checking three sub-targets means each gets shallow treatment with completely different perspectives and materials. User mentions multiple targets → have them pick one.

---

## Workflow (Shared 6 Phases Across All Modes)

```
Phase 1: Lock Target
Phase 2: Read Materials
Phase 3: Execute (backfill/update = draft; check = inspect)
Phase 4: Self-Check (backfill/update) or Output Report (check)
Phase 5: User Review
Phase 6: Persist (backfill/update) or Wait for User Decision (check)
```

### Phase 1: Lock Target

Confirm: mode + target object + scope.

- **backfill**: new slug + audience + scope (+ confirm module exists in code)
- **update**: existing document path
- **check**: sub-target + inspection object (feature name / architecture sub-range)

Scope won't converge → ask user to narrow. One doc with "full module rewrite" scope often means there are actually multiple independent subsystems that should be split; one check covering the entire `architecture/` produces a report too broad to act on.

### Phase 2: Read Materials

**Common required reads**: `../shared-conventions.md` + `ARCHITECTURE.md` + other documents under `architecture/`.

**backfill / update additional** (detailed list):
- Target module's code entry points and core files
- User source material
- Related compound artifacts (decisions / explores / learnings):

```powershell
python {skill_dir}\tools\search-yaml.py --dir project/compound --filter "doc_type=decision|explore|learning" --query "{module keyword}"
python {skill_dir}\tools\search-yaml.py --dir project/compound --filter doc_type=decision --filter status=active --query "{module keyword}"
```

- Related existing feature designs
- **update-specific**: current doc full text + code changes since `last_reviewed` (`git log` rough scan)

**check additional** (varies by sub-target):
- `design-internal` / `design-vs-code`: design doc full text + architecture-related docs
- `design-vs-code` further: code directly corresponding to design sections 2/3
- `architecture-folder-internal`: user-identified set of docs + index + follow citations to referenced documents (do not expand to code)

### Phase 3: Execute

**backfill / update**: Write **complete first draft** per document structure template — do not output in batches. Batch review means user cannot see cross-section consistency; section 2 described structure and section 4 decisions frequently have cross-section contradictions.

**check**: Execute per check coverage items (6 items per sub-target, detailed below). Each inconsistency must record **locatable position** (`file:line` or `design section X`) + phenomenon + impact + fix suggestion.

### Phase 4: Self-Check / Output Report

**backfill / update**: Run the 7-item self-check list (detailed below) locally. Issues found → handle before review (delete / mark TODO / rewrite). Self-check results reported briefly — found something, say so, don't go through motions.

**check**: Output complete report per report template (detailed below).

### Phase 5: User Review

**backfill / update**: Complete first draft presented to user for review.

**check**: Report presented to user, wait for conclusion confirmation. This skill does not decide for the user.

### Phase 6: Persist / End

**backfill**:

- Write to `architecture/{type}-{slug}.md` (naming rules per `../shared-conventions.md`), frontmatter `status: current`, `last_reviewed` today
- **Same-type aggregation check** (mandatory before persist): per architecture doc grouping rule, if this persist brings a type to ≥6 documents in root → move all of that type into `architecture/{type}/`, remove filename prefix, sync `ARCHITECTURE.md` links; migration list reviewed in Phase 5 alongside the doc
- **Index update**: `ARCHITECTURE.md` add new document reference — backfill **always** adds this, otherwise nobody discovers the new doc; changes also reviewed, no silent modifications

**update**: Overwrite existing file, `last_reviewed` updated to today; major structural changes add entry in `变更日志` section at end; `ARCHITECTURE.md` only updated if scope/summary affects index description.

**check**: No file changes. User may decide to trigger backfill/update based on report — that's a separate run.

---

## Architecture Document Structure (backfill / update output)

### Frontmatter

```yaml
---
doc_type: architecture
slug: {English hyphens; matches filename}
scope: {one-sentence coverage}
summary: {one-sentence key takeaway}
status: current | draft | outdated
last_reviewed: YYYY-MM-DD
tags: []
depends_on: []   # other architecture doc slugs, optional
implements: []   # carried requirement slug list, can be empty — pure infra/tooling having no matching req is normal
---
```

### Body Sections

```markdown
## 0. Terminology

Brief definitions of proprietary terms introduced for the first time + distinction from similar terms ("in this doc, X means Y, not the same as X' in code"). No new terms → omit.

## 1. Positioning and Audience

- Which part of the project (module / subsystem / cross-module concern)
- Who reads it (feature-design / issue-analyze / newcomer onboarding)
- What they can do after reading (locate code / understand external interfaces / know constraints)

## 2. Structure and Interaction

- How modules are divided, dependency direction
- External interfaces, internal interfaces
- Cross-module contracts (data format / call protocol / state ownership)
- ≤2 modules or linear relationships → no diagram needed; otherwise recommend Mermaid

Each structural assertion followed by `file:line` anchor, or anchors collected in "Code Anchors" subsection at section end.

## 3. Data and State

- Key types / core data structures (brief description + definition location file:line)
- Ownership (who writes, who reads)
- Persistence boundary (memory / local / database / external service)

## 4. Key Decisions

Not decision full text, but **references** — one or two lines each: conclusion in one sentence + reference (`compound/YYYY-MM-DD-decision-{slug}.md` or user quote source) + why referenced in this doc.

No archived decisions → omit, or note `TODO: {decision} should be captured as decide document`.

## 5. Code Anchors

"Where to look in code" checklist: entry files / key functions / key type definitions. Format: `{file}:{function/class} — one-line description`.

## 6. Known Constraints / Edge Cases

This module's "cannot change / change carefully" hard constraints + source (constraint summary / decision / learning etc.).

## 7. Related Documents

Other architecture docs depended on / requirements carried / related decisions / learnings / tricks / explores / representative feature designs using this module.

## Change Log (update mode only)

- YYYY-MM-DD: {one-sentence description}
```

---

## Architecture Doc Grouping Rule

Architecture docs follow `{type}-{slug}.md` naming in `architecture/` root. When a single type reaches ≥6 documents:

1. Create `architecture/{type}/` subdirectory
2. Move all documents of that type into it
3. Remove the `{type}-` prefix from filenames (slug only)
4. Update all references in `ARCHITECTURE.md` and cross-doc links

This check runs **before every backfill persist** and is part of Phase 6.

---

## Self-Check List (backfill / update)

Each item targets a specific AI default mistake. Run all 7 before Phase 5:

1. **Can every structural assertion anchor to code?** — cannot → delete or mark `TODO: to be confirmed`
2. **Did you decide for the user?** — "key decisions" section references existing decisions / user quotes, or is AI-invented selection rationale? The latter is never allowed
3. **Did it become code restatement?** — each section has at least one sentence "why split this way"; sections without this are basically `ls` in text form
4. **Terminology conflict check done?** — newly introduced architecture terms grep (code, all documents under `architecture/`, `compound/`). Conflict → rename or distinguish in section 0
5. **Conflicts with existing architecture / decisions?** — found conflict → cannot "write your own version", must reference or stop and ask user
6. **Single section length** — exceeds one screen → cut or split
7. **update-specific**: do all new/changed paragraphs have code changes as basis? Fabricating "add a more complete-sounding description" is the start of content drifting from reality

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

## Hard Boundaries

1. **Only anchor to code, never fabricate systems** (backfill/update) — every structural assertion must anchor to `file:line`; cannot anchor → mark `TODO: to be confirmed`. Module not yet written in code should not go through backfill — that's planning, route to swe-plan
2. **Don't decide for user** (backfill/update) — key decision section content must come from user or traceable decision documents; AI only drafts structure and connecting language
3. **Check only, never fix** (check) — forbidden to modify design / code / config. Check and fix are separate runs, so user can see the complete inconsistency list and holistically decide priorities
4. **Evidence-based** (check) — every inconsistency has a locatable position
5. **Actionable suggestions** (check) — specific enough for "what to change, how to change", but don't persist
6. **Single target** (all modes)
7. **No code changes, no spec changes** (all modes) — only write architecture docs or produce reports. Issues found in code / design / decisions → record as "observations"
8. **No scope expansion** — out-of-scope issues not expanded, record as observations

---

## Exit Conditions

**Common to all modes**:
- [ ] Locked single mode and single target
- [ ] User explicitly reviewed and passed (backfill/update) or confirmed conclusion (check)
- [ ] No side modifications to code / design docs / decisions
- [ ] No out-of-scope document changes

**backfill / update additional**:
- [ ] Self-check list run item by item and issues reported/handled
- [ ] Frontmatter complete (`doc_type: architecture` / `status` / `last_reviewed`)
- [ ] Every structural assertion has `file:line` anchor or `TODO: to be confirmed`
- [ ] Before persist, grouping rule checked: same type ≥6 → migration list reviewed
- [ ] **backfill**: `ARCHITECTURE.md` link added (or user explicitly decided to defer)
- [ ] **update**: structural changes have `变更日志` entry

**check additional**:
- [ ] Covered all items for the chosen sub-target
- [ ] Report contains inconsistency list + fix suggestions
- [ ] Report contains no actual fix actions

---

## Workflow Relationships

| Direction | Relationship |
|---|---|
| swe-plan cooperation | swe-plan reads architecture docs to understand current state before decomposing; does not modify them. Target-state architecture belongs in swe-plan. When child features land, acceptance distills back to architecture |
| feature design upstream | design reads architecture docs to position "which part this feature touches"; design complete can trigger check for health exam |
| feature acceptance downstream | acceptance actually updates architecture docs (acceptance self-merges, does not call back this skill); want to confirm implementation vs design alignment → trigger check `design-vs-code` |
| decide cooperation | after architecture decision is made, update mode adds reference into relevant doc section 4 |
| issue workflow reader | root cause analysis reads architecture docs to locate module boundaries |
| brainstorm upstream | brainstorm may surface architecture-level questions; this skill's explore/backfill can address them |
| explore cooperation | explore provides evidence-based code findings that backfill/update can consume as input material |
| learn / trick cooperation | architecture docs' "known constraints" section may reference learnings and tricks |

---

## Common Errors

**backfill / update**:

- Writing "plans to refactor to X" — target state belongs in swe-plan
- Fabricating systems — "coordination layer / hub / manager" appearing in doc but not in code
- Deciding for user — selection rationale invented by AI
- Code restatement — each section only lists "here's what exists", doesn't say "why split this way"
- Outputting in batches — user cannot see cross-section contradictions
- Terminology conflicts — new names clash with code / other architecture docs / existing compound entries
- Writing / changing multiple docs at once — cannot review all thoroughly, all land rough
- Conflicting with existing decisions without stopping — writing a contradictory version silently
- Backfill persisted but forgot `ARCHITECTURE.md` index entry — written but nobody discovers it
- Backfill for a module not yet running in code — that's target state, route to swe-plan
- Update adding content without code basis — content drifting from reality
- Side-modifying code / design docs along the way — out of bounds
- Same type ≥6 still flat in root directory — grouping rule triggered but not migrated
- Filename not following `{type}-{slug}.md` — grouping rule ineffective

**check**:

- Running multiple sub-targets simultaneously
- `architecture-folder-internal` reading code — that's `design-vs-code`
- Finding issues and silently fixing code or documents
- Saying "this seems off" without evidence position
- Suggestions too abstract ("optimize the architecture")
- Expanding from one target to full-repo audit infinitely
- Report with only problems, no consistency passes — erodes system confidence
- Check report containing actual file modifications — check and fix must be separate
