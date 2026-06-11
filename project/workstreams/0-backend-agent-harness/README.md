# Backend Agent Harness

Status: active backend workstream for the Alt Theory v0.3 dev tree.

This workstream owns the current backend session engine, runtime asset loading,
session persistence/resume, WebSocket protocol, and backend-facing researcher
console support. Use this README as the first local map before opening older
plan-records.

## Current Entry Points

- `package.json`: scripts for backend dev/test/smoke.
- `alt-theory-app/core/data-dir.ts`: resolves the Alt Theory data directory and
  creates `sessions/{session-id}/workspace`, `history`, and `records`.
- `alt-theory-app/core/agent-assets.ts`: resolves runtime asset paths and env
  overrides.
- `alt-theory-app/core/alt-theory-core.ts`: creates or opens Pi-backed Alt
  Theory sessions and writes assembly/resume manifests.
- `alt-theory-app/web-server/server.ts`: Express REST routes, WebSocket session
  lifecycle, `open_session`, model/env wiring, and static console hosting.
- `alt-theory-app/web-server/session-store.ts`: session catalog, detail parsing,
  Pi JSONL discovery, and bounded transcript preview.
- `alt-theory-app/web-server/asset-registry.ts`: role-preset and KB-domain slug
  discovery.
- `alt-theory-app/web-server/public/`: temporary researcher console seed.
- `alt-theory-app/web-server/backend-server.test.ts`: non-live backend tests.
- `alt-theory-app/web-server/smoke-backend.ts` and
  `alt-theory-app/core/smoke-resume.ts`: live provider smoke scripts.

Current architecture maps:

- `project/architecture/core-session-engine.md`
- `project/architecture/researcher-console.md`
- `project/architecture/repo-structure-v0.3.md`

## Runtime Assets

Tracked runtime-facing assets live under `agent-assets/`.

Use these locations for new curated assets:

- App context: `agent-assets/ALTTHEORY.md`.
- Soul/personality seed: `agent-assets/soul.md`.
- Role presets: `agent-assets/role-presets/{slug}.md`.
- KB domains: `agent-assets/kb/{domain-slug}/`.
- Pi adapter prompt templates: `agent-assets/prompts/pi/{template}.md`.

Slug guidance:

- Prefer lowercase kebab-case for new slugs.
- A role preset slug is the markdown filename without `.md`.
- A KB domain slug is the directory name under `agent-assets/kb/`.
- New KB files should be ordinary markdown files inside a domain directory.
  Current files include some historical mixed naming; do not copy that as a
  requirement for new material.

Do not recreate old duplicate runtime copies such as
`alt-theory-app/web-server/assets/kb/` or `agent-assets/runtime/pi-tui/`.

## Local Model Config And Secrets

The tracked template is `agent-assets/models.example.json`. The local runnable
config should be `models.json` or another local path ignored by Git.

Important rules:

- `models.json` is ignored and should not be committed.
- The `apiKey` field inside `models.json` is an environment-variable name, not
  the plaintext key.
- The web server expects explicit model selection through:
  `ALT_THEORY_MODELS_PATH`, `ALT_THEORY_MODEL_PROVIDER`,
  `ALT_THEORY_MODEL_ID`, and `ALT_THEORY_MODEL_API_KEY`.
- Generic `ANTHROPIC_*` variables alone do not select the intended Alt Theory
  provider/model. The server warns when `ANTHROPIC_*` is present but explicit
  `ALT_THEORY_MODEL_*` selection is incomplete.
- The older live smoke scripts currently read `MIMO_API_KEY` directly for the
  MiMo probe path. Treat that as smoke-script-specific, not the general web
  server convention.

Example PowerShell shape:

```powershell
$env:ALT_THEORY_DATA_DIR = 'D:\tmp\alt-theory-dev'
$env:ALT_THEORY_MODELS_PATH = '%LLM_THEO_DEV_ROOT%\models.json'
$env:ALT_THEORY_MODEL_PROVIDER = '<provider-slug-in-models-json>'
$env:ALT_THEORY_MODEL_ID = '<model-id-in-models-json>'
$env:ALT_THEORY_MODEL_API_KEY = $env:MINIMAX_CN_API_KEY
npm run dev:web
```

For a temporary KB root override, set `ALT_THEORY_KB_DIR` before launching the
server. The value must be the KB root containing domain directories, not a
single markdown file.

## Test Ladder

Use this order unless a specific feature design says otherwise:

1. `npm run test:backend`: non-live unit/integration tests.
2. `npm run smoke:core`: real Pi initialization without an external model turn.
3. Optional live smokes: `npm run smoke:backend` and `npm run smoke:resume`
   only when provider/model/key setup is explicit and the user approves live
   calls.
4. Browser/UAT pass after backend smoke: headed Playwright or CDP automation
   against `npm run dev:web`, with screenshots/DOM/log evidence.

Browser/UAT is not a replacement for backend tests. It is a later acceptance
rung for researcher-console behavior: click list/detail/resume, inspect
runtime metadata, then optionally send one or more live prompts. This rung can
be run by the current agent or delegated to another local agent such as an
OpenCode session when that is more convenient. Choose by context; the important
part is the evidence and acceptance writeback, not which agent drives it.

Workstream-local browser evidence belongs under ignored paths such as:

```text
project/workstreams/0-backend-agent-harness/output/YYYYMMDD-{slug}-cdp/
```

Treat that path as run staging. If raw evidence should be preserved for later
private recovery, move or copy the useful subset into:

```text
_archives/private-evidence/0-backend-agent-harness/YYYYMMDD-{slug}/
```

Write durable conclusions back to the feature acceptance report and, when the
lesson should be reused across features, to `project/compound/`.

## Current Session Browser State

The `session-list-resume-open` SWE plan is completed. The current accepted
state includes:

- REST session list/detail.
- WebSocket `open_session`.
- Researcher-console session list, detail/preview, and Resume/Open control.
- Headed Chromium click-through evidence from 2026-06-09.
- A Stage 1.1 user-layer UAT probe that sent live prompts on a resumed session.

Known remaining work is product/UI scope, not backend plumbing: tags,
annotations, comparison, export, provider/auth UI, clearer prompt-injection
visibility, and more repeatable long-turn browser UAT.
