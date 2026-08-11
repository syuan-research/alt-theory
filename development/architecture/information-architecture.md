---
title: Alt Theory information architecture
status: v2
last_updated: 2026-08-03
scope: where user-facing things live, how the major surfaces relate, and which information belongs in each
---

# Alt Theory information architecture

This document is the product rule for adding, moving, or reshaping user-facing
surfaces. It describes architecture and structure, not exact copy, dimensions,
or visual styling. Revise it through product discussion when the structure
changes; do not silently bypass it during implementation.

Alt Theory serves two overlapping audiences: people who want to understand a
problem, and people who want efficiency without giving up understanding. The
local bundle must work for non-technical social-science users. Researcher-only
surfaces remain designation-gated and absent for everyone else.

## Governing principles

1. **Put an entry where its product object lives.** Conversation creation,
   list management, message actions, files, and settings each have their own
   home. Do not place an action in global navigation merely because there is
   available space.
2. **Permanent conversation chrome contains conversation configuration.**
   Mode, model and thinking effort, role, knowledge, workspace, and send/run
   controls may live around the composer. Skills and setup workflows do not
   become permanent top-level chrome.
3. **The UI is not a projection of backend schemas.** A control belongs in the
   product only when its intended user can understand it, make a meaningful
   choice, and recognize the result. Folding an internal field under
   "Advanced" does not make it usable.
4. **Show ordinary state quietly; mark only meaningful exceptions.** Do not
   label every common model as reasoning-capable or every ordinary provider as
   API-key based. Surface a distinction only when it changes the user's current
   choice or explains an exceptional state.
5. **Keep live choices current and make consequential silent changes visible.**
   The effective model, thinking effort, mode, workspace, approvals, and run
   state must not silently contradict the user's last visible choice. Stable
   identifiers and paths remain available on demand rather than occupying the
   default view.
6. **Use the agent for complexity after a minimal bootstrap.** Before any model
   works, the product must offer a short deterministic path to one usable
   provider and model. Once Alt can run, complicated provider setup and
   recovery should be assistable through the existing Helper capability rather
   than teaching protocol details in the settings UI.
7. **Promises are statements, not features.** Stable assurances such as local
   storage belong in first-run/About copy, not as permanent controls.
8. **Keep follow-up choices near their trigger and preserve spatial stability.**
   Lightweight confirmation, a single-value setting, or a secondary action
   should complete at the object the user just clicked. Prefer an anchored menu,
   same-row replacement, or stable inline selector over a distant modal or an
   expanding panel. Revealing a choice must not move its trigger under the
   pointer. Use a modal or expanding form only when the user must read substantial
   consequences or provide additional information.

## Surface map

- **Composer and empty state**
  - Empty state presents the Understand/Work choice without forcing a modal.
  - Live composer chrome carries mode, model and effective thinking effort,
    role, knowledge, workspace context where applicable, and run controls.
  - The strip above the composer is a **switchable card slot**, one card at a
    time. Role/knowledge is the session-initial card: a traditional control
    (functional view) tied to how the conversation was set up (session-
    lifecycle view). Steer is the in-process, situational card: it acts on the
    next few messages, not on the session's identity. The slot is not limited
    to these two cards. Switching directions each show a one-line hint in the
    tips slot.
  - Steer offers bundled Alt Theory skills only; each chip's tooltip states
    that skill's own job, while what "steer" means lives on the Steer toggle.
  - Import may appear as a quiet conversation-creation action.
- **Model menu**
  - Shows the effective model and, where supported, the effective thinking
    effort.
  - The active provider's models are directly visible. Other providers appear
    by provider first, then model.
  - Thinking effort is a second-level choice for the selected model, not a row
    of protocol metadata.
  - The menu links to Settings > Models without losing the current draft.
- **Toolbox and slash palette**
  - The toolbox contains a small curated set of common capabilities.
  - The slash palette is the complete home for skills and commands.
  - Skills do not receive permanent navigation entries merely because they are
    installed.
