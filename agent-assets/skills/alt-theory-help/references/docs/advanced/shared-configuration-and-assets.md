# Shared Configuration, Skills, Models, and Assets

When Alt Theory lives alongside Pi or another harness, the practical
questions are ownership (who owns which config), discovery (what is read
from where), and precedence (which same-named thing wins). This page
states all three exactly.

## Ownership

- **Alt Theory owns**: its model/provider/auth configuration, its app
  settings (skill enablement, precedence, auto-titling), its bundled
  assets (skills, souls, roles, knowledge bases), and its conversation data.
  All in its own application directory.
- **Alt Theory does not own but reads**: the shared cross-harness skill
  location (`~/.agents/skills/`), and project resources inside attached
  working folders (project skills, agent context files).
- **Alt Theory never touches**: another harness's configuration home. It
  does not point its runtime at Pi's config directory, and it does not
  sync. Bringing your existing Pi/OpenCode setup across is a **one-time,
  guided migration** — the Helper inspects your existing config with you
  and copies what is useful into Alt Theory's own files, visibly.

The design rule underneath: read the ecosystem's resources in place,
own your own state, never mirror someone else's.

## Discovery

What a conversation actually loads, by source:

| Source | What loads | When |
|---|---|---|
| Bundled (`agent-assets/`) | Alt Theory skills, souls, roles, KBs | Always (subject to mode and enablement) |
| Your app-level enablement | External skills you enabled per mode | Per the Skills settings |
| Shared cross-harness dir | Skills in `~/.agents/skills/` | When enabled |
| Attached working folders | Project skills (`.agents/skills/`, `.pi/skills/`) and project context files | Work mode, while attached |

Each conversation records at creation exactly which assets it loaded and
from where — the record that makes "why did it behave that way" answerable
later ([inspection](compatibility-updates-debugging.md)).

## Precedence

Two mechanisms, layered:

1. **The precedence setting** (global, three-way): prefer Alt Theory's
   bundled skill, prefer yours, or ask on collision. Default:
   prefer-bundled. "Collision" means same category of method — two
   search skills, two document skills — not any two skills.
2. **Skill-text deferral**: independent of the setting, several bundled
   skills explicitly defer to a user-installed skill of their own
   category (document conversion, page fetching, search) — where a richer
   domain-specific replacement is the expected case.

For non-skill assets there is no collision to resolve: model config is
Alt Theory's own; a role or soul is whatever the conversation selected;
project context files all load (they describe different things, and the
agent weighs them like any project documentation).

## Composing your skills with the bundled methods

The intended pattern for serious custom setups:

- Let the **cross-cutting method skills** (search-policy, aligning,
  plan-record, conventions) do their job — they are deliberately thin
  and domain-neutral.
- Bring **your domain skills** for substance: your field's literature
  practice, your methods tradition, your writing conventions. They
  compose with the method layer rather than fighting it — search-policy
  governs *honesty*, your skill governs *what counts as a good source in
  your field*.
- Where you genuinely disagree with a bundled method, replace it
  (precedence: prefer yours) rather than working around it.

## Models

Model and provider configuration is stored in Pi-compatible files inside
Alt Theory's directory — the format is shared even though the files are
not. Practical effects: provider setups are easy to migrate in either
direction (the guided migration reads Pi's files directly), model
definitions written for Pi work as-is once copied, and nothing you do in
Alt Theory alters what your Pi installation uses.
