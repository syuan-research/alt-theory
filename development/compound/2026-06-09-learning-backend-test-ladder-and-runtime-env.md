---
doc_type: learning
type: testing
date: 2026-06-09
slug: backend-test-ladder-and-runtime-env
topic: How should backend smoke, live provider setup, and browser UAT be staged?
scope: Alt Theory backend agent harness and researcher console
keywords: [backend, testing, smoke, playwright, uat, env, model-config, kb]
status: active
confidence: medium
---

# Backend Test Ladder And Runtime Env

## Lesson

Treat backend verification as a ladder, not one oversized test round.

The first rungs are deterministic or near-deterministic backend checks. Browser
UAT sits after those checks, because it verifies the researcher-facing path
rather than the core server contracts. Live provider prompts sit behind explicit
model/key setup and should not be hidden inside ordinary backend tests.

## Practical Ladder

1. `npm run test:backend`: non-live unit/integration coverage.
2. `npm run smoke:core`: Pi/session initialization and asset assembly without a
   live provider turn.
3. Optional live smokes: `npm run smoke:backend` and `npm run smoke:resume`
   only after explicit provider/model/key setup.
4. Browser/UAT: headed Playwright or CDP pass against `npm run dev:web`,
   capturing screenshots, DOM state, console/WebSocket evidence, and one or
   more user-level prompts when appropriate.

Browser/UAT can be delegated to a local non-flagship agent, such as an OpenCode
session, or run by the current agent. This is an execution choice. It does not
change the acceptance standard: record evidence, then write back the durable
result to the feature acceptance report or plan-record.

## Env Vars That Must Be Obvious

For the web server:

- `ALT_THEORY_DATA_DIR`: local runtime/session root.
- `ALT_THEORY_MODELS_PATH`: local ignored `models.json` path.
- `ALT_THEORY_MODEL_PROVIDER`: provider slug in `models.json`.
- `ALT_THEORY_MODEL_ID`: model id in that provider entry.
- `ALT_THEORY_MODEL_API_KEY`: runtime plaintext key for the selected provider.
- `ALT_THEORY_KB_DIR`: optional KB root override. This must point to a root
  containing domain directories.

For model config files:

- `agent-assets/models.example.json` is the tracked template.
- Local `models.json` is ignored by Git.
- In `models.json`, `apiKey` is an environment-variable name, not the secret.

For legacy smoke scripts:

- `smoke-backend.ts` and `smoke-resume.ts` currently read `MIMO_API_KEY` for
  the historical MiMo probe path. Do not infer that `MIMO_API_KEY` is the
  general web-server convention.

## OneDrive Rule

The OneDrive/npm rule is conditional: if a worktree is inside a
OneDrive-synced directory, do not run npm in a way that creates a real synced
`node_modules/`. If the active worktree is outside OneDrive, such as
`%LLM_THEO_DEV_ROOT%`, the OneDrive-specific restriction is not the
reason to avoid installs. Dependency hygiene may still be a good reason.

## Evidence

- `project/workstreams/0-backend-agent-harness/swe/features/2026-06-08-researcher-console-session-browser/researcher-console-session-browser-acceptance.md`
- `project/workstreams/0-backend-agent-harness/notes-and-status/2026-06-09-console-browser-acceptance-via-cdp-plan-record-v1.md`
- `project/workstreams/0-backend-agent-harness/README.md`
- `alt-theory-app/core/agent-assets.ts`
- `alt-theory-app/web-server/server.ts`

## Related Documents

- `project/architecture/core-session-engine.md`
- `project/architecture/researcher-console.md`
- `project/foundation/local-development-rules.md`
