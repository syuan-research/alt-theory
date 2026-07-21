# Repository Structure

Status: current public-repository map. The filename is retained for historical
link compatibility; this document describes the present tree.

## Top-Level Roles

| Path | Role |
|---|---|
| `alt-theory-app/` | Core session engine, web server, tests, and frontend source. |
| `agent-assets/` | Runtime-loaded product assets: context, prompts, roles, KB material, and bundled skills. |
| `electron/` | Electron entry points for the local Windows application. |
| `scripts/` | Build, packaging, smoke, and maintenance scripts. |
| `docs/about/` | Existing high-level public product/version material; the broader docs system is intentionally deferred. |
| `development/architecture/` | Current technical architecture. |
| `development/features/` | Implemented feature design and acceptance evidence. |
| `development/issues/` | Retained issue analysis and fix evidence. |
| `development/compound/` | Transitional collection of retained decisions and engineering research. |
| `development/releases/` | Version-specific bundle, testing, and release material. |

## Documentation Boundaries

`docs/` is reserved for material that can become part of a public documentation
site. During the initial public release only `docs/about/` exists; user guides,
concepts, and reference navigation will be designed in a later docs session.

`development/` explains the implementation to contributors and coding agents.
It does not replace user documentation and is not a location for private
planning records.

Root `AGENTS.md` contains concise machine-facing repository instructions.
Runtime-facing agent material remains under `agent-assets/`.

## Runtime Boundaries

- The backend loads curated runtime assets from `agent-assets/`.
- Local/session data belongs outside the tracked repository and is resolved by
  the application data-directory layer.
- The React frontend lives under `alt-theory-app/frontend/`; its production
  output is served from `alt-theory-app/web-server/public-v6/`.
- The older `alt-theory-app/web-server/public/` surface remains until its hosted
  and local consumers are deliberately retired.

## Public Repository Rule

Track source, tests, current architecture, curated runtime assets, and durable
public engineering evidence. Do not track credentials, participant material,
raw transcripts, local runtime/session data, private plans, agent handoffs, or
machine-specific evidence.
