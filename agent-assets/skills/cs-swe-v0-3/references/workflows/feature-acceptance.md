# Feature Acceptance

Use after implementation is complete. Verifies implementation against design promise.

## What Acceptance Does

Code is written but workflow isn't done. Acceptance does four things, all required:

1. **Verify implementation matches design** — section-by-section check against `{slug}-design.md`. Deviations found → fix on the spot, not "noted in report"
2. **Merge feature into overall architecture** — per section 4, actually update relevant architecture docs
3. **Write back to requirement** — draft req upgraded to current after capability implementation; capability never having req → backfill
4. **Write back to swe-plan** — design frontmatter has `swe_plan` / `swe_plan_item` fields → **must** update items.yaml to `done` and sync main doc

Missing any: architecture docs stale for next feature; req disconnected from actual capability; plan layer and actual progress disconnected.

**No report = workflow incomplete**. Future readers checking "what was confirmed at acceptance" have only git diff to reconstruct.

## Strong Dependency on Design Section Numbering

Acceptance checklist hardcodes design section numbers. **When design upgrades section names/numbers, this workflow must sync.**

Standard design section snapshot:
- Section 0: Terminology
- Section 1: Decisions and Constraints (requirement summary / complexity tier / key decisions / prerequisites)
- Section 2: Nouns and Orchestration (2.1 noun layer / 2.2 orchestration / 2.3 mount points / 2.4 push strategy)
- Section 3: Acceptance Contract (key scenario list + reverse-check items)
- Section 4: Architecture Relationship

## Startup Check

1. **Code actually implemented** — git status / recent commits show this feature's changes, otherwise return to implementation
2. **Design doc complete** — frontmatter `doc_type=feature-design` / `feature` matches / `status=approved` / `summary` non-empty / `tags` ≥ 2; standard design sections 0/1/2/3 + section 4 filled
3. **`{slug}-checklist.yaml`** — exists, `feature` matches; `steps` all `done` (pending → return to implementation); `checks` non-empty all `pending`
4. **Full context read** — design doc full text (focus: section 1 non-goals, 2.1 interface examples, 2.2 flow constraints, 2.3 mount points, section 3 scenarios) + checklist + section 4 referenced architecture docs + code changes (git log / diff)
5. **Breakpoint recovery** — `{slug}-acceptance.md` already exists and partially filled → resume from next incomplete section; report "last completed section X, resuming from Y"

---

## Acceptance Report

Fill section by section, **don't skip sections**. Report path in feature directory.

