# Alt Theory — Release Notes

User-facing changes only, written for researchers, not developers. Started
with v1.4.0-beta.1; earlier tags predate this file. Internal engineering
detail lives in commit history and `development/`.

---

## Unreleased

Family relations are now derived from lineage by one rule instead of
patched per feature — the class of "random" family bugs (broken middle
levels, vanishing subagents) goes away at the root.

### Conversation families

- A deleted middle branch no longer splinters the family: grandchildren
  attach to their nearest living ancestor in the list, and the family
  stays one visual unit.
- Attached conversations (BTW / Helper / subagent) now belong to the
  family, not to one parent: they survive every deletion as long as ANY
  branch, root, or listed member of the family lives, and only leave when
  the last one goes (taking them along, so nothing lingers invisibly).
- The Related rail now shows the family's attached conversations from
  every member — an identical branch sees its sibling's subagents too,
  each labeled with where it came from.
- Branch names are now short mechanical paths that extend at every level:
  `br1` (first branch), `br1-btw2` (its second BTW), `sa1` (a subagent) —
  so any depth of nesting stays unambiguous. Numbering counts Trash, so
  deleting a sibling no longer renumbers the rest. Your own renames are
  kept under the prefix, exactly as before.

### Conversation list & composer

- Moving a conversation to another folder no longer pre-selects "also
  move all other conversations" — the family still always moves together;
  unrelated folder-mates are now opt-in.
- The 3-dots menu of a conversation row now opens at the row you clicked
  (and flips upward near the bottom edge) instead of drifting down the
  page or off-screen on long lists.
- The role and model menus of a side conversation now close when you
  click anywhere else.
- Files and folders can be dragged from the right-hand file tree straight
  into the composer to attach them — same as dragging from Finder or
  Explorer.

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
