# Agent Assets

This folder contains document-like assets that shape agent behavior and user experience.

Current first-slice layout:

- `runtime/pi-tui/` is the current PI-compatible runtime context. It contains `AGENTS.md` and `.pi/prompts/` so the copied app can preserve existing PI loading behavior.
- `prompts/pi/` is a separate asset copy of current PI prompts for review and future organization.
- `kb/ep-core/` is the current runtime KB copy used for the first v0.3 smoke-test path. It is not yet declared the long-term KB source-of-truth.

Future topics, not solved in this slice:

- `soul.md` / `user.md` / `memory.md` alignment with OpenClaw and Hermes patterns.
- Asset authoring versus runtime/test/release bundles.
- Source-of-truth rules for KB and prompt versions.
- Session-level agent instructions.