- **Messages**
  - After a completed answer, the pencil means **Edit and compare**. Editing
    stays in the user bubble; Send preserves the original and runs the edit in
    a sibling conversation.
  - After an interrupted turn, the composer quietly offers Continue and Retry.
    Continue resumes from the breakpoint; Retry starts the same prompt again.
    Editing replaces the interrupted attempt in the current conversation. None
    of these recovery actions branches; `/branch` remains explicit.
  - The edit state also offers `Adjust model or role…`. It opens an idle Related
    branch, prefilled with the edit but forked before that user message, so the
    user may change configuration before Send. Hover/focus may reveal the same
    secondary action; it is not a separate mode.
  - `Retry` reruns the latest user message from the start in the same visible
    conversation, whether the previous answer completed or was stopped. It does
    not create a Related child or list branch. Automatic provider retry remains
    runtime recovery, not this user action.
  - Traditional Branch is the second-level `/branch` command, not a message
    button. It opens an idle Related branch without sending.
  - Resolved conversation permissions do not become transcript events. When
    retained for inspection, they live collapsed in advanced Runtime.
  - Thinking, tool activity, compaction boundaries, and connection/run states
    render as conversation events, not settings.
- **Conversation list**
  - Conversations are grouped by workspace.
  - The Working folders header owns folder-only collapse all, expand all, and
    sorting. These controls do not change conversation-family folding.
  - A family head may collapse or expand its descendants without changing their
    list membership. Session identifiers and local session-folder paths remain
    available on demand through the row actions rather than default labels.
  - Root conversations and Branches (purpose `fork`) have the same functional
    status: both are first-class conversations that users may compare, keep, or
    delete independently. Deleting either never deletes its parent, sibling
    Branches, or child Branches. This independence exists because facilitating
    comparison is a core product purpose.
  - Side chats, subagents, and provisional comparison arms do not become
    ordinary list rows unless the user promotes them. Branches and Helpers are
    list members by nature.
  - BTW and subagent conversations are attached to their family. **Show in
    conversation list** is an identity and lifecycle transition for those
    children, not merely a display toggle. Helper needs no promotion: it is an
    ordinary, independently retainable conversation carrying a help marker and
    the bundled help Skill.
  - Related children in the list or Related switcher show an **English prefix
    plus the real title**, not a rename: e.g. `Branch 1 · …`, `BTW 1 · …`,
    `Helper · …`, `Subagent 1 · …`. Numbering is per parent + purpose; Helper is
    not numbered. Do not overwrite `ui-alias` to a bare token like `branch1`.
- **Right rail**
  - Holds files/changes and one selected related conversation (Branch, BTW,
    Helper, or subagent).
  - **Branch / edited comparisons (purpose `fork`)** open the child in this rail at roughly
    **half of the center+right work area** (not half the browser window).
  - **BTW, Helper, and subagents** open at the ordinary default rail width
    (~480 or the user’s last dragged width).
  - Leaving a related child (Back, collapse rail, switch rail tab) clears the
    active related session so re-selecting the same child opens it again.
  - A Related conversation uses the same history, live thinking/tool rendering,
    approvals, skills, and slash commands as the center. It exposes model and
    role; mode chrome is omitted only because the rail is narrow.
  - A pending approval in another conversation produces one global notice on
    every surface, including Settings. The notice does not approve in place: it
    returns to the owner. Roots and Branches open in the center; BTW, Helper, and
    subagents open beside their parent in the right rail. The approval panel then
    appears in that owning pane. In the application shell the notice sits in the
    lower action area above the composer instead of covering transcript content.
  - Center multi-arm A/B comparison stays on Workbench compare surfaces only;
    branches must not open a second center-column “compare pane.”
  - File preview occupies the rail as a real reading surface; rendered Markdown
    is the default for non-technical users, with source available on demand.
  - Files has one inline filter above the existing tree. It keeps matches and
    their ancestors in that tree, expands those ancestors while filtering, and
    restores the prior expansion when cleared. File-change rows may reveal the
    same path here; path copying and file-manager reveal live in contextual
    actions rather than permanent labels.
  - Contextual menus stay open while unrelated panes receive output or scroll;
    scrolling the menu's own anchor pane still dismisses them.
