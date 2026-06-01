# Brainstorm Workflow

Use when a coding idea is not yet ready for feature design or `swe-plan`.

Brainstorm is a **thinking space, not an implementation commitment**.

Three things that matter most:

- **brainstorm is a creative space, not an audit checkpoint** — exploring / questioning / changing mind / discovering through conversation that what user really wants is something else — all normal
- **any topic is on the table** — user wants to discuss a library / schema / interface, discuss it; they brought it up because they have something in mind, settle it early so design stage is more efficient. No topic blacklist.
- **AI is a thinking partner, not a scribe** — user comes to this stage to be challenged and inspired, not to fill out a questionnaire line by line. If all AI does is organize user's words and write them down, this step is wasted

## Cases

| Case | Meaning | Output |
|---|---|---|
| 1 | Clear enough for design | No file required; go to feature design |
| 2 | Small fuzzy feature | Optional `{slug}-brainstorm.md` in the feature directory |
| 3 | Multi-feature demand ready to split | Go to `swe-plan` |
| 4 | Multi-feature/open exploration not ready to split | Optional central brainstorm |

Cases can change during discussion. Case 2 may grow into case 3/4; case 3 may need more grilling → case 4; case 4 may reach clarity → case 3. Switch on the spot.

---

## Pre-Chat Check Procedure

Every brainstorm run performs these 4 steps:

1. **Scan the repo** — glob `{artifact_root}/` to discover architecture / features / plans / brainstorms / compound; read architecture index; check existing features and plans and brainstorms; search compound for related learnings (`--filter doc_type=learning`); grep user description keywords for terminology conflicts
2. **Is this a continuation?**:
   - `features/` has a similar-named brainstorm? `plans/` has a similar subdirectory? `project/brainstorms/` has related creative records?
   - No → treat as new discussion
   - Brainstorm content is from an interrupted session → read and report "last time we discussed {…}, continue or start over?"
   - Same-name design.md exists → tell user design is already open, maybe wrong entry point
   - Same-name swe-plan exists → this is already tracked in a plan, maybe want to advance a specific child feature
   - `project/brainstorms/` has related creative record → read and report "a brainstorm record from {date} exists, direction was {…}, continue or split into swe-plan?"
3. **Confirm this is a feature brainstorm** — bugs go to issue workflow, refactors go to refactor workflow
4. **If you can already write a design requirement summary** → immediately judge case 1. Taking on work that doesn't belong to this stage is the biggest anti-pattern here

## Opening Triage

Not a questionnaire — too many classification questions make user feel like a bureaucratic process.

**User only says a vague word/phrase** ("I want a permission system", "want to discuss notifications"):

> One sentence to align: the problem you want to solve is {AI restatement}, right? In your mind, is this "add a small capability" that one feature can contain, or "a whole new subsystem" that needs multiple rounds?

**User comes with a plan** ("I want to do X, it has a/b/c"):

> Let me restate — the problem you want to solve is {P}, and you plan to do X containing a/b/c. Do a/b/c together fit in one feature, or are they three interdependent things that need multiple rounds?

User splits into multiple items → multi-feature scale, follow up "want to split into swe-plan directly or grill first?" → case 3 or case 4; a/b/c are different aspects of the same thing → case 2; user says "yes exactly, I'm clear" after restatement → case 1.

**Case signals** (AI judges if user cannot articulate):

- Each target is **a different angle of the same thing** → case 2
- Multiple targets have **sequential dependencies** or **independent sub-modules**, user can describe rough split → case 3
- Multiple targets have **sequential dependencies** or **independent sub-modules**, but user cannot articulate module boundaries, wants to explore first → case 4
- Two sentences confirming "what not to do / core behavior / success criteria" all match → case 1

---

## How To Talk (Case 2 & Case 4 Shared Toolbox)

The following conversation methods apply to both case 2 and case 4. Case 2 ultimately converges to a chosen direction; case 4 can be more open, no forced convergence.

### Two Core Postures

