# Decision (round 4): M7 IA principles, view-mode collapse, study designation, sharing defaults, research working assumptions

Date: 2026-07-16
Status: owner-confirmed over a 7-round adaptive-grilling discussion (this
session). The working assumptions in §7 are explicitly ASSUMPTIONS — each
notes what UI/UX it carries and what changes if it is revised.
Anchors: `2026-07-16-decision-v1-alpha-ab-choice-helper-console.md`,
`20260716-v1-alpha-round2-observations.md` (B0–B5),
`20260716-m7-ia-card-sort-v1.md` (the artifact this doc governs).

## 1. The pane information logic (governs the B0 card sort)

- **Left = navigation / "what to work on."** User mode: conversation
  history + projects. Researcher mode: a DIFFERENT left pane — the
  current-experiment workbench (see §6).
- **Center = the conversation itself.** Center-top hosts a thin strip for
  **session-scoped actions** (researcher-only for now, e.g. A/B trigger).
  The strip holds ACTIONS only — configuration never goes there.
- **Right = conversation-derived, optional, more-specific detail** (files,
  sub-conversations, review of the current context). Collapsed by default;
  event-driven auto-open (approval needed, arms ready, file review).
  Reference: Codex right pane — subagent list / one subagent session with
  its own composer / file review, never all expanded at once.
- **Settings = first-level persistent entry** (ZCode-style gear,
  bottom-left) opening a dedicated settings surface; `/settings` is an
  alias. Low-frequency durable config lives here — never accretes onto the
  main screen.
- **Full-page routes = activities that want the whole screen** (research
  review/analysis; model/provider config already does this).

Separation test that produced the strip-vs-config split: **actions are
clicked frequently mid-session; configuration is set and then sits still.**
That difference in mutation frequency, not visual taste, is what separates
the two — placement details are prototype questions.

## 2. View modes collapse to two; "debug" becomes a door

Only **user (simple)** and **researcher** presentation modes exist. The
participant debug button's correct semantic is a MODE SWITCH (a door), not
an expander: `debugExpanded` state and the third `"debug"` viewMode are
removed. Doors that open researcher mode:

- researcher/admin account (door always open);
- code-unlock inside the participant app (formalizes the old debug gate;
  build when protocol needs it);
- local install flag on a researcher's machine.

All doors do the same one thing: switch to researcher mode + activate study
designation (§3). Closing the door switches back and leaves no residue.
Every surface now answers only "user? researcher?" — never "debug-expanded?".

## 3. Study designation — one primitive, two levels

