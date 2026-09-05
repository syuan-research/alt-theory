---
doc_type: architecture
slug: provider-model-configuration-and-selection
scope: Provider configuration, model discovery, capability metadata, defaults, per-session model choice, and runtime model resolution
summary: Current truth for how Alt Theory stores, discovers, selects, and applies providers and models
status: current
last_reviewed: 2026-09-03
tags: [core, backend, frontend, models, providers, settings]
depends_on: [core-session-engine, information-architecture]
implements: []
---

# Architecture: Provider, Model Configuration, and Selection

This document records the provider/model mechanism that currently exists. It
does not claim that the implementation is a cleanly isolated module: durable
configuration and discovery live in the web server, session application lives
in `SessionService` and the core runtime boundary, and the user-facing
selection flow lives in the frontend.

The product-surface rules and user mental model are maintained in
[`information-architecture.md`](information-architecture.md). The broader
session lifecycle and turn-continuity contract remains in
[`session-lifecycle-and-turn-continuity.md`](session-lifecycle-and-turn-continuity.md).

## 1. Configuration sources and authority

Alt Theory uses Pi's native configuration store rather than a parallel model
registry. The local agent directory is resolved through Pi's `getAgentDir()`;
the product's local-mode setup may select it with `PI_CODING_AGENT_DIR`.

The relevant files are:

- `models.json` — provider blocks, endpoint/API information, model rows, and
  optional environment-variable key markers. A model row may contain an id,
  display name, reasoning flag, capability fields, compatibility fields,
  costs, and an optional user-corrected `thinkingLevels` list.
- `auth.json` — Pi-native stored API-key or OAuth credentials. The Alt Theory
  read view exposes credential state, not key plaintext. Literal API keys are
  written through Pi's `ModelRuntime`; environment-variable names remain in
  the provider block for Pi to resolve at runtime.
- `settings.json` — Pi's active/default provider and model, written and read
  through `SettingsManager` as `defaultProvider` and `defaultModel`.

`web-server/config-store.ts` is the management layer over those files. Its
write paths validate provider/API names, reject Pi's `!command` key form,
normalize provider-specific base URLs, write JSON atomically, and re-read the
normal view after saving. It also repairs some stale auth markers while
reading. See `config-store.ts:1-155`, `:1174-1307`, and `:1352-1435`.

The saved model list is authoritative for the configured provider. Fetching a
provider list returns candidates to the settings UI; it does not silently
replace the saved list. Pi built-in model metadata is bootstrap/fallback
metadata for built-in providers, not permission to silently mutate a user's
saved model list. This is the configuration contract described in
[`information-architecture.md`](information-architecture.md), §Model and
provider configuration.

## 2. Provider and model views

`listProviders(agentDir)` builds the safe settings view from `models.json`,
Pi's built-in provider/model catalogue, credential state, and
`settings.json`'s active pointer (`config-store.ts:362-420`). A configured
provider with a non-empty saved model list uses that list. GitHub Copilot
intersects those saved ids with the credential's `availableModelIds` at read
time; the saved file is not rewritten. A built-in provider without a saved
block can be represented from Pi's built-in model list when it is otherwise
discoverable.

The view combines several different kinds of fact; they must not be treated as
one source:

- **Saved configuration:** provider id, API adapter, base URL, saved model
  rows, and key marker.
- **Credential state:** stored API key, OAuth credential, configured
  environment variable, or missing credential. OAuth status is read from
  Pi's `auth.json` metadata.
- **Capability metadata:** model fields saved by the user, returned by a
  provider endpoint, supplied by the local models.dev cache, or supplied by
  Pi's built-in model definitions.
- **Active pointer:** the deployment/global default from `settings.json`.

The frontend consumes this view through `/api/config/providers` and edits it
through the corresponding config routes. `ModelConfigPage.tsx` keeps the
settings editor's draft separate from saved provider state, merges fetched
model rows into the draft, and explicitly calls the active-model route when
the user chooses a default (`frontend/src/pages/ModelConfigPage.tsx:324-820`,
`:1260-1360`).

## 3. Model discovery and capability metadata

### Saved and built-in metadata

For each visible model, `availableThinkingLevels` is resolved in this order:

