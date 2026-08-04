# Add and Manage Skills

## Installing

There is no marketplace. Skills are folders of readable files; install one
by placing it where the app looks:

- For all your tools (recommended): `~/.agents/skills/<skill-name>/`.
  Found by Alt Theory and by other harnesses that follow the same
  convention.
- Inside a project: a `.agents/skills/` (or `.pi/skills/`) folder in a
  working folder. The skill applies when that folder is attached (Work)
  and travels with the project.

A skill folder has a `SKILL.md` describing what it is for and how to do
it, plus optional reference files. That is the whole format. A skill is
instructions the agent follows, so install ones you have read or trust.

## Enabling

Settings, Skills lists everything discovered (bundled, yours, project) and
controls what loads where:

- Enablement is per mode. Understand and Work have separate enabled sets.
  Understand starts with no external skills; Work's default set is
  broader.
- Changes are saved immediately. New conversations use the new selection;
  an open conversation picks it up when reopened.

## Precedence

The skill precedence setting (global): prefer bundled (default), prefer
mine, or ask me. Collision means same category (two search skills), not
any two skills. Several bundled skills defer to a user skill of their
category (document conversion, page fetching, search). Fine-grained rules:
[Shared Configuration and Assets](../advanced/shared-configuration-and-assets.md).

## Recovery

- A skill never triggers: invoke it by name from the
  [palette](commands.md), then check its `SKILL.md` description. Triggering
  matches on that description.
- The wrong skill wins: check precedence and whether the two share a
  category. Unrelated skills both load.
- A project skill is missing: confirm the folder is attached and the
  conversation is in Work mode.
