---
doc_type: architecture
slug: researcher-console
scope: v1-alpha frontend and research surfaces — view modes, pane logic, researcher workbench/review, study designation, A/B comparison
summary: Two view modes (user/researcher) over one React frontend; the M7 IA is realized and the local Pure/Full development flow has passed owner testing.
status: current
last_reviewed: 2026-07-21
tags: [frontend, researcher-console, research, view-modes, ia]
depends_on:
  - core-session-engine
implements: []
---

# Architecture: Frontend & Research Console (v1-alpha)

## 0. Status And Reading Order

Backend support for everything below EXISTS and is tested (see
`core-session-engine.md`, change log 2026-07-15/16). The frontend is the
React app in `alt-theory-app/frontend/` (built to `web-server/public-v6/`).
The v1-alpha information architecture is owner-approved AND now realized in
the React app (2026-07-16 frontend build; typecheck + `build:frontend-v6` +
backend tests green). The owner subsequently completed the local Pure/Full
development flow. A distributable v1-alpha bundle remains a delivery concern,
not a frontend-architecture gap. The retained public design rationale for pane
logic, view-mode collapse, study designation, sharing rules, and deferred
assumptions is in
`development/compound/2026-07-16-decision-v1-alpha-m7-ia-principles-and-research-assumptions.md`.
The private card-sort, prototype, completion definition, and iteration records
informed the implementation but are not part of the public repository.

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
  event-driven auto-open. `Related conversations` is the narrow relationship
  container for Branch, BTW, and Helper children. BTW and Helper run there
  with their own transcript/composer while the parent remains in the center;
  either can be promoted to an ordinary Branch. Other object classes include
  file review and (provisionally) full-width side-by-side A/B arm reading,
  Changes list (agent-modified files aggregated from mediation records)
  vs Workspace (tree + full-panel preview) as two distinct tabs. Advanced
  inspector tabs (Records/Provenance/Paths/Runtime) stay researcher-only
  right-pane detail.
- **Settings = first-level gear** (bottom-left) opening a dedicated
  surface: general; provider/model config (existing route folds in, sits
  high in the nav); participant panel (§4); reserved data-and-sharing
  block. Research configuration does NOT go into general settings — it
  lives in the researcher workbench.
- **Full-page research routes are provisional.** The current Review page is a
  probe built before a real study workflow existed. Its object scope,
  filters, comparison flow, records, and export behavior must be derived from
  future study design rather than treated as settled IA.

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
- **Conversation list membership**: only roots and `forkedFrom.purpose:"fork"`
  appear; side chats (`side`), `helper`, and pending `ab-arm` children are
  reachable from their parent conversation only; the chosen A/B arm is
  rewritten to the list continuation.
- **Approvals**: low-key dock above the composer (no alarm styling), with
  an "allowed for this conversation" marker in the transcript for TTL
  approvals.
- **Helper**: starts FRESH, with no parent transcript. Its first prompt invokes
  the bundled `alt-theory-help` skill through the existing Pi `/skill:` path,
  establishing the help rules in that conversation's context without
  rewriting every later message. The skill contains only a small stable
  product-semantic core; concrete and changeable answers must consult current
  user documentation. Promotion preserves that history, and the skill remains
  available for explicit use.

## 4. Study Designation And Sharing Surfaces (provisional product UI)

The persistence primitives below exist, but their user-facing grouping and
journey are not final. `Study setup`, study-associated conversations, Review,
and A/B continuation must be revisited when a concrete study defines the
objects and evidence requirements.

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

## 5. Researcher Mode = User Mode + Deltas (implementation probe)

Tab/surface-level increments, per the pane logic: left workbench
(configuration + comparison setup + compact session list), center-top
action strip (A/B trigger), full-page review route, advanced right-pane
inspector tabs, and a reserved view-as-participant toggle. The A/B flow
itself is provisional: the current M6 probe forks Pure-pinned arms off the
live parent and records to append-only `ab-comparisons.jsonl`, but comparison,
choice, and continuation behavior are not a final product contract.

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
settings dimension, and the remaining copy/semantics review gate before the
public repo.

## Change Log

- 2026-07-16 (frontend build): Frontend realized from the v2 prototype. New
  React shell (`components/shell/*`, `context/ShellContext.tsx`): two-mode
  collapse, workspace-grouped left nav + collapse strip + search overlay,
  morphing Understand/Work + composer model chip (`set_session_model`) +
  approval dock rendering the real Allow-once/Allow-session/Deny options,
  right rail (Related conversations / Changes / Files + researcher adv tabs),
  Settings (participant tab opt-in via General), Researcher workbench +
  A/B float-cmp → arm-split reader + Review page. One sanctioned backend
  addition: read-only `GET /api/sessions/:id/changes`
  (`readSessionChanges`/`projectChangesFromEntries`, unit-tested). Reused
  session allowances now emit the existing `extension_notice` signal.
  Deferred to v1.0.x: cross-study review aggregate (currently per-session).
  The implementation plan is retained in private development records.
- 2026-07-20: Updated owner-acceptance status after the local Pure/Full flow
  passed. Bundle delivery remains separate from the React architecture.
- 2026-07-21: Reopened the prototype mismatch as a real flow gap: BTW and
  fresh-context Helper now run in Related conversations through their own
  WebSocket connection and can be promoted; Branch remains a listed center
  conversation. Files distinguishes actual working folders from managed
  imported references. Researcher/Review/A-B IA is explicitly provisional
  until a real study determines it.
- 2026-07-21: Added first-turn docs-first `alt-theory-help` routing for Helper
  conversations, separated Files into References and Conversation folder,
  and standardized ordinary user-facing copy on Conversation. Technical
  records and APIs retain Session.
- 2026-07-16: Rewritten for v1-alpha after the M7 IA design pass and
  backend pass. Replaces the vanilla-console description (legacy notes
  preserved in git history) with the two-view-mode model, pane logic,
  study-designation surfaces, per-session model chip, and the
  blueprint-approved / not-yet-implemented frontend status.
- (Earlier vanilla-console entries: see git history of this file.)

## Related Documents

- `development/architecture/core-session-engine.md`: backend authority.
- `development/compound/2026-07-16-decision-v1-alpha-m7-ia-principles-and-research-assumptions.md`
