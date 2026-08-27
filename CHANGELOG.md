# Alt Theory — Release Notes

User-facing changes only, written for researchers, not developers. Started
with v1.4.0-beta.1; earlier tags predate this file. Internal engineering
detail lives in commit history and `development/`.

---

## v1.4.7-beta.1 — 2026-08-27

This release keeps conversations intact across interruptions and settings
changes, makes compaction visible in real time, and reworks the provider
setup panel.

### Conversation continuity and reliability

- Opening Settings or Review no longer restarts the conversation you were
  writing in; your draft, including undo history, is exactly as you left it.
- When a subagent's turn ends — completed, failed, or interrupted — the parent
  conversation learns about it exactly once. Stopping a conversation is now
  reported as an interruption rather than a failure.
- A newly spawned subagent that cannot start on its first model still falls
  back to its preset chain, but only until it starts doing real work; later
  turns never silently switch models underneath it.
- Subagent spawn validation follows the configuration snapshot each
  conversation was opened with; new conversations pick up configuration
  changes immediately without disturbing open ones.

### Compaction you can see

- Long conversations announce their automatic summarization as it happens:
  the transcript gains its compaction marker immediately, and the context ring
  drops to unknown instead of showing a stale percentage until real usage
  arrives. Manually compacting uses the same path.

### Model setup

- The add-provider panel is organized into three labeled groups: sign in with
  an official account (OAuth), configure a custom provider with endpoint and
  key, and quick setups for recommended providers. A note explains why the
  quick setups are what they are, and the OpenAI API, Anthropic API, and Qwen
  3.7 Max (Bailian) entries are gone — GPT models remain available through the
  ChatGPT (Codex) OAuth sign-in.
- Each model shows its own thinking-level choices where the provider offers
  them, instead of one switch for all models under a provider.

## v1.4.6-beta.1 — 2026-08-21

This release makes subagents configurable, improves model-account recovery, and
removes several ways conversations could become blocked.

### Subagents for different kinds of work

- Settings now includes three ready-to-use subagent profiles: `general-medium`
  for most work, `general-low` for high-volume or clearly bounded work, and
  `general-high` for strategic review and complex architecture. Custom profiles
  can choose a provider/model, thinking level, and ordered fallback models.
- Alt can select a profile for each task, override its model or thinking level
  when needed, and let an active subagent delegate further work. Up to ten
  subagent conversations can run at once.

### Model setup and account recovery

- Saved OAuth providers now keep **Reconnect** visible in their existing card.
  Expired or failed authorization is reported with a direct route back to model
  settings instead of a generic network-only error.
- Provider model discovery now keeps the provider's live result as the source of
  truth, including models newer than bundled metadata. OpenAI Codex subscription
  accounts use their supported model-list endpoint, while manual model entry
  remains available when a provider does not publish a list.

### Conversation control and reliability

- Completed subagent work no longer leaves the parent conversation indefinitely
  processing or stopping. Escape still closes the active menu first, then stops
  the running conversation in the focused pane.
- Deleted or stale default models no longer prevent conversations from opening;
  a model is required only when a message is actually sent. Conversation menus
  also include recoverable **Delete entire family**, and transcript export now
  reports the real outcome.
- Approval actions are localized, and denied or failed tools no longer appear as
  successful reads, commands, edits, or file changes.

---

## v1.4.5-beta.2 — 2026-08-13

- Fixed a regression from v1.4.4-beta.1 that could replace conversation names
  with truncated IDs when the session list contained more than 20 conversations.

---

## v1.4.5-beta.1 — 2026-08-11

This release makes Alt Theory easier to navigate and ask for help, while making
approval-dependent work substantially harder to lose or interrupt.

### Find and organize work

- Conversation order can follow names or the most recently accepted prompt.
  Working folders have compact Search, collapse, expand, and sort controls;
  conversation families remain independently foldable.
- The Files pane now filters results inside the existing tree. Contextual actions
  copy paths, reveal files in the tree or file manager, and provide session
  identifiers and folders only when requested.

