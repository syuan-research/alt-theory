# Decision (round 3): continue-from-choice, helper truth policy, A/B console placement

Date: 2026-07-16
Status: owner-confirmed; item 1 explicitly PRELIMINARY
Anchors: `2026-07-16-decision-v1-alpha-subsession-substrate.md`,
`20260716-v1-alpha-round2-observations.md`, spec §14.6.

## 1. Continue-from-choice — PRELIMINARY: switch mainline to the chosen arm

Owner decision, explicitly **prelim, not firm** — to be revisited when the
actual research design consolidates. Rationale: it is the convention the
owner knows from ChatGPT-style A/B tests, and a placeholder is needed now.

Semantics (lazy form, owner's preference "只要能实现作用，就简单做法"):

- Choosing a winner = **record + switch**: append the choice to the
  ab-comparison record, then open the chosen arm session and continue there.
- **No id rewriting, no app-behavior change**: the parent keeps its session
  id, every arm keeps its original session id; provenance is already complete
  because the ab-record stores the parent `sessionId`, every arm as a
  candidate (`candidateId` = arm session id), and `selectedCandidateId`.
- Non-chosen arms are not hidden or deleted — they remain nested under the
  parent in the browser and in the records (they are evidence).
- The conversation list shows the chosen arm as the live continuation
  (it simply is the last-opened conversation).

## 2. Helper skill truth policy — pointers primary, stable truths allowed

Refines round-2 "helper = seed + skill asset, content not hardcoded":

- The skill body MAY carry **stable, slow-changing truths** (compressed, low
  detail) — but prudently; **pointers are primary**, the same posture as the
  KB. Detail and volatile truth live in user docs / KB assets the helper
  cites; a quick-answer layer must be regenerable from those sources, never a
  second source of truth.
- Prelim asset structure = the owner's answering-strategy frame: what
  question class → what strategy → expected output length → grounding
  (what the answer cites). Organization must be structured and extensible —
  NOT organized by user persona (personas are brainstorm input only), and no
  premature closure.
- Content production is delegated: a fresh agent session brainstorms
  (skill-authoring principles + what difficulties users/personas hit) and
  drafts a placeholder skill; owner accepts. Timing: alongside user-facing
  docs, near the bundle/real-user round — not before.

## 3. A/B trigger — hidden research console, manual, bottom-up

- The trigger is **hidden from participants**: it lives in a research
  console tab (inspector, advanced-gated), possibly alongside other research
  controls later.
- **When A/B fires cannot be decided now** — it couples to the concrete
  research design and consolidates bottom-up as protocols land. The only
  top-down commitment: the minimal mode is **non-automatic** — a researcher /
  research assistant triggers it per the study protocol (in-person or
  synchronous online).
- Unknown and left as annotated placeholders: what else the tab contains;
  whether post-choice participant questions render in the same panel, a
  popup, or elsewhere.

## 4. Prototype requirements (for the later design pass — banked here so the
discussion survives)

- Prototypes must be **openable and viewable by the owner** (pages, not
  code); static vs. lightly interactive is the implementing agent's call;
  possibly **two variants**, not one.
- Visual origin: v0.5 style + more unified + richer iconography. Replace the
  current emoji stand-ins with a proper **icon library / icon set**(图标库,
  e.g. Lucide, Heroicons, Phosphor, Material Symbols — the "shared across
  apps" thing the owner described). Target: 简洁 but polished, not v0.5's
  crudeness.
- The owner contributes needs, not techniques, on frontend — supply the UX
  vocabulary alongside proposals.
- Use the owner's local **taste skills** during the design pass and discuss
  through them (in `~/.claude/skills/`: `design-taste-frontend`,
  `stitch-design-taste`, `gpt-taste`, `high-end-visual-design`,
  `minimalist-ui`, `brandkit`, …) — pick the fitting one(s) at
  prototype time, don't hand-roll aesthetics.
