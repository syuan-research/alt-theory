# Alt Theory

Alt Theory is an experimental agentic workspace for social-science research
and education. It combines a Pi-based session engine, configurable capability
modes, research-oriented agent assets, resumable workspaces, and interfaces for
local and hosted use.

The repository is an alpha-stage research and software project. Interfaces,
configuration, and packaging may still change.

## What the app does today (factual)

- **Understand and Work modes** in one conversation: clarify and compare
  carefully (Understand), or also act on files and tools (Work), with the same
  continuity of context.
- **Local Windows app and browser UI** over a session engine built on the
  [Pi](https://pi.dev) agent harness, with approvals for boundary-crossing
  tools.
- **Providers and models** configured in Settings → Models (API keys and
  supported sign-in flows); per-conversation model and thinking-effort chip;
  explicit default model for new conversations.
- **Materials**: working folders, attach paths, knowledge-base domains, role
  presets, and skills (including Helper, plan-record, web search in Work).
- **Conversation controls**: branch / same-prompt retry with side-by-side
  comparison, BTW side chats, Helper as a fresh-context side conversation,
  subagent agents (agent team) with addressable mail, import of cross-harness
  sessions.
- **User documentation** under `docs/en/` (English) and `docs/zh-Hans/`
  (Simplified Chinese). Helper maps questions via
  `agent-assets/skills/alt-theory-help/references/docs-map.md` and reads
  those trees; docs are not embedded inside the Helper skill.
- **UI languages**: English, 简体中文, 繁體中文（香港）via Settings → General.

## Repository Map

- `alt-theory-app/` — core session engine, web server, and frontend.
- `agent-assets/` — runtime prompts, role presets, knowledge-base material, and
  bundled skills used by Alt Theory.
- `electron/` and `scripts/` — local Windows packaging and development tools.
- `docs/en/`, `docs/zh-Hans/` — user documentation (English / Simplified Chinese).
- `docs/about/` — high-level product and version material.
- `development/architecture/` — current technical architecture.
- `development/features/` and `development/issues/` — retained feature design,
  acceptance, and issue evidence.
- `development/compound/` — retained engineering decisions and research notes;
  its longer-term public curation is still pending.
- `development/releases/` — version-specific testing and packaging material.

## Local Setup

Requirements: a current Node.js release and npm.

```bash
npm ci
npm --prefix alt-theory-app/frontend ci
npm run test:backend
npm run build:frontend-v6
```

Useful development commands:

```bash
npm run dev:web:v6
npm run dev:web:local:v6
```

Local model/provider setup is available through `/config` when running in
local mode. Keep API keys in the supported local environment/config stores;
do not commit credentials.

## Current References

- [v1.0-alpha product specification](docs/about/v1.0-alpha-product-spec.md)
- [version reference](docs/about/version-reference.md)
- [changelog](CHANGELOG.md)
- [session engine architecture](development/architecture/core-session-engine.md)
- [researcher console architecture](development/architecture/researcher-console.md)
- [local Windows bundle architecture](development/architecture/local-windows-bundle.md)

## License

Alt Theory software is available under the MIT License. Original documentation
and agent assets are available under CC BY 4.0. See [LICENSE.md](LICENSE.md) for
path coverage and third-party notices.

## Status

Alt Theory is public in active alpha development. The core v1-alpha product is
usable; cross-harness session import remains a checkpointed feature pending
browser and visual acceptance. Documentation and contribution guidance will
grow with the product.