**1. Distinguish "what user says" from "what user wants"** — the opening sentence is often the solution they thought of, not the real problem to solve. Hearing "I want to do X" don't start discussing the solution, first ask "what problem in what scenario is X meant to solve." Common discovery: the real problem isn't solved by X, or there's a smaller/lighter/completely different direction. Once locked into a design direction it's welded shut — completing this before the user realizes it is brainstorm stage's highest value.

**2. When user brings a plan, evaluate before accepting** — don't jump into "let's discuss how to do a." First do:
- **Restate + reverse-question the problem** — translate the plan into "the problem you want to solve, is it P"
- **Evaluate and propose alternatives** — if the plan has obvious issues (wrong problem / over-engineering / existing lighter path / stepping on a learning pitfall), say so directly, propose 1-2 clearly different alternative directions. **Don't stay silent just to seem cooperative**

Evaluation reveals the plan is reasonable → "I think this direction is OK, suggest going directly to design" — don't force divergence to fill a process — promote to case 1 on the spot.

### Conversation Rhythm

No fixed steps. Three actions, can return to previous at any point:

1. **Dig the problem** — per posture 1, get "the real problem to solve" clear enough for one-sentence restatement, user says "yes that's it." **This step has the highest value, don't rush past it**

   **Grill mode** (activated on demand, default off)

   Default: light questioning — one restatement match, move on. Any of these signals → switch to grill mode for deeper probing:

   - **Explicit request**: user says "ask me more rounds / help me clarify before starting / grill me"
   - **Implicit signal**: two consecutive restatements rejected as "almost but not quite"; same concept referenced with different terms interchangeably ("permission / role / tenant" pointing to the same thing); user themselves cannot articulate clearly
   - **Only activate for case 2 / case 4** — case 1 is already clear, grilling is counter-productive; case 3 user is ready to split, no grilling needed

   Grill mode hard constraints (prevent endless loops):

   - Maximum 3-5 rounds of key questions, one round with no new information → retreat to divergence
   - Each round: **one question + 2-4 distinct candidates** for user to choose, no open-ended essays
   - Hit "have to write code to know" type questions: mark as open question, skip directly, don't dwell
   - User starts being dismissive / saying "that's about it / close enough" → immediately retreat to convergence, stop probing

