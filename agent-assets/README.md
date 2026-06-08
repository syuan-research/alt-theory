# Agent Assets

This folder contains document-like assets that shape agent behavior and user experience.

Current first-slice layout:

- `ALTTHEORY.md` is the application/session context loaded by Alt Theory runtime sessions.
- `soul.md` is the current lightweight personality / stance seed.
- `role-presets/default.md` is the default role/style/behavior preset. It replaces the old `profiles/default.md` naming because these files describe the agent role, not the user.
- `prompts/pi/` is the current Pi adapter prompt-template area for review and future organization.
- `kb/ep-core/` is the current runtime KB copy used for the first v0.3 smoke-test path. It is not yet declared the long-term KB source-of-truth.
- `models.example.json` is an uncredentialed example for custom provider/model configuration. Runtime keys stay in environment/config, not Git.
- `skills/cs-swe-v0-4/` is the active SWE-only CodeStable-derived skill bundle for feature / issue / refactor / `swe-plan` coding work. It keeps its internal workflow/reference files inside the same folder and uses relative internal links.

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

Removed from active skill surface:

- `cs-modified-v0-1` was an incorrect intermediate artifact from the mistaken assumption that CodeStable should be used only as a high-level organizing inspiration. Do not treat it as a skill. Historical context belongs in plan-records, not in `agent-assets/skills/`.
- `cs-swe-v0-2/` and its sibling `cs-swe-*` v0.2 folders are historical action-for-reflection evidence, not the current runtime rule.

Local ignored archive convention:

- `_archives/agent-assets/` may hold directly openable local snapshots for asset backup/comparison. It is not the active asset surface.

Future topics, not solved in this slice:

- `soul.md` / `user.md` / `memory.md` alignment with OpenClaw and Hermes patterns.
- Asset authoring versus runtime/test/release bundles.
- Source-of-truth rules for KB and prompt versions.
- Session-level agent instructions.
- Whether project-scoped skills should later be installed globally, vendored as plugin assets, or kept as readable project rules only.
