# Agent Assets

This folder contains document-like assets that shape agent behavior and user experience.

Current first-slice layout:

- `ALTTHEORY.md` is the application/session context loaded by Alt Theory runtime sessions.
- `soul/` contains selectable soul/personality stance seeds. Runtime default
  selection prefers `soul/soul-latest.md`, then `soul/soul.md`; if neither
  exists, sessions run with no soul layer.
- `role-presets/` contains selectable role/style/behavior presets. The
  researcher workbench draft defaults to **no role preset** (`None`) until one
  is selected. This replaces the old `profiles/` naming because these files
  describe the agent role, not the user.
- `prompts/pi/` is the current Pi adapter prompt-template area for review and future organization.
- `kb/ep-core/` is the current runtime KB copy used for the first v0.3 smoke-test path. It is not yet declared the long-term KB source-of-truth.
- `models.example.json` is an uncredentialed example for custom provider/model configuration. Runtime keys stay in environment/config, not Git.
- `skills/` is the runtime skill root. It contains the user-facing
  `conversation-summary` and `alt-theory-help` skills; `internal` discovery
  must not expose dev SWE bundles to participants.
- Active SWE and dev-maintenance skills live under `project/local-skills/`
  (`cs-swe-v0-4/`, `model-preset-maintenance/`). Historical `cs-swe-*` shards
  live in local ignored `_archives/skills/`.

## Adding Runtime Assets

- New role presets go in `role-presets/{slug}.md`; prefer lowercase
  kebab-case. The slug is the filename without `.md`. The researcher console
  can also select `None`, which means no role preset layer is injected.

## Role Presets (As-Is)

This section records current asset and runtime behavior. It is **not** a target
design.

### Default

- Researcher/admin/anonymous draft sessions start with **no role preset**
  (`None`).
- Participant draft sessions get a role from the account's `defaultRoleCondition`
  (see `project/architecture/core-session-engine.md` §5.1).

### Legacy `default.md` debt

Early backend and workstream notes assumed `role-presets/default.md` as a
system default. That path is **legacy debt**, not the current product default.
The backend still checks for `default.md` only because the check remains in
code (`server.ts` → `defaultRolePresetSlug()`). Do **not** add or restore
`default.md` unless deliberately retiring that code path. Files such as
`legacy-default-for-dev.md` are inert unless selected by slug.

### Archive naming (operational convention)

When replacing an active preset in place, keep the same slug filename and move
the prior version aside in the same directory:

```text
role-{name}.md                 # active slug (runtime + UI discovery)
role-{name}-YYYYMMDD-N.md      # archived snapshot (inactive unless selected)
```

Examples in this tree: `role-conceptual-theory-companion.md` (active) and
`role-conceptual-theory-companion-20260612-1.md` (archive). Unlike soul, there
is no `role-latest` alias; only explicit slugs resolve. Old sessions keep the
slug recorded in their assembly manifest.
- New soul variants go in `soul/{slug}.md`; prefer lowercase kebab-case. Use
  `soul-latest.md` for the default experimental soul, or `soul.md` as the
  fallback default. The researcher console can also select `None`, which means
  no soul layer is injected.
- New KB domains go in `kb/{domain-slug}/`; prefer lowercase kebab-case for
  the directory name. Put ordinary markdown files inside the domain directory.
- New Pi adapter prompt templates go in `prompts/pi/{template}.md` only when
  the Pi adapter prompt layer itself is being changed. Do not use this folder
  for ordinary semantic KB or role-preset material.
- Local provider/model config should copy from `models.example.json` to an
  ignored local `models.json` or another ignored path. The `apiKey` field is an
  environment-variable name, not the plaintext key.

2026-06-08 cleanup status:

- The old `runtime/pi-tui/` duplicate runtime context was removed during manual
  folder cleanup.
- Backend code now loads the current runtime-facing assets from `agent-assets/`.
- Do not recreate duplicate prompt/KB/role-preset copies just to make the app
  run. Keep the backend pointed at the single layout above.

2026-06-08 backend repair decisions:

- Do not use root `AGENTS.md` as an Alt Theory runtime personality file. Root
  `AGENTS.md` is for development harnesses.
- Do not restore `alt-theory-app/web-server/assets/kb/` as a duplicate KB copy.
- Do not use `profiles/` for agent behavior. Use `role-presets/`.
- Treat `prompts/pi/` as Pi adapter prompt templates, not as the semantic asset
  root.

Removed from runtime skill surface (2026-07-01):

- All `cs-swe-*` bundles and `model-preset-maintenance` moved out of
  `agent-assets/skills/`. Active dev copies: `project/local-skills/`.
  Historical shards: `_archives/skills/` (local, gitignored).
- `cs-modified-v0-1` was an incorrect intermediate artifact. Historical context
  belongs in plan-records, not in runtime skills.

Local ignored archive convention:

- `_archives/skills/` holds directly openable CS-SWE history for comparison.
  It is not runtime-loaded.

Future topics, not solved in this slice:

- `user.md` / `memory.md` alignment with OpenClaw and Hermes patterns.
- Asset authoring versus runtime/test/release bundles.
- Source-of-truth rules for KB and prompt versions.
- Session-level agent instructions.
- Whether project-scoped skills should later be installed globally, vendored as plugin assets, or kept as readable project rules only.