1. the model's user-corrected `thinkingLevels` in `models.json`;
2. a matching `reasoning_options` entry in the local models.dev cache;
3. Pi's built-in `thinkingLevelMap` for a built-in model.

The resolved `availableThinkingLevels` is a view field; it is not persisted
back into `models.json`. A saved `thinkingLevels` correction is normalized to
the supported vocabulary (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`,
`max`). A catalog entry with no effort values can therefore leave a model with
no selectable effort levels even if other metadata says `reasoning: true`.
`reasoning: true` alone is not a universal thinking-level contract.

On an explicit provider write (`upsertProvider`), a saved row that omits
`reasoning` or `thinkingLevelMap` is filled from that same local models.dev
cache (match as the picker: provider name, then base URL, then model id). A
user-supplied `thinkingLevels`, `thinkingLevelMap`, or `reasoning` value is
kept. User-supplied `thinkingLevels` also produce a `thinkingLevelMap` so
Pi's runtime reads the same levels. A cache miss writes the row as supplied —
no network, no error, and no migration of already-saved bare rows until the
next edit/save.

The thinking level a session runs at is decided in one place,
`resolveThinkingLevel()` (`web-server/thinking-level.ts`). It takes the
model's supported levels and the user's explicit choice, if any, and returns
`{level, source, chosen}` with `source` one of `user`, `model-default`, or
`clamped`. With no choice it picks the lower positional midpoint of the
non-`off` levels, or `medium` when no levels are known — a default for opening
or applying a model, not a persistent app-wide preference. A chosen level the
model cannot run is clamped by Pi's own rule (nearest higher supported level,
else nearest lower) and reported as `clamped` with the choice kept; it is
never silently replaced. `thinkingLevelsForModel()` (`config-store.ts`) supplies
the registry's level list for the draft path; a live session uses Pi's
`getSupportedThinkingLevels(model)` (`thinking-level.test.ts` pins parity with
pi-ai's clamp).

### Provider fetch

`fetchProviderModels()` reads a saved provider definition and fetches the
provider's model endpoint. A draft can be fetched before it is saved through
`fetchProviderModelsFromDraftResult()` (`config-store.ts:618-723`). The
endpoint response is normalized from the common array, `{data: [...]}`, or
`{models: [...]}` shapes; ids, names, input modalities, context/output limits,
reasoning options, and thinking-level maps are retained when recognizable
(`config-store.ts:725-856`, `:988-1165`).

The endpoint and authentication details depend on the provider/API definition:

- ordinary providers use a normalized `/models` URL, with an additional
  `/v1/models` attempt for Anthropic-compatible endpoints when needed;
- the OpenAI Codex OAuth route uses its Codex model endpoint and may send the
  account id extracted from the credential token;
- OAuth-backed xAI and Codex discovery uses the provider's Pi/built-in route;
- OpenCode Go's shared endpoint is split into OpenAI- and
  Anthropic-compatible views using saved classification, the local catalogue,
  and bundled metadata. A returned model that cannot be classified is retained
  and reported as unclassified rather than treated as absent.

The implementation retries a failed request once, bounds each request, and
reports endpoint/JSON/model-list failures as configuration errors. Provider
fetch is discovery; saving the resulting rows is a separate user action.

## 4. Defaults and usability

`readActive()` reads the configured default through Pi's `SettingsManager`.
`usableActive()` verifies that the pointed-to provider has a usable credential,
at least one model, and the pointed-to model id. If the pointer is stale, it
repairs it to the first usable saved/built-in model; if no usable provider
exists, it clears the default pointer (`config-store.ts:330-351`,
`:1308-1334`). A default is a convenience, not the only way to choose a
model.

`getRuntimeModelConfig()` returns the current usable provider/model plus the
Pi `models.json` and `auth.json` paths. `getConfigStatus()` exposes whether any
provider is usable and whether the active pointer is usable. An expired OAuth
credential is checked through Pi's runtime auth resolver by
`getVerifiedConfigStatus()`; a timeout or refresh failure marks the active
configuration unusable without deleting the provider (`config-store.ts:856-987`).

Before a local prompt can run, the backend requires a usable provider/model
configuration. `createAltTheorySession()` creates a Pi `ModelRuntime` from the
configured paths, resolves the requested provider/model, and refuses an unknown
or incomplete explicit selection. When no explicit model is supplied, the core
installs an inert “No model selected” placeholder; the application blocks
sending until a usable model is selected
(`core/alt-theory-core.ts:336-366`, `:700-755`).

## 5. From configuration to runtime state

The transition is distributed across three boundaries:

```text
models.json + auth.json + settings.json
             │
             ▼
web-server/config-store.ts
  safe provider view / active runtime config / capability view
             │
             ▼
SessionService.modelArgsFor()
  deployment default or persisted session override
             │
             ▼
createAltTheorySession()
  Pi ModelRuntime + resolved Model
             │
             ▼
SessionService.applyThinking()
  resolver answer against the live model → Pi setThinkingLevel
             │
             ▼
live Pi session state, assembly manifest, snapshot.thinking
```

`SessionService.resolveRuntimeModelConfig()` obtains the deployment/global
configuration through the configured resolver. When the interim model
fallback path is enabled, `resolveEffectiveRuntimeModelConfig()` may select the
first usable model in the configured same-provider fallback chain before a
session is opened (`session-service.ts:407-440`). The chain is operational
configuration, not part of the provider catalogue or the user model list.

`modelArgsFor()` applies a persisted session override over that deployment
configuration. It carries the override's provider/model id and only an
explicit thinking choice (the override's, else the deployment config's).
`createAltTheorySession()` resolves the model through the `ModelRuntime`
created with the current `models.json` and `auth.json` paths; once the managed
session exists, `applyThinking()` resolves the choice against that model's
supported levels, sets it on Pi, and records the answer in `managed.thinking`,
which the session snapshot exposes as `thinking`. Pi's
`thinking_level_changed` is subscribed: a level Pi moves on its own is
reported as `clamped`. The draft (pre-session) path resolves the same way
from the registry's levels, so the chip renders the resolver's answer in both
states and computes no level itself.

The resulting model/provider are live runtime state. The assembly manifest
records the effective provider/model for inspection, while the v0.4 session
header preserves the optional `modelOverride` that determines later open/resume
behavior. The manifest is evidence of what was applied; it is not the global
configuration source.

## 6. Per-session model selection

A materialized session may persist:

```json
{
  "modelOverride": {
    "provider": "provider-id",
    "modelId": "model-id",
    "thinkingLevel": "high"
  }
}
```

The override is stored in that session's `records/session.json`. It takes
precedence over the deployment/global default on creation and open/resume. If
its thinking level is omitted, the model-specific initial-level resolver is
used. A valid user override does not require the global default to be valid.

`set_session_model` calls `SessionService.setSessionModel()`. The choice is
accepted whether or not a turn is running: while idle it applies now; during a
run it is deferred through the session's run state and applied when the turn
ends or is stopped, with the pending value in the snapshot (see the session
lifecycle document). The applier, `applyModel()`, persists or clears the
header field and, for a resolvable choice, switches the live Pi session
through `switchLiveModel()` — the one path shared with both fallback chains:
thinking resolved against the target model, Pi `setModel`, manifest and
header updated. A choice absent from the current runtime registry is persisted
and reported as applying on the next open; the running model keeps its level,
re-resolved so a user choice is never replaced. Clearing the override
symmetrically returns the session to the effective deployment default when
that default resolves. Changes append a `model_override_changed` event.
Fork/related-session creation passes the parent's override when the child is
created; the child then has its own session header and runtime state. A
`thinkingLevel` in the override means the user chose it; its absence means the
resolver's model default applies.

If an override's model is no longer in `models.json` when a conversation is
reopened, the open path catches Pi's unknown-model error, opens with the
deployment default, and records a visible resume warning. The stale override
remains in the header so a later reopen can restore it if the model returns
(`session-service.ts:3228-3272`). This is current recovery behavior, not a
claim that the manifest is authoritative for future opens.

## 7. Runtime model fallback

There are two distinct fallback mechanisms at this boundary:

1. **Deployment interim fallback** — an optional
   `ALT_THEORY_MODEL_FALLBACK_PATH` JSON chain can select a same-provider model
   before opening a session. On a matching run error, the service can
   exclude the failed model, switch the live Pi session to the next usable
   chain entry through `switchLiveModel()` (which keeps the user's thinking
   choice, re-resolved, and writes the header override so the chip shows the
   model in use), append `model_fallback`, and continue the turn
   (`core/model-fallback.ts`, `session-service.ts` `tryModelFallback`). Rules
   match on the failure envelope's `kind` from `core/failure.ts` (the default
   table fails on `auth`); `anyPattern` text rules remain for
   deployment-specific wording.
2. **Subagent preset fallback** — a child-session initial-spawn chain is
   resolved against the parent's live `ModelRuntime` and is governed by the
   agent-team mechanism. Its preset semantics belong with agent behavior and
   session lifecycle; this document only records that it shares the runtime
   model registry and is not a provider discovery source.

The deployment fallback chain is operational pilot configuration: it has no
normal settings editor, is same-provider only, and currently has no dedicated
model-switch notification beyond the runtime notice. It should not be confused
with the user's saved provider model list or with a per-session override.

## 8. Interfaces and current coupling

The effective mechanism crosses these interfaces:

- `web-server/config-store.ts` — native-file persistence, provider views,
  capability enrichment, fetch/normalization, active-pointer repair, and
  connection probes;
- `web-server/server.ts` — HTTP routes exposing the config-store operations;
- `frontend/src/pages/ModelConfigPage.tsx` and model-chip components — saved
  provider editing, default selection, capability display, and conversation
  choice;
- `web-server/session-service.ts` — deployment resolution, session override
  precedence, live model switching, resume recovery, and fallback switching;
- `web-server/thinking-level.ts` — the thinking-level resolver (midpoint
  default, Pi's clamp rule, provenance);
- `web-server/run-state.ts` — accepts or defers a model switch during a run;
- `core/failure.ts` — the failure envelope the fallback rules match on;
- `core/alt-theory-core.ts` — Pi `ModelRuntime` creation and concrete model
  resolution;
- Pi's `ModelRuntime`/`SettingsManager` — credential handling, provider/model
  registry construction, active settings, and SDK-specific runtime behavior.

Consequently, a provider/model change can affect settings views, draft
selectors, session materialization, existing-session reopen, live model
switching, and fallback behavior through different paths. This document maps
those seams; it does not claim one shared in-memory registry or one lifecycle
for every path.

## 9. Boundary clarity

This is a high-level module in the Architecture map because provider/model
configuration is a coherent product mechanism with identifiable persisted
state, capability metadata, selection rules, and runtime interfaces. Its
implementation boundary is currently uneven: the durable store and discovery
logic are centralized in `config-store.ts`, but runtime selection and session
state are distributed between `SessionService`, the core runtime wrapper, the
frontend, and Pi.

The module therefore owns the facts and interfaces above, not every occurrence
of a provider/model string in the repository. Agent-team preset chains,
conversation lineage, and general run continuity remain in their owning
Architecture documents even when they resolve through the same Pi model
runtime.

## 10. Verification anchors

Focused tests that pin the current behavior include:

- `web-server/backend-server.integration.ts:152-235` — thinking-level
  midpoint selection and model-list metadata normalization;
- `web-server/backend-server.integration.ts:358-380` — OpenCode Go provider
  family classification and retention of endpoint-returned models;
- `web-server/backend-server.integration.ts:491-622` — built-in OAuth
  resolution, exact saved model-list preservation, and OAuth fetch behavior;
- `web-server/backend-server.integration.ts:2810-2860` — draft/session model
  override WebSocket state;
- `web-server/config-store.test.ts:1-120` — native config persistence and
  response-envelope normalization;
- `web-server/config-store.test.ts` — provider write fills Pi-readable
  `reasoning` / `thinkingLevelMap` from the local catalog; a miss stays
  bare; user-explicit `thinkingLevels` survive;
- `web-server/session-service.test.ts:200-245` — persisted session model
  override behavior;
- `web-server/thinking-level.test.ts` and the v1.5 cases at the end of
  `session-service.test.ts` — user level kept or reported clamped, model
  default, deferred switch applied at settle.

The repository-wide backend command remains the authoritative broader check:

```text
npm run test:backend
```
