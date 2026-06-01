# Agent Assets

This folder contains document-like assets that shape agent behavior and user experience.

Current first-slice layout:

- `runtime/pi-tui/` is the current PI-compatible runtime context. It contains `AGENTS.md` and `.pi/prompts/` so the copied app can preserve existing PI loading behavior.
- `prompts/pi/` is a separate asset copy of current PI prompts for review and future organization.
- `kb/ep-core/` is the current runtime KB copy used for the first v0.3 smoke-test path. It is not yet declared the long-term KB source-of-truth.
- `profiles/default.md` is the current lightweight agent profile. It is closer to a `SOUL.md` than to a simulated user profile.
- `skills/cs-swe-v0-3/` is the active SWE-only CodeStable-derived skill bundle for feature / issue / refactor / `swe-plan` coding work. It keeps its internal workflow/reference files inside the same folder and uses relative internal links.

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