- **Settings**
  - General: app behavior and ordinary preferences.
  - Models: provider connection, model choice, and model capability correction.
  - Role & Knowledge: role, knowledge sets, and related paths when implemented.
  - Help center: a curated capability guide and the shipped localized tips.
    The global Help menu opens either this surface or a new Helper conversation.
  - Trash: deleted conversations remain recoverable for 30 days. Restore and
    permanent-delete actions live here rather than in persistent conversation
    navigation. Permanent conversation deletion removes conversation/session
    records, including a managed import-source copy, but not attachments or
    working files.
  - About: version, changes, and stable storage statements. Bundle version
    display already follows the normal build path; this iteration adds no
    alternate version mechanism.
- **Researcher-only surfaces**
  - Inspector, comparison, provenance, and study controls are
    designation-gated and have zero presence otherwise.

## Model and provider configuration

### User mental model

- A **provider** connects Alt to an AI service.
- A **model** is a choice available through that provider.
- A model's **supported thinking levels** are provider-specific capability
  metadata. Alt obtains them from the maintained models.dev catalog used
  upstream by OpenCode and Pi, with a short cache and explicit user correction
  as the override. `reasoning: true` alone never implies a universal level set.
- A model's **recommended initial effort** is model metadata when a reliable
  upstream supplies it; it is not an app-wide user preference.
- The **selected thinking effort** is conversation state. It is chosen in the
  composer/model menu from the levels supported by that model.

Do not collapse these concepts into one settings form.

### Settings > Models layout

The Models surface uses a master-detail structure:

- The left side is a compact list of existing providers.
- Selecting any provider opens its editor in the right detail area; do not
  require the user to find a small Edit button.
- **Default model** for new conversations is controlled only from an explicit
  control at the top of Models (overflow/summary of the active default).
  Choosing a model inside a provider editor does **not** silently set default.
- The default is only a fallback when a conversation has no explicit model.
  Runtime resolution is conversation selection, then configured default, then
  the ordinary no-model condition; a valid manual choice never requires a
  default to exist.
- Under the **Models** heading inside a provider editor, **Add model**,
  **Fetch model list**, and **Test connection** sit **above** the per-model
  rows so Fetch is findable.
- OAuth-connected providers sort before ordinary API-key providers.
- OAuth-connected providers may carry the single low-key word `OAuth`.
  Ordinary API-key providers need no corresponding badge.
- A visually clear `+ Add provider` action opens the add flow in the right
  detail area.
- Directly under Add provider: a low-key entry to the chatbot/agent model
  configuration guide (docs: configure-models-with-chatbot).
- With no providers configured, the add flow is open by default.

Provider rows do not enumerate context windows, output limits, reasoning
flags, costs, modalities, or metadata provenance. Those facts do not help the
user scan or choose a provider; they live in the provider editor and after
Fetch.

### Composer and related conversations (alpha.6 follow-up)

- Run tips while a turn runs rotate every **10s** (after a short first delay).
- Related/branch switcher in the right rail is horizontally scrollable (CSS
  overflow + **mouse wheel maps to horizontal** when the strip overflows);
  clicking a child opens it explicitly.
- When a related child is open, the outer inspector body does not double-scroll
  the conversation area.
- Main and related composers stay **visually the same card height** when
  side-by-side. Related is a compact variant of the same conversation surface:
  it keeps slash commands, skills, model, and role; only mode chrome is hidden
  for space.
- First-level attach control is **Understand-only**; Work keeps attach in the
  toolbox.
- Mode toggle is compact (~20% shorter than earlier chrome).
- Local mode: left-foot avatar tooltip states local / no account.
- v6 serve uses static `web-server/public-v6` — frontend source changes require
  `npm run build:frontend-v6` before they appear in `dev:web` / `dev:web:local`.

### Add provider

The right-side add flow is flat rather than a stack of nested cards:

1. Pi-native OAuth/auth options supported by the product;
2. one quiet divider;
3. recommended API-key provider presets;
4. agent-assisted or manual custom setup as secondary paths.

OAuth choices appear before API-key presets. Preserve Pi's supported auth
capacity rather than implementing another credential system. Claude
subscription login is not a supported product entry; Anthropic API-key
providers remain possible.

Once at least one usable model exists, complicated setup should offer an
**Ask Alt to add a provider** path through Helper. Manual configuration remains
available for users who deliberately seek it, but it is not the default
teaching path.

