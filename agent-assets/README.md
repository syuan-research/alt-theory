# Agent Assets

This folder contains document-like assets that shape agent behavior and user experience.

Current first-slice layout:

- `runtime/pi-tui/` is the current PI-compatible runtime context. It contains `AGENTS.md` and `.pi/prompts/` so the copied app can preserve existing PI loading behavior.
- `prompts/pi/` is a separate asset copy of current PI prompts for review and future organization.
- `kb/ep-core/` is the current runtime KB copy used for the first v0.3 smoke-test path. It is not yet declared the long-term KB source-of-truth.
- `profiles/default.md` is the current lightweight agent profile. It is closer to a `SOUL.md` than to a simulated user profile.
- `skills/cs-modified-v0-1/` is the current project-scoped lightweight CodeStable adaptation. It is not a full `.codestable/` install.
- `skills/cs-swe-v0-2/` and sibling `cs-swe-*` skills are the SWE-only CodeStable-derived workflow set for feature / issue / refactor coding work.

Future topics, not solved in this slice:

- `soul.md` / `user.md` / `memory.md` alignment with OpenClaw and Hermes patterns.
- Asset authoring versus runtime/test/release bundles.
- Source-of-truth rules for KB and prompt versions.
- Session-level agent instructions.
- Whether project-scoped skills should later be installed globally, vendored as plugin assets, or kept as readable project rules only.
