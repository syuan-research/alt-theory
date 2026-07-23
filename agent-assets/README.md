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
- Development-only agent skills are intentionally kept outside the public
  repository. Historical `cs-swe-*` shards may live in a local ignored
  `_archives/skills/` directory.

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
  (see `development/architecture/core-session-engine.md` §5.1).

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
  `agent-assets/skills/`. Development copies are private; historical shards
  may remain in `_archives/skills/` (local, gitignored).
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

## Asset versioning convention (2026-07-23)

- Top-level `*-latest.md` files (`soul/soul-latest.md`,
  `role-presets/role-conceptual-theory-companion-latest.md`) are the MUTABLE
  working versions. Edit them freely. The backend default slugs point at the
  `-latest` names, so evolving the content never requires a code change.
- `snapshots/` subfolders hold FROZEN copies. Before a meaningful edit — and
  always before an experiment/benchmark run — copy the latest file into
  `snapshots/` with a date suffix (`name-YYYYMMDD-n.md`). Never edit a
  snapshot.
- Experiments and A/B arms select explicit snapshot versions, not `-latest`
  (researcher pickers show snapshots collapsed under "History"; user-facing
  pickers hide them).
- Provenance floor: every session manifest records the sha256 of the exact
  asset content it loaded, so sessions remain traceable to content even when
  `-latest` has moved on.
- Planned: a `version:` frontmatter field in `-latest` files, bumped on
  meaningful edits (major rework bumps the integer). Snapshots inherit the
  version they froze.
- Release bundles exclude `snapshots/` directories.

### Compatibility policy (pre-release, 2026-07-24)

- The compatibility promise for old sessions' asset slugs starts at the first
  non-alpha release. Until then, alpha builds may drop or rename assets; an
  old session whose recorded slug no longer resolves falls back to the current
  default. Auto-restoring an outdated asset would be a downgrade while every
  change is still an improvement pass.
- User DATA is never subject to this policy: conversations, records, and
  manifests (with their sha256 provenance) are always preserved.
- Fallbacks must be VISIBLE, never silent: the backend emits a resume warning
  ("original role X is not in this build — continuing with Y") that the
  conversation view shows as a notice line.
- From the first real release on: bundle `snapshots/` (or ship a slug
  migration) so recorded slugs keep resolving, and revisit this section.
