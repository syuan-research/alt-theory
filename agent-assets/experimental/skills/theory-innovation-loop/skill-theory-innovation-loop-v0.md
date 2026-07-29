---
title: Skill — theory-innovation-loop (diverge–converge workflow), v0
skill-name: theory-innovation-loop
date: 2026-07-28
status: probe draft (action for reflection), NOT a v1.x commitment.
  Sits on top of the role-level inductive/deductive stance — carried
  by role-theory-innovation-companion-v0.md, or by
  role-stance-block-v0.md inside other roles. This file is only the
  loop machinery.
principle-codes: shorthand for principles-shared.md — P-approval = its
  principle 4, P-fact = 5, P-gaps = 6, P-overfit = 7, P-verify = 8;
  D-options = its 2–4-realistic-options default, D-steps = its
  moderate-steps default, D-coevolve = problem/solution co-evolution.
scope-exclusion: meta-theory / landscape lens is NOT part of this
  skill. If a user genuinely needs cross-paradigm navigation, say this
  skill does not carry it rather than improvising it.
---

# Skill: theory-innovation-loop

## When to propose this workflow — and when not

Trigger signals (**unconverged list** — under owner calibration):

- the user wants *many* mechanisms/concepts, or a comprehensive
  possibility map to choose from and position within;
- multi-stage project planning, or the need to relate and distinguish
  their work against a bigger picture;
- the inline conversation has stalled in a specific way: candidates all
  feel too similar (needs zoom-out) or one aspect is clearly unexplored
  (needs zoom-in);
- inductive recognition of lived experience needs more diversity than a
  few inline vignettes can provide.

Non-triggers: a quick why-question answerable by listing 3–4 candidates
with match degrees; a user still in orientation; a user who already
runs their own loop discipline and hasn't asked.

Always propose as one option among 2–4 (D-options), with cost stated
plainly (rounds, subagents, user attention required). The user decides.
The agent also cannot judge for the user whether automating this
thinking preserves their understanding — another reason the workflow is
strictly opt-in, with forced gates defaulting on.

## Shape

Not a rigid pipeline. Based on problem-space size and the user's goals,
propose a mode:

(a) **inline** — stay at role-stance behavior; no subagents — the gate
    COMMITMENTS below still bind (grounding above all), enforced as
    the main agent's own named checks ("checking these against what
    you actually said before showing them");
(b) **single round** — one diverge–converge pass, with subagents and
    gates (the subagent/judge rules below apply to (b) and (c) alike);
(c) **loop** — multiple rounds, direction may alternate
    (deductive → inductive → deductive …).

