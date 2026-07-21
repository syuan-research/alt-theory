---
doc_type: issue-fix-note
issue: 2026-06-22-local-config-runtime-model
status: fixed
severity: P1
root_cause_type: config
tags: [local-mode, config-gui, model-selection]
---

# Local Config Runtime Model Fix Note

## Observed

The local `/config` page could save a provider and set `minimax/minimax-m3` as
active, but new conversation runs still used the previous Pi/default model
(observed as Gemini 3.1 Pro). The `Fetch model list` button also required a
provider to be saved with at least one placeholder model before fetching, which
made first-run setup awkward.

## Root Cause

The config GUI wrote Pi-native files under `PI_CODING_AGENT_DIR`, but
`SessionService` was constructed with `modelProvider`, `modelId`, and
`modelsPath` from env/options only. It never re-resolved the active
provider/model from the GUI-managed Pi `settings.json`, and it did not point
runtime session creation at the GUI-managed `models.json`.

The fetch button reused the saved-provider endpoint, so unsaved form values
could not be used as the fetch source.

Follow-up user testing found a related Pi schema issue: non-built-in custom
providers with `models` must include `apiKey` in `models.json` before Pi loads
their model definitions, even when the real literal key is stored in
`auth.json`. Without that field, runtime failed before the provider request
with `Unknown model: <provider>/<model>`.

A second follow-up showed that one stale invalid provider in `models.json`
poisons the whole Pi registry, even if the active provider is different. The
observed runtime error named stale provider `mmx` while the selected provider
was `mmx-test`.

A third follow-up reached the provider but failed with `404 page not found`.
The saved MiniMax base URL was `https://api.minimaxi.com/anthropic/v1`; Pi's
built-in MiniMax CN models use `https://api.minimaxi.com/anthropic`. For
Anthropic-compatible providers, the Anthropic SDK appends `/v1/messages`, so
storing a base URL that already ends in `/v1` can produce the wrong runtime
path.

## Fix

- Added a runtime config resolver that reads the active GUI/Pi selection and
  returns `modelProvider`, `modelId`, and the corresponding `models.json` path.
- Wired local-mode `SessionService` creation/open/reopen paths to resolve that
  config at runtime instead of using stale constructor defaults.
- Added a draft model-fetch endpoint so the config page can fetch from the
  current form before the provider has been saved.
- Changed the config page fetch button to use current form values directly.
- Added a regression test for resolving the active local config model to
  `models.json`.
- Added a Pi-compatible `apiKey` marker for literal-key custom providers while
  keeping the real key in `auth.json`, plus auto-repair for already-saved
  providers missing that marker.
- Reject saving custom providers with models unless they have an effective key,
  and remove stale invalid custom providers without stored keys before runtime
  model resolution.
- Made runtime `Unknown model` errors include Pi's model-registry load error
  when available.
- Restored page scroll on `/config` and moved API key above model fetch because
  some providers require auth for `/models`.
- Kept saved API keys hidden in the editor, but added explicit text saying a
  key is already saved and the blank field can be left unchanged.
- Normalize Anthropic-compatible runtime base URLs by stripping trailing `/v1`,
  while model-list fetch still tries `/v1/models` when needed.
- Updated Anthropic and MiniMax presets to use runtime base URLs without `/v1`.

## Verification

- `npm run test:backend` passes: 67/67.
- Config page inline script parses with `new Function(...)`.

## Boundary

This fix makes active model selection apply to newly created or reopened
sessions. It does not hot-swap the model inside an already constructed in-memory
Pi `AgentSession`; users should start a new conversation or reload/reopen after
changing the active model.