2. **Diverge** — after confirming the problem, discuss solutions. Propose 2-3 specific candidate directions (user's plan counts as one of them), each with 1-2 sentences: description / value / cost. **At least one counter-intuitive candidate** (reversal / remove common constraint / cross-domain analogy). Present all candidates before giving recommendation — anchoring first then adding alternatives biases user judgment

3. **Converge** — after selecting direction, lightly sketch: core behavior? Explicit non-goals? Biggest unknown? Warming up for design, not deciding for design

### Spike Rules

Discussion surfaces "whether this direction works depends on whether X is actually Y" — **stop and spend 5-30 minutes building a minimal demo to verify** rather than debating with imagination for three more rounds.

**Default: don't spike** — most brainstorms are comparing tradeoffs, demos don't help. All three conditions must hold to propose:

1. **It's a factual question, not a preference** — actual API behavior / does library truly support / is performance characteristic as assumed, not "which style is better"
2. **Result will change direction** — regardless of success/failure, discussion can converge after
3. **Cost is controlled** — you judge 5-30 minutes can produce something runnable. Beyond that → feature fast-forward or split into formal feature

Proposal format: **"This can't be settled by thinking, I'll build a minimal demo to verify {what to verify}, 5-10 minutes, OK?"** User approves or rejects.

**Spike landing rules**:
- Case 2: spike code goes into `{artifact_root}/features/{feature}/` (same directory as brainstorm note), file name anything (`spike.py` / `try-{topic}.ts`)
- Case 4: spike goes into `project/brainstorms/{slug}/`, next to brainstorm.md
- No forced cleanup after verification — leave for future reference; user says to clean → clean then
- **Result must be written back into brainstorm note** — success or failure, add one line in "settled points" section: "{conclusion} — verified via spike (code at `{path}`)", preventing design/swe-plan stage from re-doubting and redoing

Cases 1 / 3 can also use this action (no brainstorm note required), same logic: factual uncertainty + changes direction + cost controlled.

### Conversation Pitfalls

- **One question at a time** — throwing 3-5 questions means user answers only the easiest
- **Present options before asking** — can use 2-4 specific distinct options for user to choose instead of open-ended essay
- **Don't proactively pull topic back to "user perception level"** — user wants to discuss library / schema / interface / tech selection, follow along; AI shouldn't proactively open technical detail topics to fill time, but once user opens a topic, engage seriously. Answer to a question requires reading code → read code as needed, bring back to conversation

---

## Four Cases

### Case 1: Already Clear Enough

**Signal**: one sentence can express what to do / for whom / success criteria / what not to do; two sentences on core behavior / success criteria all match.

**Handling**:
1. Tell user "you've thought this through: {AI one-sentence restatement}. Suggest going directly to feature design — brainstorm adds no value for you"
2. **Check if non-trivial technical decisions were made during discussion** — specific library selection / schema / interface form / cross-module conventions discussed → drop a lean brainstorm note (only fill "settled design points" section) so design can read it without re-discussion; pure direction confirmation with no technical detail → exit without writing file
3. Stop and wait for user to trigger design

**Exit**: "trigger feature design directly from scratch" (no file); or if lightweight note written: "next step feature design will read `{path}`, no need to restate"

---

### Case 2: Small Fuzzy Feature → Feature Brainstorm

**Signal**: knows the problem to solve, roughly which area, one feature can contain it, but still wavering on solution / boundaries.

**How to talk**: follow "How To Talk" toolbox — dig problem → diverge → converge. Converge to selected direction, then write file.

**Upgrade/downgrade**:
- Discussion reveals scope exceeds single feature → "this scope exceeds one feature, want to split into swe-plan directly or grill first?" → case 3 or case 4
- Discussion reveals everything is already clear → case 1

**Feature Brainstorm Path**:

```text
{artifact_root}/features/YYYY-MM-DD-{slug}/{slug}-brainstorm.md
```

Only write when user confirms moving to design — don't write file during conversation. `status` always `confirmed`, no draft state.

Feature brainstorm template:

```markdown
---
doc_type: feature-brainstorm
feature: YYYY-MM-DD-{slug}
status: confirmed
summary: {one sentence on selected direction}
tags: [...]
---

# {Feature Name} Brainstorm

> Stage 0 | {YYYY-MM-DD} | next step: design

## What and Why
{starting point + key discoveries and turns}

## Considered Directions

### Direction A: {name}
- Description / value / cost
- Conclusion: selected / rejected (reason)

### Direction B / C ...

## Settled Design Points
{Specific design points with consensus from discussion: library selection / schema / interface form / technical constraints}
{Each tagged: confirmed / leaning / to verify. Design takes directly, no re-discussion}
{Nothing discussed at this level → delete entire section, don't leave empty}

## Selected Direction and Open Questions
{Selected direction restated in 2-3 sentences + rough outline (core behavior / explicit non-goals / biggest unknown) + questions deferred to design}
```

**Exit**: actively ask "clear enough to go to design?", confirm then write file. If vision (user story / pain point / boundary) is already well-discussed, suggest user can draft requirement first, design will read it for alignment. Tell user "next step feature design will read `{path}`"

---

### Case 3: Multi-Feature Ready to Split → swe-plan

**Signal**: multi-feature scale, user already has rough module breakdown in mind, can describe the split, wants to do decomposition and interface contracts directly.

**Handling**:
1. Tell user "sounds like a collection of multiple features, single feature can't contain it. swe-plan will do decomposition and dependency mapping, I'll hand the discussion over"
2. Summarize already-discussed information for swe-plan to pick up without starting over: real problem / rough scope / mentioned possible sub-modules (one sentence each); **cross-module interface forms, shared protocols, tech selections discussed — list all** — these are seeds for swe-plan's "architecture-level detailed design" section
3. **No file written** — swe-plan `new` mode creates its own directory and main document

**Exit**: "hand off to swe-plan" (with discussed key points summary), no file written

---

### Case 4: Multi-Feature Exploration → Central Brainstorm

**Signal**: multi-feature scale, but user cannot articulate module boundaries, wants to explore first — "help me clarify", "organize thoughts first", "direction is still messy, discuss and then decide".

This is a creative space, not a design document. Goal is to produce retrievable ideas, directions, and insights for subsequent swe-plan consumption.

**How to talk**: activate grill mode (see "Conversation Rhythm > Grill Mode"), while freely diverging — discuss solutions, analogies, technical possibilities, constraints. Conversation is more open than case 2, no forced convergence.

**Upgrade/downgrade**:
- After grilling, clear enough to split → case 3, write brainstorm.md then hand off to swe-plan
- Discussion reveals one feature can contain it → case 2
- Discussion reveals everything is already clear → case 1

**Central Brainstorm Path**:

```text
project/brainstorms/{slug}/brainstorm.md
```

Open brainstorm template:

```markdown
---
doc_type: brainstorm
slug: {slug}
created: YYYY-MM-DD
status: active
summary: {one sentence on what to explore}
tags: [...]
---

# {Topic Name}

> Creative space | {YYYY-MM-DD} | next step: swe-plan

## Starting Point
{What triggered this idea / what problem to solve / why it seems worth doing}

## Directions Discussed
{Key turns, candidate directions, possibilities explored; no requirement to converge, preserve exploration traces}

## Current Leanings
{Fuzzy directions at this point, can be 2-3 still wavering, one or two sentences each}
{If already fairly clear, write "leaning toward X direction, core is Y"}

## Settled Points
{Consensus reached during discussion: constraints, non-goals, analogies, technical judgments}
{Nothing yet → delete this section}

## Open Questions & Next Steps
{Biggest unknowns / hypotheses needing verification / points for swe-plan to note}
```

Write when user says "that's good for now" / "close enough" / "save it", or AI judges grilling has reached 3-5 round limit, proactively say "I'll save this to brainstorms for now, swe-plan will read it later."

**Connection to swe-plan**: swe-plan startup searches `project/brainstorms/` for related brainstorms. If found, swe-plan reads them as input material, does not re-triage, directly decomposes.

**Exit**: after writing, tell user "ideas saved to `{path}`, when ready trigger swe-plan, it will read this brainstorm record." If vision (user story / pain point / boundary) became clear during grilling, suggest user can draft requirement first for stable alignment baseline

---

## Hard Boundaries

1. **No skipping triage** — every discussion, regardless of length, must first determine case
2. **No deciding scale for user** — case 2/3/4 boundaries fuzzy → ask user "in your mind, is this one feature scale or needs grilling first"
3. **No writing files for non-case 2/4 outputs** — case 1/3 don't produce files
4. **No handling bugs / refactors** — route to issue workflow or refactor workflow
5. **No activating grill mode for case 1/3** — case 1 already clear, grilling is counter-productive; case 3 user is ready to split, no grilling needed
6. **Don't start writing design or swe-plan yourself** — inter-stage human checkpoint is a hard constraint of the entire workflow system

---

## Common Errors

- Skipping triage, defaulting all discussions to case 2 — large requirements forced into a single feature
- Triage questions feel like a questionnaire — one or two rounds should have direction; third round still aligning on scale means method is wrong
- Case 1 forcing a brainstorm note — user is already clear, writing a template creates false impression that valuable discussion happened here
- Case 3 doing the decomposition yourself — overstepping, that's swe-plan's output
- Ignoring upgrade/downgrade signals — scope growing but still case 2, producing a note that can't fit all sub-modules
- Treating case 4 as case 3 — user wants to grill and save, but handing off to swe-plan forces unformed ideas into feature decomposition
- Treating case 3 as case 4 — user is ready to split, but forcing grilling delays pace
- Presenting only one option for user to evaluate — user gets anchored, cannot produce other directions
- Restating user's plan and writing file — scribe mentality, AI provides no thinking partner value
- Spike without writeback — demo result not recorded in brainstorm note, design/swe-plan stage re-doubts
- Asking all triage questions at once instead of conversational flow
