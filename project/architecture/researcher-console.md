---
doc_type: architecture
slug: researcher-console
scope: v1-alpha frontend and research surfaces — view modes, pane logic, researcher workbench/review, study designation, A/B comparison
summary: Two view modes (user/researcher) over one React frontend; the M7 IA is owner-approved as a prototype blueprint, backend support is complete, frontend realization is the open work item.
status: current
last_reviewed: 2026-07-16
tags: [frontend, researcher-console, research, view-modes, ia]
depends_on:
  - core-session-engine
implements: []
---

# Architecture: Frontend & Research Console (v1-alpha)

## 0. Status And Reading Order

Backend support for everything below EXISTS and is tested (see
`core-session-engine.md`, change log 2026-07-15/16). The frontend is the
React app in `alt-theory-app/frontend/` (built to `web-server/public-v6/`),
which still renders the v0.5 layout; the v1-alpha information architecture
is owner-approved as a clickable blueprint, not yet implemented. Governing
documents, in authority order:

1. `project/compound/2026-07-16-decision-v1-alpha-m7-ia-principles-and-research-assumptions.md`
   — pane logic, view-mode collapse, study designation, sharing rules,
   working assumptions A1–A7, latent (deferred) items §8.
2. `project/workstreams/0-v1-full-stack/notes-and-status/20260716-m7-ia-card-sort-v1.md`
   — surface-by-surface card sort with four owner reaction rounds.
3. `design-mockups/m7-ia-pass/v2.html` — the converged prototype (5 views).
4. `project/workstreams/0-v1-full-stack/notes-and-status/20260716-v1-alpha-completion-definition.md`
   — the done-gate for v1.0.0-alpha.

The pre-M7 vanilla console (`web-server/public/`) described by earlier
revisions of this document is legacy; its behavior notes were accurate as of
2026-06-23 and are preserved in git history.

## 1. View Modes: Exactly Two

Only **user** and **researcher** presentation modes exist. The old
three-state model (`participant`/`researcher` + `debugExpanded` + a third
`"debug"` viewMode in `frontend/src/lib/viewMode.ts`) is decided out: the
debug button's semantic is a MODE SWITCH (a door), not an expander.

Doors into researcher mode (all do the same one thing — switch mode and
activate study surfaces; closing switches back, no residue):

- researcher/admin account (door always open);
- local install flag on a researcher's machine;
- code-unlock inside a participant app (latent; build when a protocol
  needs it).

Frontend hiding stays presentational; the backend remains the authorization
gate (unchanged since v0.5).

## 2. Pane Information Logic (governs every surface placement)

- **Left = navigation.** User mode: conversation history grouped by
  workspace (collapsible groups) + New conversation + demoted search
  (overlay, not a persistent field); collapses to an icon strip. Researcher
  mode: a DIFFERENT left pane — the current-experiment workbench
  (`Setup | Sessions` tabs: visible auto-applied configuration, comparison
  setup, compact session list).
- **Center = the conversation.** Center-top hosts a thin strip for
  session-scoped ACTIONS only (researcher-only for now, e.g. A/B trigger);
  configuration never goes there. The separation test: actions are clicked
  frequently mid-session, configuration is set and sits still.
- **Right = conversation-derived, optional detail**, collapsed by default,
  event-driven auto-open. Per object class: narrow swap panel (side chats,
  helper, file review), full-width side-by-side (A/B arm reading),
  Changes list (agent-modified files aggregated from mediation records)
  vs Workspace (tree + full-panel preview) as two distinct tabs. Advanced
  inspector tabs (Records/Provenance/Paths/Runtime) stay researcher-only
  right-pane detail.
- **Settings = first-level gear** (bottom-left) opening a dedicated
  surface: general; provider/model config (existing route folds in, sits
  high in the nav); participant panel (§4); reserved data-and-sharing
  block. Research configuration does NOT go into general settings — it
  lives in the researcher workbench.
- **Full-page routes** for activities that want the whole screen: the
  research review page (past comparisons, records, export) reads the
  records layer ONLY — never live app state — so it stays extractable into
  a standalone viewer later.

## 3. Conversation Surfaces (user mode)

- **Morphing mode control**: at new conversation, an obvious
  Understand/Work choice (default Understand; Work costs one extra click);
  after the first message it collapses to a small composer-row switch.
  Principle learned from ChatGPT's toggle — "an obvious choice when a new
  surface opens" — NOT its placement or look.