```markdown
# {Feature Name} Acceptance Report

> Stage: Stage 3 (Acceptance)
> Acceptance date: YYYY-MM-DD
> Associated design doc: {path}

## 1. Interface Contract Verification

Check against design section 2.1 noun layer:

**Interface examples item-by-item verification**:
- [ ] Example A ({file path + function name}): example input→output → code actual behavior: {match / deviation note}

**Noun layer "current state → change" item-by-item verification**:
- [ ] Noun X: claimed change → code change: {match / deviation}

**Flow diagram verification** (section 2.2 top mermaid diagram):
- [ ] Nodes/call relationships in diagram all have actual code landing points (grep confirmed)

Deviation found → **fix code or backfill design doc first**. "Known deviation, not addressing" in report is anti-pattern.

## 2. Behavior and Decision Verification

Check against design section 1 + section 2.2:

**Requirement summary item-by-item verification**:
- [ ] Behavior A: {description + actual test result}

**Non-goals item-by-item reverse-check** (using section 3 "reverse-check items"):
- [ ] Out-of-scope item X **indeed not done** (grep / review confirmed)

**Key decisions landed**:
- [ ] Decision D1: {decision content} → code manifestation: {description}

**Orchestration "current state → change" item-by-item verification**:
- [ ] Change V1: {where inserted / which branch changed} → code actual landing point

**Flow-level constraint verification** (error semantics / idempotency / concurrency / extension points / observability):
- [ ] Discipline R1: {description} → code compliance method

**Mount point reverse-check (uninstallability)** — against section 2.3, must do two things:
- [ ] Mount point M1: list entry → code actual landing point: {match / deviation}
- [ ] **Reverse grep**: all references to this feature in code fall within mount point list? Outside-list references → missed mount point, supplement to section 2.3
- [ ] **Removal sandbox walkthrough**: following list in reverse, any residue? Residue → add to "leftovers" or supplement mount point

## 3. Acceptance Scenario Verification

Check against design section 3 key scenario list, each with observable evidence:

- [ ] **S1**: {scenario "input/trigger → expected observable result"}
  - Evidence source: {type system / unit test / integration / manual / visual}
  - Result: {pass / fail + reason + remedy}

**Frontend changes must have browser visual verification** (typecheck pass ≠ user experience correct):
- [ ] UI area X: browser verification OK / screenshot link

## 4. Terminology Consistency

Check against design section 0 + section 2.1 naming, grep code:

- Term X: code hits N locations all consistent ✓
- Conflict check: forbidden terms grep no hits ✓

Inconsistency found → fix code, don't write "known difference" in report.

## 5. Architecture Merge

**Target**: actually write stable, system-level content from this feature **into** architecture, so readers only reading architecture can understand the new capability's existence and form. **Not "add design link and done"**.

Check against design section 4, three types of content written into corresponding architecture docs:

- **Noun merge** ← section 2.1 new/changed entities, types, external contracts → architecture "structure and interaction / data and state" section
- **Verb skeleton merge** ← section 2.2 cross-module visible main flows / key orchestration → architecture structure diagrams / module interaction
- **Flow constraint merge** ← section 2.2 cross-feature stable constraints → architecture "known constraints" section

Item-by-item verification:
- [ ] Architecture doc X ({path}): merged content {description}; written ✓ / not needed (reason: {specific})

Section 4 empty or too thin → supplement assessment:
- New modules added / interfaces changed / cross-module disciplines introduced
- Whether architecture index needs new description (description ≠ pasting link)

**Criterion**: after merge, someone who hasn't read design should be able to know "system now has this capability, its general form, and what to follow when interacting with it" from architecture.

## 6. Requirement Writeback

Check against design frontmatter `requirement` and section 1 requirement summary:

- [ ] `requirement` empty + design explicitly "no new capability" (pure refactor / tech debt) → skip, write "no requirement writeback"
- [ ] `requirement` empty + new user-perceptible capability added → trigger requirement backfill, directly `status: current`
- [ ] `requirement` points to draft req → trigger requirement update: `draft` → `current`, refresh user story / boundaries per actual implementation, **preserve original vision** (vision not overwritten, add changelog at end)
- [ ] `requirement` points to current req and boundaries / user story / pitch changed → trigger requirement update
- [ ] `requirement` points to current req but no user-perspective changes → write "req-{slug} unchanged, no update needed"

This is **actual file write action**, not self-assessment "probably no change needed".

## 7. swe-plan Writeback

Check against design frontmatter `swe_plan` / `swe_plan_item`:

- [ ] Both fields empty (feature not from swe-plan) → skip, write "not swe-plan originated"
- [ ] Both have values:
  - Open `{artifact_root}/plans/{swe-plan-slug}/{swe-plan-slug}-items.yaml`
  - Find `slug: {swe_plan_item}`, verify current `status: in-progress` + `feature: {directory name}` — mismatch → stop and investigate
  - Change `status: done`, validate with validate-yaml.py
  - Sync main document section 5 child feature checklist corresponding item status
- [ ] Fields inconsistent (only one filled) → stop and supplement or clarify

## 8. attention.md Candidate Review

Review this implementation for "every feature hits this once" environment/tool/workflow information. Typical candidates: compile commands, proxy config, local service startup steps, repeatedly hit environment traps, repo-specific non-obvious workflow conventions.

**Criterion**: only record what next feature's AI will hit again. One-time trap, business-coupled details → learning / decide.

- [ ] No candidates: write "this feature didn't expose content needing attention.md addition"
- [ ] Has candidates: list them, **don't write without authorization** — this section only registers, user decides at exit

## 9. Leftovers

- Follow-up optimization points (issues opened or in issue list): {list}
- Known limitations: {list}
- Implementation "side discovery" list: {list}
```

---

## Check Rhythm

Section by section. After each section, **update `{slug}-checklist.yaml` `checks` one by one**: pass → `passed`, fail → `failed` (fix code/design first, then change back to `passed`). All checks `passed` → report complete.

Sections 1/2 most likely to expose deviations, do first. Section 2 mount point reverse-check **must actually grep + sandbox**, cannot check by impression. Sections 5/6/7 are file-write actions, not self-assessments.

---

## Exit Conditions (Acceptance)

- [ ] Acceptance report 9 sections all filled
- [ ] Sections 1/2 all items checked, no unhandled deviations (including mount point grep + removal sandbox)
- [ ] Section 3 scenario checks all checked, frontend browser-verified
- [ ] Section 4 terminology consistency no omissions
- [ ] Section 5 merge: each item has clear conclusion, docs needing update actually written
- [ ] Section 6 req writeback has conclusion: skip / unchanged / backfilled / draft→current / updated
- [ ] Section 7 swe-plan writeback has conclusion: skip (not plan originated) / updated (items.yaml + main doc synced, yaml validated)
- [ ] Checklist all checks `passed`
- [ ] User final review confirmed

---

## After Acceptance

Tell user: "Acceptance report ready, architecture docs merged, feature workflow complete. Future bugs go through issue workflow."

Per exit recommendation sequence, prompt each item with one sentence (user says "no" → skip immediately):

1. Reusable pitfalls / experience → "Record learning? (cs-learn)"
2. Long-term constraints / tech selections → "Archive decision? (cs-decide)"
   - **Special check**: does design section 2.5 have "suggested convention" note. If yes, read that rule verually: "design 2.5 suggested convention: '{rule in one sentence}', implementation verified, archive as cs-decide now?"
3. Interface changes / user-visible behavior changes → "Update guide? (cs-guide)"
4. Library public surface changed → "Update API reference? (cs-libdoc)"
5. Section 8 has attention.md candidates → ask each "Add candidate X to attention.md?" User explicitly agrees → handle separately
6. Finally ask whether to scoped-commit

Commit scope: feature code + design doc + acceptance report + architecture docs / req docs / swe-plan items.yaml + main doc actually updated this time.