The single upstream commitment that keeps ALL downstream protocol branches
open (owner question: "what dev architecture do the downstream
possibilities imply?"):

- **Account/install level: participant designation.** Is this person a
  designated study participant? VPS carrier: the existing
  `role: "participant"`. Local carrier: an install-time flag in the bundle
  config. Set when provisioning; deployment only SEEDS the default (VPS
  account → participant; local install → non-participant; flip at handout).
  Drives the sharing default (§4).
- **Session level: study tag** (dedicated test vs daily; study/batch id).
  Drives test identification in exports and one-place review. Precedent:
  sim-user probe's runLabel/testBatch. Historical (<10 collaborators)
  untagged data: back-tag once on the export side by account + time window.
- **Physical location: DECIDED (owner-confirmed, post-prototype round).**
  The "header vs side-car" dichotomy dissolved on code inspection:
  `forkedFrom` never lived in Pi's session file — it lives in OUR records
  layer `records/session.json` (`V4SessionHeader`, session-records.ts),
  alongside `mode`, `workspace`, `visibility`, `consentSnapshot`. That file
  is the sanctioned single source of truth; extending it does not touch Pi
  files (the v0.5 mess cannot recur). Extension:
  - `studyTag?: { studyId: string; batch?: string }` — two-level, aligned
    with the existing `runLabel`/`testBatch` precedent; absent = daily use.
  - `forkedFrom.purpose` widens from `"collaboration" | "comparison"` to
    `"fork" | "side" | "helper" | "ab-arm"` (read-compat mapping:
    collaboration→side, comparison→ab-arm). Session-list membership derives
    from it: only root and `"fork"` appear; a chosen A/B arm is rewritten
    to the list continuation.
  - Sharing needs NO new field: `visibility` + `consentSnapshot` exist;
    participant designation only changes their DEFAULT (seed logic).
- **Config as files**: research configuration is serializable to / parseable
  from plain config files (agent-generatable, drag/import, human UI edits
  write back). Not literally card-styled. Architectural point: the same
  config file reproduces the same condition on any account/machine/mode.
- **Review reads the records layer only** (jsonl/exports), never live app
  state. Keeps the existing VPS-export → local-identify flow working, and
  makes the review surface extractable into a standalone unpublished viewer
  later (route now, tool later — same thing at IA level, packaging differs).

## 4. Sharing defaults — designation is the only axis

Owner rule (round 7), recorded verbatim in essence:

- **Default = participant designation.** Designated participant → sharing
  default ON; everyone else → default OFF. **Regardless of Pure/Full,
  regardless of VPS/local.**
- Per-session sharing switch overrides the default either way (placed like
  the current private switch, inverted logic).
- Pure/Full governs agent capability; deployment governs where it runs;
  designation governs data defaults. The old confusion ("cloud+Pure+
  participant = default share, but Full = default private??") existed only
  because these three axes were entangled — they are now orthogonal.
- Ethical framing that makes the rule stable: **the default follows
  informed consent.** Formal participants consented (bounded time);
  friends/collaborators/future Full users did not.
- Anonymization stays required regardless — it lives in the export tool
  (user-triggered), not in the app UI.
- Participant-mode panel in settings (username label + sharing switch) is
  the bounded surface for all of this; its content can be deferred.
- **Two sharing semantics, keyed by deployment (owner, round 4).** The
  same "share" switch means different things and the UI must say which:
  - **Hosted/VPS (real account login)**: sharing is automatic — shared
    conversations reach the research team (the pre-existing rule; v1-alpha
    on the VPS keeps the existing default-non-private behavior).
  - **Local install**: sharing only MARKS conversations; the user later
    exports and sends manually via our (anonymizing) export tool. No
    auto-upload exists.
  - The coupling that makes this legible: real-account login ⇒ automatic;
    no account ⇒ marking only. Participant mode ON ⇒ non-private default.
  - **Non-designated users see nothing**: no private checkbox, no share
    switch, no participant panel content beyond the designation notice —
    anyone who got the app from GitHub gets zero study surfaces.
  - Composer-level sharing indicator exists ONLY under participant
    designation.

## 5. Composer-adjacent config; settings content

- **Role and KB pickers' permanent home is near the input box** — same
  class as chatbot composer affordances (web search / thinking / skills
  toggles). Menu vs checkboxes = prototype question. Must accommodate ≥2
  KBs (a second KB likely before alpha cases). User mode keeps role
  selection — do not lose it in the redesign.
- Optional experience booster (recorded, not required): clicking New
  Conversation opens a local confirm popover with default/last settings —
  "this is what a new conversation needs," one flow.
- Settings surface blocks: general; provider/model config (existing route
  folds in); participant-mode panel (label + sharing switch); reserved
  "data & sharing" block (latent). **Research configuration does NOT go
  into general settings** — it is research-essential, potentially a whole
  config interface later; for now a panel in the researcher workbench (§6),
  popup form deferred ("a popup implies completeness — requires fully
  knowing what is configured", and we only know role/KB/arms today).

## 5b. Post-prototype backend decisions (owner-confirmed discussion round)

- **Per-session model + thinking (B2)**: `V4SessionHeader` gains
  `modelOverride?: { provider, modelId, thinkingLevel? }`, read at session
  open, absent = global config (today model/thinkingLevel are service-level
  only — SessionServiceConfig). Pickable models = the configured models
  list; thinkingLevel uses Pi's `ThinkingLevel` (pipe exists in core),
  no-op on non-thinking models; switching is allowed mid-conversation,
  effective next turn (the fallback chain already flips `manifest.model`
  mid-flight, so the mechanism is proven).
- **Helper context rule (owner round: "the 500k question")**: helper is
  FRESH by default — no parent-context copy. Cross-session cache reuse is
  not guaranteeable: prompt cache matches the request prefix token-by-token
  and the helper's own system prompt diverges at token 0 (plus 5-min TTL),
  so a context-carrying helper would re-read the whole parent at full
  price. Context-aware help instead = a helper SKILL activated inside the
  main conversation (inherits its own cache; incremental cost = the skill
  prompt). No threshold heuristics — fresh/skill is the whole model. The
  "how does the user discover the skill without being nagged" question
  joins the existing skill-salience latent item (§8).
- **Settings storage (owner question)**: already solved in code, two
  layers that match the deployment reality:
  - Deployment-global: `app-settings.json` in dataDir (plain JSON,
    `writeJsonAtomic`, schema-versioned; sessions SNAPSHOT settings at
    open, so changes never mutate a running agent). Local install = this
    file IS the user's settings. Extending settings = extending this file;
    no toml needed.
  - Per-account (VPS): `AccountRecord` already carries the per-user
    profile fields — `displayLabel`, `defaultRoleCondition`,
    `defaultConsent`, `limits`. The participant panel maps onto these.
  - The split is intentional, not a gap: on the VPS (research tool),
    experiment-shaping settings (skills, models, KB) are the RESEARCHER's
    and deliberately global; participants get account-level fields only.
    Frontend must gate settings blocks by role accordingly. Browser-only
    UI preferences (collapsed panes etc.) stay in localStorage.

## 6. Researcher mode = user mode + deltas

Researcher additions are tab/surface-level increments over user mode
(partial decoupling; not mandatory everywhere). The old Research inspector
tab DISSOLVES into three homes per the pane logic:

- **Left workbench** (different from user's left): current configuration
  visible + auto-applied to new conversations; comparison setup (UI trigger
  auto-copies the current config as the starting point; no field-diff
  detection; same-config comparison is legal); compact one-line session
  list (researcher focuses on the current experiment, not history).
- **Center-top action strip**: session-scoped, frequently-clicked actions
  (A/B trigger). Actions only.
- **Review page** (full route): past comparisons, records, export — wants
  width, is not conversation-derived, so neither left nor right. Depends
  on records layer only (§3) → extractable later.
- Advanced inspector tabs (Records/Provenance/Paths/Runtime) stay as
  researcher right-pane detail.
- **View-as-participant toggle** reserved (researcher previews what the
  participant sees).

## 7. Research working assumptions (revision-sensitive)

| # | Assumption | Carries | If revised |
|---|---|---|---|
| A1 | VPS + participant daily accounts is the running deployment; local bundle secondary (researcher machine as backup) | door defaults (§3), sharing seeds (§4) | re-seed defaults only; designation primitive unaffected |
| A2 | Participants do BOTH daily use and dedicated tests; future studies use-first-then-test | session-level study tag; code door | tag granularity may need study-phase values |
| A3 | History is Pure-only; Full may extend to some users' own machines later (privacy unresolved; may never happen) | latent: Full share opt-in flow, consent UX | if it happens: consent/scrubbing UX + same-format data, no IA change |
| A4 | A/B triggering is non-automatic, synchronous, researcher-in-the-loop (in person or online) | action strip; no cross-machine signalling built | remote trigger ⇒ cross-session signalling (engineering, not IA) |
| A5 | Data flow = VPS export → local identification; anonymization later | review page reads records only; export tool owns anonymization | none structural |
| A6 | <10 collaborators so far; no test marking exists (known gap) | back-tag once at export side | n/a (gap closes with §3 tag) |
| A7 | "Participants" today mixes formal participants and collaborators | designation set per-account at provisioning, owner's call | rule already handles the mix |

## 8. Latent items (assumption-coupled deferrals — the first home)

Each pinned to what it hangs on; activate when the trigger fires.

- **Anonymizing export tool** (A5) — user-triggered, outside app UI.
- **Full-mode share opt-in flow** (A3) — settings "data & sharing" block.
- **Code-unlock door** (A2/A4) — when protocol wants participant-machine
  dedicated tests.
- **Cross-machine remote trigger** (A4) — only if synchronous-remote
  protocol lands.
- **A/B auto-trigger + post-choice participant questions** (protocol;
  already deferred in the round-3 decision doc).
- **Participant account management / back-tagging history** (A6/A7).
- **Research-config popup form** (§5) — when "what is configured" is
  completely known.
- **User-oriented docs folder in agent-assets as the helper's reading
  source** (recorded here per owner; not a UI item).
- **Workspace / skill-path management** (not v1). Hard constraint when it
  lands: workspaces are ADD-ONLY — more concurrently-active workspaces can
  be added, but a workspace with existing conversations can never be
  removed, and existing conversations are never restricted.
- **Per-account settings beyond AccountRecord fields** — only needed if
  the cloud ever becomes a real multi-tenant product (no short-term plan;
  VPS stays a research tool). Mechanical change when it fires: give
  `app-settings.json` an accountId dimension (per-account file under the
  accounts dir). Not an architecture change; do nothing now.
- **Context-aware helper skill + its discovery affordance** (owner
  "500k question" round) — helper stays fresh; in-conversation skill is
  the context path. Solve discovery together with the existing
  skill-salience item below.
- **Copy/semantics review pass by a dedicated agent** (timing TBD, owner
  round 5). Sweep all user-facing strings for semantic clarity and
  friendliness. Owner's calibration examples: "and you send an export
  yourself later" should read like "数据上传只会通过您手动发送给我们，
  本应用没有数据上传功能" (state the ABSENCE of upload capability, not
  just the manual step); never say "VPS/hosted" — say "若您使用账号登录
  网址（如 test.alttheorylab.com），您的对话数据保存在服务器上，则…".
  Plain consequences, no infrastructure words.

## 9. Recording scheme — two homes (owner-set)

1. **Assumption-coupled latent items** → §8 of this doc (with triggers).
2. **Everything else banked while working** (UX observations, stray ideas)
   → the pass's living observations file
   (`20260716-v1-alpha-round2-observations.md` and successors).

The brainstorms folder is no longer a destination for this track.
