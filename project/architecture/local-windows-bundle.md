# Local Windows Bundle

---
status: current
scope: v0.5.x local Windows folder bundle and local model configuration
last_updated: 2026-06-28
---

## Purpose

This document records the current local Windows bundle architecture for Alt
Theory v0.5.x. It is intentionally separate from
`core-session-engine.md`: bundle packaging, Electron startup, static frontend
selection, and local model setup are delivery concerns, not core session engine
mechanics.

The current goal is a pragmatic local folder app usable by a non-technical
operator. Installer polish, portable Candidate B repair, and broad packaging
research are out of scope unless explicitly reopened.

## Current Target

- Source tree: `dev/worktrees/llm-theo-v0.3-dev`
- App version line: updated v0.5.5 integration code
- Bundle artifact: `dist/win-unpacked/`
- User launch target: `dist/win-unpacked/AltTheory.exe`
- Build command: `npm run build:electron`
- Local dev command for the same frontend/config surface:
  `npm run dev:web:local:v6`

The older `llm-theo-v0.5-bundle` branch and zcode bundle work are feasibility
and historical references. They are not the current implementation source of
truth for this pragmatic bundle path.

## Runtime Shape

The Electron app is a local shell around the Alt Theory web server:

1. `electron/main.cjs` starts the bundled backend.
2. The backend serves HTTP on `127.0.0.1:${PORT}`.
3. Electron opens that local URL.
4. The frontend talks to the same local backend over REST and WebSocket.

For the bundle, Electron sets:

```text
ALT_THEORY_MODE=local
ALT_THEORY_PUBLIC_DIR=alt-theory-app/web-server/public-v6
PORT=<selected local port>
```

`ALT_THEORY_PUBLIC_DIR` is the important bundle-specific switch. It makes the
backend serve the React `public-v6` frontend instead of the older hosted pilot
static frontend. This is why the local bundle can use the newer local model
setup UI without changing the hosted VPS default frontend.

## Frontend Boundary

The local bundle currently uses the v0.6-derived React frontend. This is an
accepted pragmatic choice for v0.5.x bundle work because the user-friendly
local `/config` page and local-mode flow are already built there.

This does not mean the VPS pilot is being moved to unfinished v0.6 product
scope. Hosted VPS deploys use default server configuration unless deployment
explicitly sets `ALT_THEORY_PUBLIC_DIR=.../public-v6`.

Do not delete `alt-theory-app/web-server/public/config.html` as a local bundle
cleanup. The local bundle currently uses `public-v6`, but hosted/VPS and
fallback paths may still depend on the older `public/` surface.

Current local UI notes:

- A `test UI` label is shown near the Alt Theory title to signal that the local
  bundle UI is usable but still being polished.
- Small UX edits should be checked with
  `npm --prefix alt-theory-app/frontend run build`.
- Do not rebuild Electron after every checkbox/text/layout change. Rebuild the
  full bundle only when a fresh artifact is needed.

## Local Model Config

Local model setup belongs here, not in the core session architecture, except
where it affects runtime provider/model resolution.

The `/config` page is a Pi-native provider/model setup surface:

- writes Pi-compatible `models.json`, `auth.json`, and `settings.json`;
- stores local state under the configured Pi/Alt Theory local config directory;
- resolves the active provider/model at session materialization time;
- passes the resolved `models.json` path into Pi's `ModelRegistry`;
- refuses to materialize a local prompt when the active provider is missing,
  keyless, or invalid.

The design intent is to align with Pi's model registry instead of inventing a
separate Alt Theory provider system.

Keyless provider drafts may be saved because the GUI needs to let users fill
configuration in stages. They must not be set active or treated as
runtime-usable.

Model presets should not be updated from memory. Fetch or verify current
provider information before changing preset model IDs, especially for MiMo and
Qwen.

## Session Config Boundary

Session runtime configuration remains documented in `core-session-engine.md`.
That includes:

- role preset selection;
- soul selection;
- project assignment;
- custom instruction selection;
- KB domain selection;
- `effectiveConfig`;
- config events;
- resume behavior.

The local bundle merely exposes controls for some of those settings. It should
not redefine their persistence semantics.

Current KB UX in the local/simple UI:

- checked `Use EP knowledge base` maps to `ep-core`;
- unchecked maps to `kb=none`;
- `kb=none` disables built-in `agent-assets/kb/` retrieval but does not disable
  workspace file access;
- resume should preserve the effective session config, including `kb=none`.

## Build And Verification

Typical efficient loop during UX polish:

```powershell
npm --prefix alt-theory-app/frontend run build
```

Fresh bundle artifact:

```powershell
npm run build:electron
```

Known behavior: `compile-bundle` may print existing TypeScript diagnostics, but
continues when `dist-bundle/alt-theory-app/web-server/server.js` is produced.
Treat that as current build-script behavior, not as evidence that every
diagnostic was newly introduced by bundle work.

Backend regression command:

```powershell
npm run test:backend
```

## Explicit Non-Goals

- Candidate B portable repair
- NSIS/MSI installer polish
- code signing
- auto-update
- moving VPS hosted deploys to the React test UI by default
- replacing Pi's model registry with a custom Alt Theory registry
- broad v0.6 product strategy

## User And Agent Guidance

Friend-test user guides:

- `project/workstreams/1-bundle-verification/user-guide-v0-5x-local-bundle.zh.md`
- `project/workstreams/1-bundle-verification/user-guide-v0-5x-local-bundle.en.md`

Future-agent bundle guidance:

- `project/workstreams/1-bundle-verification/agent-guidance-v0-5x-bundle.md`

## Related Records

- `project/workstreams/1-bundle-verification/notes-and-status/STATUS.md`
- `project/workstreams/0-frontend-and-research-console/notes-and-status/STATUS.md`
- `project/compound/research-provider-model-ux/2026-06-26-decision-v0-5-local-config-and-bundle-path.md`
- `project/architecture/core-session-engine.md`