- **Composer**: role and KB pickers live near the input (flat, no card
  chrome); model chip bottom-right opens the model dropdown with per-model
  thinking badge (unset by default, hover to expand off/low/high) and a
  Manage-models entry — backed by WS `set_session_model`. No permission
  control until a second permission level exists.
- **Session list membership**: only roots and `forkedFrom.purpose:"fork"`
  appear; side chats (`side`), `helper`, and pending `ab-arm` children are
  reachable from their parent conversation only; the chosen A/B arm is
  rewritten to the list continuation.
- **Approvals**: low-key dock above the composer (no alarm styling), with
  an "allowed this session" marker in the transcript for TTL approvals.
- **Helper**: forks FRESH (no parent-context copy — cross-session prompt
  cache reuse is impossible because the helper's own system prompt diverges
  at token 0). Context-aware help is a latent in-conversation skill, not a
  session kind.

## 4. Study Designation And Sharing Surfaces

One primitive, two levels (decision doc §3), all backend-complete:

- **Account/install designation** decides whether ANY study surface
  renders. Source: `/api/auth/me` → `participant` (hosted: account role;
  local: `app-settings.json` `participant {designated, label}`).
  Non-designated users — anyone who got the app from GitHub — see zero
  study surfaces: no private checkbox, no share switch, no participant
  panel content.
- **Sharing default follows designation** (consent-based): designated →
  sharing on by default, everyone else → private by default, regardless of
  Pure/Full and deployment. The per-session switch overrides either way.
  Two semantics the UI copy must distinguish (owner-verbatim examples live
  in decision doc §8): account-login deployments share automatically;
  local installs only MARK conversations — the app has no upload
  capability, export is manual through the (latent) anonymizing tool.
- **Session study tag** (`studyTag {studyId, batch?}`) is the researcher's
  test-identification control (WS `set_study_tag`), surfaced in the
  workbench, inherited by forks, and read by the review page from summary
  rows / records.

## 5. Researcher Mode = User Mode + Deltas

Tab/surface-level increments, per the pane logic: left workbench
(configuration + comparison setup + compact session list), center-top
action strip (A/B trigger), full-page review route, advanced right-pane
inspector tabs, and a reserved view-as-participant toggle. The A/B flow
itself (M6): trigger forks Pure-pinned arms off the live parent via the
copy-fork substrate, records to append-only `ab-comparisons.jsonl`, choice
promotes one arm to the continuation.

## 6. Visual Language (locked by the M7 prototype rounds)

v0.5 tokens (ink `#1f1e1a`, canvas `#f8f8f9`, panel `#ebebec`, card-2
`#f2f2f3`, hairline `#e7e7e9`; Iowan Old Style serif wordmark, in the left
panel — no top header stripe). Ink/black emphasis only — NO green accent.
Flat borderless white blocks; composer elevated by shadow only; Phosphor
icons; send button is a rounded rectangle. The v2 prototype is the visual
authority; `frontend/src/index.css` carries the tokens.

## 7. Explicitly Deferred (do not build; decision doc §8 has triggers)

Approve-all permission level, config-card file format, code-unlock door,
A/B auto-trigger, post-choice participant questions, anonymizing export
tool, workspace management (add-only constraint recorded), per-account
settings dimension, context-aware helper skill, copy/semantics review
agent pass (gate before public repo).

## Change Log

- 2026-07-16: Rewritten for v1-alpha after the M7 IA design pass and
  backend pass. Replaces the vanilla-console description (legacy notes
  preserved in git history) with the two-view-mode model, pane logic,
  study-designation surfaces, per-session model chip, and the
  blueprint-approved / not-yet-implemented frontend status.
- (Earlier vanilla-console entries: see git history of this file.)

## Related Documents

- `project/architecture/core-session-engine.md`: backend authority.
- `project/compound/2026-07-16-decision-v1-alpha-m7-ia-principles-and-research-assumptions.md`
- `project/workstreams/0-v1-full-stack/notes-and-status/20260716-m7-ia-card-sort-v1.md`
- `project/workstreams/0-v1-full-stack/notes-and-status/20260716-v1-alpha-completion-definition.md`
- `design-mockups/m7-ia-pass/v2.html`
