# Alt Theory

Alt Theory is an experimental agentic workspace for social-science research
and education. It combines a Pi-based session engine, configurable capability
modes, research-oriented agent assets, resumable workspaces, and interfaces for
local and hosted use.

The repository is an alpha-stage research and software project. Interfaces,
configuration, and packaging may still change.

## Repository Map

- `alt-theory-app/` — core session engine, web server, and frontend.
- `agent-assets/` — runtime prompts, role presets, knowledge-base material, and
  bundled skills used by Alt Theory.
- `electron/` and `scripts/` — local Windows packaging and development tools.
- `docs/about/` — current high-level product and version material. Broader
  public documentation will be designed separately.
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

The repository is being prepared for its first public release. Public
documentation, contribution guidance, and higher-level foundation/roadmap
material will be expanded after the repository boundary is stable.