### Help without leaving the app

- The global Help menu opens either a focused Help center or a new Helper
  conversation. Help content, setup guidance, Skills, and localized tips now
  share one user-oriented entry point.
- Model setup includes the complete external-AI configuration prompt inside Alt
  Theory, with no required detour through the documentation.

### Approvals and continuity

- Pending approvals survive reopen and reconnect. A global notice returns you to
  the correct center or Related conversation, including approvals belonging to
  right-pane work.
- Routine reads from agent-resource directories require fewer interruptions.
  Approval actions and their owning conversation stay connected across panes.

### Other new and fixed

- Trash now supports selecting, restoring, or permanently deleting multiple
  conversations without replacing the remaining list with a loading screen.
- Context menus stay open during unrelated output, and repeatedly revealing
  different files no longer causes a white screen.

---

## v1.4.4-beta.1 — 2026-08-10

This release makes model setup non-blocking, makes provider saves finish
truthfully, and adopts ASAR packaging while keeping runtime resources readable.

### Models and providers

- Saving a provider now visibly completes as soon as its model and credential
  data are durable. A slow, unrelated catalog refresh no longer leaves Save
  silently stuck.
- A model selected for a conversation runs without requiring a global default.
  The default is now only the fallback when a conversation has no selection.
- Provider setup no longer silently makes the first saved model the default.

### First launch

- Alt Theory opens the normal app even when no model is configured. The composer
  explains what is missing and links directly to **Settings → Models**.
- The blocking first-run provider page was removed. **Settings → Models** is now
  the single model-configuration surface.

### Desktop package

- Application code and dependencies now use ASAR. Agent assets and Help docs
  remain ordinary readable files under the app's resources directory.

---

## v1.4.3-beta.1 — 2026-08-09

This release keeps active work visible and recoverable across panes, retries,
restarts, and compaction. The Files pane now scales to large working folders.

### Related conversations (right pane)

- A conversation opened mid-run shows the running turn immediately — the
  prompt, the stream so far, and live progress. Previously the pane
  stayed blank until the whole task finished, and replies could appear
  and vanish on reopen.
- You can scroll up and select text while the answer streams; the pane
  no longer forces itself to the bottom.
- The rail now shows the conversation's parents too — the whole chain up
  to the root, so a child always sees where it came from.

### Composer

- Sending while the AI runs now means one thing, in both panes: your
  message waits as a card and slips into the running task at the AI's
  next step — during a long tool call it waits for exactly that call, not
  for the whole task. Until it slips in you can still edit or delete it.
  Previously the center held messages until the entire run finished and
  the right pane injected immediately — two silently different behaviors.
- A message that entered a running task appears in every open view of
  that conversation, including views opened later.

### Conversation recovery

- Retry now lives with the latest user message and keeps that message visible
  while the replacement answer starts. It reruns the same prompt in the same
  conversation without creating a comparison branch.
- After Stop, Continue resumes completed work from the breakpoint; Retry starts
  the prompt again; editing replaces the stopped attempt without branching.
- If the app closes during a long task, reopening keeps durable partial work
  visible and available to continue instead of rolling back to the prior turn.
- A successful compaction boundary appears immediately, and its summary is
  identified to the model as compacted earlier context.

### Files

- Working folders load on demand instead of silently stopping after 1,000
  files, so large folders remain complete without an expensive full scan.
- The tree now supports Expand all, Collapse all, keyboard navigation, and
  accessible selection. File rows can copy the full path with quiet feedback.
- Long text files open directly in the preview without a separate "Show full
  file" gate.

### Subagents

- A subagent now inherits its lead conversation's mode: a Work lead
  spawns Work subagents by default (previously they silently defaulted to
  Understand unless the lead asked). An Understand lead still never
  spawns Work subagents.
- Messaging an idle subagent now always makes it act. Previously the
  message could just sit in its inbox unless the lead remembered an
  obscure flag — subagents that "got the message but never ran".

### Under the hood

