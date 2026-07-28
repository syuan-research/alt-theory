# Add and Manage Skills

## Installing a skill

There is no marketplace and no installer ceremony — skills are folders of
readable files, and installing one is placing it where the app looks:

- **For all your tools** (recommended): the cross-harness skills folder
  in your home directory, `~/.agents/skills/<skill-name>/`. Skills here
  are found by Alt Theory and by other harnesses that follow the same
  convention.
- **Inside a project**: a `.agents/skills/` (or `.pi/skills/`) folder in
  a working folder — the skill applies when that folder is attached
  (Work mode), and travels with the project.

A skill folder contains a `SKILL.md` describing what it is for and how to
do it; optionally more reference files. That is the whole format. You can
write one yourself in an afternoon — or ask the agent to help you draft
one from your own practice, which is a genuinely good early project.

Where a skill comes from matters: a skill is instructions the agent will
follow, so install skills you have read or trust, the way you would treat
any advice you plan to act on.

## Enabling and scoping

**Settings → Skills** lists everything discovered — bundled, yours, and
project — and controls what loads where:

- Enablement is **per mode**: Understand and Work have separate enabled
  sets, because their capability boundaries differ. Understand starts
  with no external skills until you choose; Work's default set is
  broader — both sets are yours to change.
- Changes are saved immediately but never mutate a running conversation
  silently: new conversations use the new selection naturally, and an
  open conversation picks it up when reopened.

## Precedence: when your skill and a bundled skill overlap

The **skill precedence** setting (Settings) is one global choice:

- **Prefer Alt Theory's bundled skill** (default) — the product's methods
  apply unless you say otherwise;
- **Prefer my skill** — your same-category skill wins;
- **Ask me** — collisions surface as a question in the conversation.

Independent of the setting, several bundled skills explicitly defer to a
user-installed skill of their own category (document conversion, page
fetching, search) — richer domain versions of these are exactly what
users bring. For multi-harness composition and the fine-grained rules,
see [Shared Configuration and Assets](../advanced/shared-configuration-and-assets.md).

## Verify

- **Which skills are active in this conversation?** Settings → Skills
  shows the enabled sets; in the conversation, skill use is visible as
  named skill lines — and asking "which skills do you currently have?"
  gets you the live list.
- **Did my new skill get discovered?** It appears in Settings → Skills
  after the app rescans (reopen settings, or restart the app after a
  first-ever install).

## Recovery

- **The skill never triggers**: invoke it explicitly by name from the
  [command palette](commands.md) — explicit invocation always works.
  Then check its `SKILL.md` description: triggering is matched on that
  description, so a description that does not mention your phrasings will
  not fire on them.
- **The wrong skill wins**: check the precedence setting, and whether
  the two skills actually share a category (unrelated skills do not
  collide — both load).
- **A project skill is missing**: confirm the containing folder is
  actually attached to this conversation, and the conversation is in
  Work mode.