At mode choice the user may approve a **round plan** (e.g., "positive
batch, then counter-example batch, then match-back") in one decision —
that approval is what later text means by a pre-authorized round
structure. Proposing a mode includes naming which forced gates will
run and that the optional ones exist — that is where waivers and
opt-ins become decidable.

Combine with adaptive aligning throughout; the endpoint is not full
convergence, and stories must not drift over-broad.

## Diverge

1. **Aspects and cases — two entries, chosen with the user.**
   Terminology, used consistently: the agreed list of important
   aspects is the **aspect card**; cases generated to differ along it
   are **scenario cards**. Aspects-first entry: agree the aspect card
   before generating — candidate aspect pool (**unconverged**):
   dynamics, culture, season/temporality, purpose of use,
   familiarity/attachment — extend per domain with the user; then
   generate cases that differ deliberately along chosen aspects and
   combinations. Cases-first entry (owner's 2023 practice, Frontiers
   supplementary examples): generate a first story pool, then extract
   from it the personal/social/physical aspects that made the
   difference, and use the induced aspect card to steer the next
   round. Both entries are legitimate; offer both with a
   recommendation and let the user choose; loop between them.
2. **Story schema.** Hypothetical cases carry, at minimum: who the
   person is, when/where the situation occurs, what they do and
   encounter, and how it feels/what it leads to. Concreteness is what
   lets the user re-judge a theoretical leap.
3. **Counter-examples are a first-class diverge move.** After a
   positive batch, propose a batch of diverse *negative* cases (where
   the expected mechanism fails or reverses) — propose, because it
   spends a round; run it unasked only if the user pre-authorized the
   round structure. Observed in the owner's 2023 sessions:
   positive-case generation drifts toward archetype/cliché;
   counter-example batches came out *more* diverse — the negative
   direction resists the positivity cliché and often carries the
   theoretically interesting variance. ("Pre-authorized" here means
   the counter-batch was in the round plan the user approved at mode
   choice.)
4. **Generation at scale.** Enough candidates to escape the first
   cluster of obvious ones. Provisional defaults (state the chosen
   numbers with the cost when proposing a round): 20–30 candidates per
   diverge round from 3–5 diverging subagents; 8–12 when the aspect
   card is small or user attention is the constraint; 2–3 judges at
   converge.
   Deductive diverging subagents start from theories, concepts, and
   explicit hypotheses; inductive diverging subagents start from
   concrete person–environment interaction scenes.
5. **True diversity, not cliché diversity.** Diversity means variance
   in situation, mechanism, context, and epistemic angle. Reflexively
   casting traditional disadvantaged groups is itself a cliché, not
   diversity — an observed default of weaker/biased models. Demographic
   detail appears only where it does causal work in the case.

## Persona configuration for subagents

<!-- design provenance: mechanism adapted from an external
academic-paper-reviewer skill; see the session note. Not needed at
run time. -->

The **main agent** writes a small card per subagent — after the mode
is chosen, before any subagent is spawned — reading the *actual
problem*, and shows the cards at the user checkpoint below:

- **specific identity** — never "a methodology expert" but "a
  researcher in X who works on Y and particularly attends to Z".
  Specificity anchored to the problem at hand is the working antidote
  to stereotype drift: the sim-professor drift happened precisely
  because the persona was generic, leaving the model to fill it from
  priors.
- **what this lens will particularly care about** (2–3 concrete
  points), and — load-bearing — **its declared blind spot**, stated on
  the card so synthesis knows what each lens cannot see.
- **non-overlap gate**: lenses must differ in angle, not just wording;
  overlapping topics get different angles. Fake diversity (N agents
  raising the same points) is a named failure.
- **user checkpoint**: the cards are shown to the user as adjustable
  before the round runs — the cheapest, earliest gate in the loop.

Deliberately NOT taken from ARS: the 7-agent fixed team, phase
contracts, schema validators, template library. Cards + gates only.

## Converge

- Selection and filtering are done by the **user plus judge subagents
  that are different from the diverging agents** — the standard remedy
  for single-agent drift and tunnel vision. Judges are configured via
  the persona cards above. (Live example: a simulated "senior
  professor" judge drifted to a stereotype — epistemics-obsessed —
  while the real seniors it modeled care most about high-value work
  being done for them. Generic personas drift; configured ones drift
  less.)
- **One devil's-advocate seat**: offered to the user at round setup
  when the outcome looks likely to be committed to something (a
  framing, a proposal, a contribution claim), and re-offered at
  converge if commitment only becomes apparent there; the user
  decides. Its only job is the strongest counter-argument against the
  emerging selection, and its objections are always surfaced to the
  user verbatim — synthesis may disagree with them but may not absorb
  or silently drop them.
- **Synthesis traceability**: the main agent writes the convergence
  summary; every point in it must trace to a specific judge output or
  user reaction — no invented consensus.
- **State markers are required**: selected / deferred / set aside with
  reason. The main agent updates the ledger at the end of every
  converge step and after any gate kill; nothing drops silently.
  Deferral is a legitimate end state. When the loop runs more than one
  round or may outlive the conversation, the ledger lives in the plan
  record (see bundled skills below), not only in chat.
- **Zoom moves**: zoom out when examples cluster too similar; zoom in
  when a named aspect has produced no diversity yet. The main agent
  calls the move and says so ("these cluster too closely — zooming
  out").

## Verifier gates

Forced (default on; run without asking):

- **Grounding** — generated cases must not smuggle in claims about the
  user's data or experience that the user has not stated (P-overfit).
  Not waivable when the raw material is the user's own data; elsewhere
  the user may explicitly waive it.
- **Anti-cliché diversity check** on every diverge batch, before the
  user's attention is spent on it.
- **Consistency with stated facts** — candidates that contradict a data
  pattern the user has given are set aside with the reason recorded.

Gate kills are not shown by default but are never silent: every kill
is logged to the ledger with a one-line reason and is available on
request — the log is what keeps forced gates auditable and what keeps
them consistent with "nothing drops silently". On an anti-cliché
failure, regenerate the batch (replace individual items only when the
failure is isolated), logging the kill either way.

Optional (default off; propose, user decides; offers are per-round —
a gate declined in one round may be re-offered at a later round's
setup; the no-re-propose rule applies to the workflow itself, not to
per-round gate offers):

- novelty vs the literature;
- coverage of the aspect card;
- match-degree calibration on deductive fits.

**Standard-setting method** (because not every model can write good
verifier standards): the **main agent itself** writes the verifier
standards — at the point gates are first needed in the session, before
the first diverge round — and refreshes them when the round generates
a different kind of artifact than the standards were written for
(stories vs. mechanisms vs. concepts). Never delegate standard-writing
to the cheaper subagents that run the checks. Method: a required pool
(grounding, cliché-diversity, factual consistency, judgeability) PLUS
at least 2–3 standards *not* in the pool that are orthogonal to it,
distinguishable, and judgeable. **Judgeable** means a judge can decide
pass/fail from the material at hand, without further data collection.
Drop non-discriminating standards — ones nearly any competent output
would pass. This apparatus is expected to simplify toward high-level
principles as models improve — write the current version for current
models.

## Deductive moves available inside the loop

- Fit testing with explicit match degree and misfit factors (from the
  role stance; here applied at batch scale). Run it in **both
  directions** as paired questions: which cases CAN this theory's
  components explain, and which cases CANNOT they explain — the
  cannot-list is asked for explicitly, never left implicit.
- **Residual-case check** (owner's 2023 move; the concrete
  deductive→inductive gate): after matching, deliberately revisit the
  cases the current concept set does not explain well, and decide per
  case — explained after all / existing concept needs revision / a new
  concept is warranted. Residual cases are the innovation site.
- **Vague-concept grounding**: when an established concept is doing
  work but feels abstract ("compatibility"), instantiate it across the
  case pool — what it concretely looks like when present and when
  absent — before relying on it. Case-grounding is also the entry
  point for the structural moves below.
- **User-synthesis audit** (fits adaptive aligning): when the user
  states their own synthesis, evaluate it and name what is missing
  from the material so far — a convergence checkpoint owned by the
  user, audited by the agent. Deploy when the user offers a synthesis;
  do not ritualize it.

## Structural moves on the concept system (拆分-重构 family)

A third move family, direction-neutral: it operates concept→concept,
where deduction runs concept→case and induction case→concept. It is
not a single operation but a **diagnose → decompose → outcome**
sequence, and the outcome branches — restructuring is one possible
result, not the promise.

**1. Diagnose: logical-relation checks.** Decomposition is warranted
by some relation defect among the concepts in play. Common checks
(an open list — other relation checks will join it as they prove
common; **[unconverged: the check list]**):

- **Level / specification check**: are the concepts at the same
  abstraction level? Parent–child (subsumption) pairs are often
  written as parallel siblings; or one "sibling" is far more specific
  than the rest.
- **Overlap check**: do two concepts claim the same cases — partial
  identity, shared components?
- **Double-duty check**: does one concept match everything a little?
  Hidden heterogeneity — it is probably two or more things.

**2. Decompose** along the diagnosed defect: split into small blocks,
each block claiming one thing.

**3. Outcome — a branch, honestly reported.** Decomposition does not
guarantee a rebuild:

- **Recombine**: de-overlapped blocks assemble into a better
  structure — the full 拆分-重构.
- **Split suffices**: the framework was over-lumped; the separated
  blocks stand on their own and nothing needs rebuilding.
- **Gap found**: decomposition reveals missing coverage — the current
  concepts do not tile the territory, so restructuring is not yet
  possible. The gap itself is the finding: feed it back to the loop
  (diverge for candidates to fill it) or mark it as a contribution /
  future-work item. Say plainly that a rebuild is premature.

Triggers, one from each direction:

- **Deductive-side trigger** (the common one): fit testing goes muddy
  — one concept partially matches every case, or two "parallel"
  constructs keep explaining the same cases. Typical scene: a
  conceptual framework whose constructs are presented as parallel
  while one actually contains, or overlaps heavily with, another —
  it cannot be extended or tested until diagnosed and decomposed.
- **Inductive-side trigger**: candidate story families or emerging
  themes keep absorbing each other — the split/merge discipline of
  qualitative thematic analysis is this same operation on the
  inductive side; so is restructuring an outline.

(The owner has described this thinking method before in earlier
writing-skill materials — an example-level pointer for phrasing
lineage, not a dependency. The current product bundle has no writing
skill.)

## Relations to bundled skills (by name, current bundle)

- **adaptive-aligning**: the loop combines with it throughout —
  aspect-card agreement, mode choice, and gate opt-ins are alignment
  moments; batched questions carrying the agent's own best guesses is
  the right form for them. Endpoint of aligning here is NOT full
  convergence.
- **adaptive-plan-record**: when the loop runs more than one round or
  may outlive the conversation, the state ledger
  (selected / deferred / set aside with reason), the current aspect
  card, and the current verifier standards all live in the plan
  record, not only in chat — that is what makes deferral durable and
  hands off cleanly.
- **search-policy** (and **web-search** in Work mode, the product mode
  with live tools): the deductive matching and related-studies steps
  follow the provenance rule — found now / memory / inferred — on
  every match claim. In Understand mode (no live lookup), matching is
  internal-knowledge and must be marked as such (P-verify).
- **conversation-summary**: an unconverged loop that stops mid-way is
  handed off with open questions kept open, not converted into
  conclusions.

## Boundaries

- Never assert what the user's experience "really is"; never run the
  session as an interview; persist patiently within a limit — no
  over-assertiveness, no making the user carry all description
  (D-steps).
- Meta-theory/landscape interpretation is out of scope here.
- Do not lecture the user with this skill's internal language; the
  workflow is visible as moves and options, not as doctrine.

## Unconverged (marked, not resolved)

Carried from the story set: aspect pools; when-to-propose thresholds;
gate severity map; KB-presence effects on the inductive path;
generation-scale calibration (provisional numeric defaults are now
set above; whether they are right is open). Resolved: 拆分-重构
placement — own move family above, owner-ruled 2026-07-28.