- Center and right pane share one conversation engine, renderer, and
  prompt queue; the two panes can no longer drift apart.

## v1.4.2-beta.1 — 2026-08-06

Family relations are now derived by one rule from lineage; the "random"
family bugs go away at the root.

### Conversation families

- A deleted middle branch no longer splinters the family: grandchildren
  attach to the nearest living ancestor.
- BTW / Helper / subagent conversations belong to the family, not one
  parent: they survive until the family's last branch or listed member
  goes.
- The Related rail shows the family's attached conversations from every
  member, each labeled with its origin. A small legend explains the
  name tokens.
- Branch names are short mechanical paths — `br1`, `br1-btw2`, `sa1` —
  unambiguous at any depth. Numbering stays stable when siblings are
  deleted; your own renames are kept.

### Conversation list & composer

- Moving a conversation no longer pre-selects "also move all other
  conversations"; the family itself still moves together.
- A row's 3-dots menu opens at the row you clicked and flips upward near
  the bottom edge.
- A side conversation's role and model menus close on any outside click.
- Files and folders drag from the right-hand file tree straight into the
  composer.

## v1.4.1-beta.1 — 2026-08-05

Bug fixes from 1.4.0 field testing. A conversation family now behaves like a
family: one working folder, and a survivor takes over when the mainline goes.

### Conversation families

- Moving a conversation to another working folder now moves its whole
  family — every branch, branch-of-branch, and attached conversation — no
  matter which member you drag. Previously, dragging a promoted branch
  could leave part of the tree behind in the old folder, or with no folder
  at all.
- On every start the app repairs families that older versions left
  inconsistent: members re-align to the family root's working folder, and
  a family that had lost all its visible members gets one back.
- Deleting a mainline no longer scatters its branches into separate
  top-level rows: the oldest branch becomes the family's head in the list
  and the others stay nested under it.
- "Make this the main conversation" works again in families whose mainline
  is gone: crown any other member — a branch-of-branch included — to make
  it the family's head, and the current head now carries a crown marker in
  the list. Previously these families lost the option entirely — there was
  no mainline left to step down, so the crown never appeared.
- Promoting a branch-of-branch in a normal family no longer makes the
  whole family disappear from the conversation list (a display-cycle bug).

### Conversation list

- Folders in the conversation list now sort by name and stay put;
  previously any click made the active folder jump to the top of the list.

### Settings

- Interface settings (thinking display, dark mode, panel sizes) survive a
  restart of the desktop app. The app now keeps a stable local address
  across launches; previously each launch got a fresh address, which
  silently reset browser-stored settings every time.

### Steer

- Steer offers Alt Theory's bundled skills only (they are written for
  steering; this may open up later).
- Each steer button's tooltip tells you what that skill does; the Steer
  toggle explains what steering is. A squeezed button shows its full name
  on hover.
- Switching between the role/knowledge card and Steer shows a one-line
  hint about what each card is for.
- The align-first skill now insists harder: the moment it is activated,
  the AI must stop and discuss before doing any work. Some faster models
  used to skip straight to executing.

## v1.4.0-beta.1 — 2026-08-04

This 1.4.0 beta release makes long conversations fast and cleans out
retired machinery. Nothing about how you work changes.

### Performance

- Long conversations no longer slow down with age: sending, switching
  models or modes, and stopping a run respond instantly regardless of
  history length.
- While the AI is typing, the interface stays smooth: each incoming word
  redraws only the growing answer, not the whole transcript.
- The conversation list refreshes faster; permanently deleted
  conversations no longer cost anything in the background.

### Trash

- The 30-day automatic cleanup of the trash skips a damaged conversation
  instead of silently stopping.
- Temporary "Compare responses" (A/B) conversations are deleted together
  with their parent instead of lingering invisibly on disk.

### Removed code

- Roughly 10,000 lines of retired machinery removed (pre-v1 interface, an
  unreachable "projects" feature, an obsolete Chinese-docs pipeline, old
  scripts, unused dependencies). No user-visible change.