Before Alt can run, the add flow may instead link to the public setup guide and
its copyable prompt for getting help from another AI.

Model setup never replaces or detains the main application. With no usable
model, the normal shell remains open and the composer notice area explains the
condition. Settings > Models is primary; a secondary action opens an in-app
copy of the same external-AI setup prompt shipped in the docs, without sending
the user away to find it. Models uses that shared frontend content too. Any
optional onboarding entry routes here; there is no second provider editor.

### Edit provider and model

The normal provider editor focuses on actions the user can understand:
connection state, available models, active model, refresh where meaningful,
and save/delete actions.

An intentionally opened advanced model editor may correct model capability
data that affects runtime behavior, including:

- model id and display name;
- context limits;
- supported thinking levels and their provider-specific value mapping;
- recommended initial effort when it needs a manual correction;
- other human-understandable capabilities only after a real correction use
  case exists.

The advanced editor is not a raw compatibility-schema editor. Wire-format
fields such as `thinkingFormat` and
`requiresReasoningContentOnAssistantMessages` belong to presets, adapters, or
Pi metadata. They are not understandable user choices and must not appear in
the normal or advanced product UI.

### Conversation model and effort

- A model selected before the first message remains visibly selected and is
  used when the conversation materializes.
- The composer shows the effective thinking effort, not an ambiguous unset
  value.
- A new draft without an explicit effort uses a reliable upstream
  recommendation when one exists. Otherwise, order that model's actual
  supported non-off levels and choose the positional middle; for an even
  number of levels choose the lower of the two middle values. Do not equate
  the literal label `medium` with the middle of an expanding level set.
- Only levels supported by the selected model are offered. A model may expose
  none plus a small set such as high/max, while another may expose several
  levels.
- Reasoning models whose upstream metadata exposes only automatic/toggle
  reasoning, or no effort variants for that provider, do not receive a
  fabricated effort menu.
- Editing supported levels in model settings changes the available choices;
  choosing the current effort remains a conversation action.
- No model switch, fallback, or reset may be silent.

### Draft-to-live continuity

Before the first message, model/effort, role, knowledge, mode, visibility,
workspace, study tag, and attachments are one coherent draft. A selector echo
must preserve the other draft fields. The first send materializes that exact
state; it must not create a default session and repair it afterward.

Actions that require an existing parent conversation, such as branching and
side conversations, are not shown as active draft actions. Helper does have a
parentless meaning: it creates a root Helper in the center. Draft-only
affordances must not clear input or close a menu while doing nothing.

The current **General knowledge work** starter is deliberately a temporary
parameter combination: Alt Theory runtime, Work mode, no role, and knowledge
off. Users may edit those selectors before sending. If broader knowledge work
later gains its own role or stronger semantics, replace this local preset with
a focused refactor rather than growing conditionals around the temporary label.

## Agent-assisted setup boundary

Helper is part of the configuration architecture, not merely documentation.
It can help a user understand what they are connecting, inspect relevant
configuration and failure context, propose a change, apply it with normal user
approval, and verify that the provider/model can actually run.

Helper may receive the relevant configuration and failure context. Protocol
details do not become default user-facing explanations. If no model is
available to run Helper, the deterministic OAuth/recommended-provider
bootstrap remains the fallback.

After the public GitHub help documentation exists, the same setup Markdown
provides a copyable prompt that points another AI to those docs. It contains
two clearly separated routes without becoming two pages:

- an on-device agent can inspect and help edit the local configuration;
- an online chatbot with web access can read the public docs and guide the
  user through the same setup without local machine access.

This external-agent route raises first-run accessibility before Alt itself can
run; it complements rather than replaces the shortest built-in bootstrap.

## Review and change rule

Before implementing a UI change, review the affected journey from the target
user's perspective and check:

- Is this the correct surface for the object or action?
- Does the intended user understand and control what is shown?
- Is common information being repeated while the primary action is buried?
- Can existing product or Helper capability handle the complexity instead?
- Does the change preserve visible draft/live state across navigation?

Exact labels and layouts may evolve through prototype review and product discussion.
The surface ownership and boundaries above remain authoritative until this
document is explicitly revised.
