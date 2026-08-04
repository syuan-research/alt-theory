# Shared Configuration, Skills, Models, and Assets

When Alt Theory lives alongside Pi or another harness: ownership (who owns
which config), discovery (what is read from where), precedence (which
same-named thing wins).

## Ownership

- Alt Theory owns its model/provider/auth config, app settings (skill
  enablement, precedence, auto-titling), bundled assets (skills, souls,
  roles, knowledge bases), and conversation data. All in its own
  directory. Its model config lives under `~/.alt-theory/pi-agent/`.
- Alt Theory reads but does not own the shared cross-harness skill
  location (`~/.agents/skills/`) and project resources inside attached
  working folders.
- Alt Theory never touches another harness's config home. It does not
  point its runtime at Pi's config directory and does not sync. Bringing
  an existing setup across is a one-time, guided migration: the Helper
  inspects your config and copies what is useful.

Rule: read the ecosystem's resources in place, own your own state, never
mirror someone else's.

## Where configuration actually lives

| Directory | Read by Alt Theory? | Owned by |
|---|---|---|
| `~/.alt-theory/pi-agent/` | yes (own models/auth/settings) | Alt Theory |
| `~/.agents/skills/` | yes (shared skills) | shared, cross-harness |
| `~/.pi/agent/` | no | Pi |
| Attached working folder `.agents/skills/`, `.pi/skills/` | yes while attached | the project |

## Discovery

| Source | What loads | When |
|---|---|---|
| Bundled (`agent-assets/`) | Alt Theory skills, souls, roles, KBs | Always (subject to mode/enablement) |
| Your app-level enablement | External skills enabled per mode | Per Skills settings |
| Shared cross-harness dir | Skills in `~/.agents/skills/` | When enabled |
| Attached working folders | Project skills + context files | Work mode, while attached |

Each conversation records at creation exactly which assets it loaded and
from where, so "why did it behave that way" is answerable later
([inspection](compatibility-updates-debugging.md)).

## Migrating an existing Pi or harness setup

1. Open the Helper and ask it to inspect your existing configuration.
2. It reads the source config (for example Pi's under `~/.pi/agent/`) and
   lists what is useful to bring across: providers, model definitions,
   skills.
3. You approve what to copy.
4. The Helper writes the copies into Alt Theory's own files under
   `~/.alt-theory/pi-agent/` and the shared skills folder. The source is
   not modified.

This is a one-time migration, not ongoing sync.

## Precedence

Two mechanisms, layered:

1. The precedence setting (global, three-way): prefer bundled, prefer
   yours, or ask on collision. Default: prefer-bundled. Collision means
   same category (two search skills), not any two skills.
2. Skill-text deferral: several bundled skills defer to a user skill of
   the same category (document conversion, page fetching, search).

Non-skill assets have no collision: model config is Alt Theory's own; a
role or soul is whatever the conversation selected; project context files
all load.

## Composing your skills with the bundled methods

- Let the cross-cutting method skills (search-policy, aligning,
  plan-record, conventions) do their job. They are thin and
  domain-neutral.
- Bring your domain skills for substance. They compose with the method
  layer: search-policy governs provenance, your skill governs what counts
  as a good source in your field.
- Where you disagree with a bundled method, replace it (precedence: prefer
  yours).
