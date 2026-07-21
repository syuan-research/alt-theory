---
doc_type: explore
type: spike
date: 2026-06-21
slug: provider-model-ux-research
topic: Provider/model management UX research for Alt Theory bundle — borrow from cc-switch/opencode, prefer Pi-native, avoid reinventing
scope: External research for Stage 5 of the Windows Bundle and Config GUI plan-record. Three targets: cc-switch (UI patterns), opencode via models.dev (model catalog data source), pi-coding-agent (native model registry and /v1/models-style fetch). Q11 (specific model metadata for qwen 3.7 max / mimo v2.5 pro) was dropped per user — wrong question for a usable GUI.
status: active
confidence: high
related_plan_record: project/workstreams/0-frontend-and-research-console/notes-and-status/2026-06-17-windows-bundle-and-config-gui-plan-record-v1.md
related_handoff: project/workstreams/0-frontend-and-research-console/notes-and-status/2026-06-19-handoff-stage5-provider-model-ux-research.md
keywords: [cc-switch, opencode, models.dev, pi-coding-agent, models.json, ModelRegistry, provider-switching, GUI, v0-5-bundle]
---

# Provider/Model UX Research

## Question and Scope

How should the Alt Theory bundle's `/config` page manage providers and models
so a non-technical user can pick a provider+model without hand-typing model ids?
Three external tools were researched as candidates to borrow from, plus the
in-tree pi-coding-agent (whose native model registry is what the bundle already
wires via `AuthStorage.create()` / `ModelRegistry.create()`).

Scope excludes: OAuth flow design, account/subscription flow redesign, keychain
storage design (Pi's plaintext-at-rest behavior is the floor), any code changes
to the bundle.

## Quick Answer

1. **The native pi-coding-agent model registry is the answer for the model list,
   not a third-party catalog.** Pi ships an auto-generated
   `models.generated.js` with ~709 built-in entries and merges it with
   `~/.pi/agent/models.json` for user additions. The bundle's config GUI must
   edit `models.json` and let Pi's own `ModelRegistry` do the listing and fuzzy
   search — do not build a parallel model database.

2. **cc-switch is a UI-inspiration source, not a reuse target.** Its 50+
   provider presets, "obtain API key" links, and partner-star badges are
   patterns to borrow. Its SQLite SSOT, multi-app abstraction, health
   monitoring, and per-app quick switch are over-engineered for Alt Theory —
   do not copy. Non-technical users in Alt Theory's pilot context will manage
   one bundle with at most a handful of providers; cc-switch's per-app split
   (Claude/Codex/Gemini/OpenCode/Hermes/Claude Desktop) is solving a
   different problem.

3. **opencode is the data-source reference, not a format reference.** opencode
   pulls its model catalog from `https://models.dev/api.json` (MIT, ~2.3 MB,
   5-minute TTL, 60-minute auto-refresh, with a snapshot fallback). The
   schema is richer than Pi needs (cost tiers, modalities, release dates,
   knowledge cutoff, open_weights), but the operational pattern — fetch on
   miss, cache locally, refresh on TTL — is the right model. Alt Theory
   should *not* adopt models.dev as a runtime dependency; it should let Pi's
   built-in list plus user's own `models.json` do the work.

4. **No `/v1/models` fetch from the runtime.** Pi has no built-in remote
   fetch. The `pi.registerProvider()` async-factory extension pattern
   (documented in `custom-provider.md`) is the official way to do it if
   needed; not needed for Stage 5.

5. **No opencode-go OAuth requirement discovered.** opencode-go in pi's
   built-in list is configured as `api_key` (see `models.generated.js`
   under `opencode-go`); matches the user's prior expectation.

6. **The `qwen 3.7 max` model referenced in the handoff does not exist in
   models.dev (Q11, dropped).** models.dev has `qwen3-max`,
   `qwen3-max-preview`, and `qwen3-next-*` — no "3.7 max." `mimo v2.5 pro`
   does exist (xiaomi provider). Per user, Q11 was the wrong question; the
   report does not recommend a specific model to ship as the star marker.
   That decision belongs to a separate step that consults the current
   recommended-model list with fresh evidence.

## Quick Answer (corrected)

**Correction to the earlier "Quick Answer #3":** I assumed Pi's built-in
list is a different design choice than opencode's. **It is not.** Pi's
`scripts/generate-models.ts` (`%REFERENCE_REPO%\pi-mono\packages\ai\scripts\generate-models.ts:567`)
fetches from `https://models.dev/api.json` — the **same** data source opencode
uses. Pi's list is a curated, post-processed snapshot of models.dev (with
manual fixes for known issues) that ships at Pi release time. opencode
fetches the same data live with TTL caching.

The implication: the question "how does Alt Theory get the latest model
list" has the **same answer for both Pi-native and opencode-style** —
both ultimately read from models.dev. The difference is operational:
- **Pi-native (current Alt Theory path):** the list is a snapshot baked
  into the Pi npm package; updates ship with Pi releases, which Alt Theory
  picks up via `npm update @mariozechner/pi-ai`.
- **opencode-style:** the list is fetched live at runtime from
  `https://models.dev/api.json` with 5-minute TTL.

For Alt Theory, the right call is **stay on the Pi-native path** because:
(a) the bundle already wires Pi's `ModelRegistry`; (b) it inherits Pi's
manual fixes to known models.dev bugs (see `generate-models.ts:1152,
1454, 1633, 1735, 1891, 1999` — e.g. Claude Opus 4.5 cache pricing fix,
Gemini 3.1 Flash Lite addition, Mistral Medium 3.5 addition); (c) shipping
the snapshot avoids a runtime network dependency that could break offline
first-run for non-technical users.

This correction was driven by a source-check of Pi's actual repo
(`%REFERENCE_REPO%\pi-mono`, cloned 2026-06-22). The previous version of
this report was based on `node_modules/@mariozechner/pi-ai/dist/`
(v0.70.2, 3 versions behind the current npm v0.73.1) and **missed the
data-source provenance** because the generate script is not shipped
in the dist tree.

## Key Evidence

### Evidence A — Pi's built-in model registry is the runtime answer (and its provenance)

`@mariozechner/pi-ai/dist/models.generated.js:1-3`
```js
// This file is auto-generated by scripts/generate-models.ts
// Do not edit manually - run 'npm run generate-models' to update
export const MODELS = { ... }
```

**Provenance (from Pi's source, not the dist):**
`%REFERENCE_REPO%\pi-mono\packages\ai\scripts\generate-models.ts:566-567`
```ts
console.log("Fetching models from models.dev API...");
const response = await fetch("https://models.dev/api.json");
```

**Pi layers additional sources on top of models.dev:**
- `generate-models.ts:428` — `fetchNvidiaNimModelIds()` from `https://integrate.api.nvidia.com/v1/models`
- `generate-models.ts:448` — `fetchOpenRouterModels()` from `https://openrouter.ai/api/v1/models`
- `generate-models.ts:506` — `fetchAiGatewayModels()` from Vercel AI Gateway

**Pi applies manual fixes on top of the raw models.dev data:**
- `generate-models.ts:1152-1153` — fixes OpenCode Go endpoint mismatches
- `generate-models.ts:1454-1455` — fixes Claude Opus 4.5 cache pricing (3x bug in models.dev)
- `generate-models.ts:1496` — fixes GPT-5 Pro output limit (duplicate-of-input bug)
- `generate-models.ts:1633` — adds Gemini 3.1 Flash Lite Preview until models.dev catches up
- `generate-models.ts:1735` — adds GitHub Copilot GPT-5.3 models until models.dev catches up
- `generate-models.ts:1891` — explicit small list for non-models.dev sources
- `generate-models.ts:1999` — adds Mistral Medium 3.5 until models.dev catches up

`@mariozechner/pi-coding-agent/dist/core/model-registry.js:220-316` — `ModelRegistry`
- `loadBuiltInModels()` (line 278-301): `getProviders().flatMap(provider => getModels(provider))` from `@mariozechner/pi-ai/dist/models.js:15-21`
- `loadCustomModels()` (line 317-359): reads `~/.pi/agent/models.json` (overridable via `<APP_NAME>_CODING_AGENT_DIR`, in our case `PI_CODING_AGENT_DIR`)
- `mergeCustomModels()` (line 303-316): custom wins on `provider+id` conflicts
- `models.md:1-432`: docs confirm format, merging, per-model overrides

`@mariozechner/pi-coding-agent/dist/cli/list-models.js:24-97` — `listModels()`
supports fuzzy search by `provider + id`, used by `--list-models` and `/model`.

`@mariozechner/pi-coding-agent/dist/core/model-resolver.js:86-113` — fuzzy matching.

**Conclusion:** Pi already has the searchable, merged model catalog the GUI
needs. The config GUI's only job for the model list is to surface a
provider+model dropdown sourced from `ModelRegistry.getAvailable()` (or the
equivalent in this build). The bundle must not re-implement this.

### Evidence B — opencode's model catalog is the same models.dev, with snapshot + TTL

`packages/core/src/models-dev.ts:142-146`
```ts
const source = Flag.OPENCODE_MODELS_URL || "https://models.dev"
const filepath = path.join(
  Global.Path.cache,
  source === "https://models.dev" ? "models.json" : `models-${Hash.fast(source)}.json`,
)
const ttl = Duration.minutes(5)
```

`packages/core/src/models-dev.ts:147-155` — `fresh()` checks mtime < 5 min.

`packages/core/src/models-dev.ts:184-197` — `fetchAndWrite()` writes atomically
(tempfile + rename) to avoid corruption.

`packages/core/src/models-dev.ts:199-213` — `populate()` priority: disk cache →
`OPENCODE_MODELS_DEV` snapshot (compiled in) → API fetch (with Flock to avoid
race between concurrent CLIs).

`packages/core/src/models-dev.ts:237-240` — auto-refresh every 60 minutes.

`packages/core/src/models-dev.ts:46-97` — `Model` schema:
`id, name, family, release_date, attachment, reasoning, temperature,
tool_call, interleaved, cost, limit(context,output), modalities, experimental,
status, provider`.

`packages/core/src/models-dev.ts:100-107` — `Provider` schema: `api, name, env,
id, npm, models`.

`models-dev-api-sample.json` (fetched 2026-06-21, 2.37 MB) confirms the format
is what the schema says. Search for the recommended models:
- `qwen3-max`, `qwen3-max-preview`, `qwen3-next-*` — no "qwen 3.7 max"
- `xiaomi/mimo-v2.5-pro`, `xiaomimimo/mimo-v2.5-pro` — present
- `opencode-go` — present in Pi's built-in list as api_key

`packages/core/src/provider/transform.ts:5` and
`packages/opencode/src/provider/provider.ts:13` confirm opencode consumes
`ModelsDev` as its source of truth for provider/model metadata.

**Conclusion:** opencode's pattern is fetch+cache+snapshot, but it pulls from
the same models.dev API that Pi's generate script uses. For Alt Theory, the
equivalent role is already played by Pi's `models.generated.js` (curated at
Pi release time with manual fixes) + `models.json` (user-edited). No new
fetch needed.

### Evidence C — cc-switch is a Tauri desktop app, single SQLite, multi-app

`src-tauri/src/database/schema.rs:26-43` — `providers` table is the SSOT;
`settings_config` JSON blob is per-app-shaped (Claude env vars, Codex
TOML, OpenCode npm package + models, etc.).

`src-tauri/src/services/model_fetch.rs:1-5, 39-49, 135-199` — fetches
`/v1/models` from OpenAI-compatible endpoints; has a
`KNOWN_COMPAT_SUFFIXES` list (e.g. `/anthropic`, `/claudecode`) to try
the root when an Anthropic-compatible subpath is configured.

`src-tauri/src/services/provider/mod.rs:1603-1615, 1615-1799` — switch is
provider-level, takes `app_type` + provider `id`; current provider tracked
via `is_current` flag.

`src-tauri/src/services/subscription.rs:131-154` — only reads other apps'
keychain entries; never writes its own. User-provided API keys are stored
plaintext in SQLite.

`src/config/claudeProviderPresets.ts:25-74` — preset shape:
`settingsConfig` + `apiKeyUrl` (deep link to get the key) + `category` +
`theme` + `isOfficial/isPartner/primePartner` flags.

`src/components/providers/forms/ProviderPresetSelector.tsx:191-223` —
category-specific hints (Official: "browser login, no API key needed";
Aggregator: "just fill the API key"; Third-party: "fill API key and base
URL"; Custom: "fill all fields manually").

`src/components/providers/ProviderCard.tsx:423-433` — partner star badge
(`<span className="text-yellow-500">⭐</span>`).

`src/components/providers/forms/shared/ModelInputWithFetch.tsx:26-86` —
model dropdown with "Get Models" button, fetches and groups by `ownedBy`.

`src/components/universal/UniversalProviderFormModal.tsx:51-53, 56,
114-125` — per-app model fields for universal providers.

**Conclusion:** borrowable UX patterns: (a) provider preset cards with
`apiKeyUrl` deep links, (b) "Get Models" button that hits `/v1/models`,
(c) category-specific input hints, (d) partner star marker. Anti-patterns
for Alt Theory: SQLite SSOT (we edit Pi's JSON, not a new store),
multi-app abstraction (Alt Theory is one app), health/failover telemetry
(over-engineered for v0.5), system-tray quick switch (irrelevant for
local bundle).

### Evidence D — Pi has no built-in `/v1/models` fetch; extension API is the way

`@mariozechner/pi-coding-agent/docs/custom-provider.md:33-59, 98-127` —
extension factory pattern. Async factory that fetches and calls
`pi.registerProvider()` before session start; pi waits for the factory
during interactive startup so models are available in `--list-models`
and `/model`. This is the *official* way to add a dynamic provider
catalog; not needed for v0.5.

**Conclusion:** If the bundle later wants to enumerate models from a
local Alt Theory REST endpoint, it should be a Pi extension using
this pattern, not a re-implementation.

### Evidence E — opencode-go is api_key, not OAuth

`@mariozechner/pi-ai/dist/models.generated.js` (under `opencode-go` key) —
configured as `api_key` per the `Provider` schema. No OAuth requirement
discovered. This confirms the user's prior expectation and keeps the
scope to `api_key` only.

## Detail

### What "borrow" means here

A future GUI redesign should be able to adopt these patterns from cc-switch
without taking any code, because cc-switch's runtime (Tauri + Rust + React
for a multi-app desktop) is a different stack and scale than Alt Theory's
(Electron + TS + vanilla HTML for a single-app local tool). The borrow is
*shape and affordance*, not source.

Concrete borrowable shapes:

- **Provider preset card** with display name, category tag, "Get API key"
  deep link, partner star. Maps to a `ProviderTemplate` concept in the GUI
  (display name, category, keyUrl, recommended flag).
- **"Get Models" button** that calls a backend helper which, for an
  OpenAI-compatible provider, hits `{baseUrl}/v1/models` (with the same
  suffix-stripping logic cc-switch uses). The GUI must not hardcode the
  fetch in the frontend; backend should expose `POST /api/config/fetch-models`
  that takes a baseUrl + optional apiKey (to authenticate the request) and
  returns the model list, normalized to Pi's `models.json` entry shape.
- **Category-specific hint text** — show different helper text based on
  whether the user picked an "official" provider, an aggregator, or a
  custom base URL. Pattern from
  `ProviderPresetSelector.tsx:191-223`.
- **Star marker** for "recommended" models (pi's built-in list already has
  no such marker; the GUI overlays it). Pattern from `ProviderCard.tsx:423-433`.

### What "don't copy" means here

- **SQLite SSOT.** Alt Theory's bundle should keep editing Pi's native
  `~/.pi/agent/{models,auth,settings}.json`. Adding a parallel SQLite
  store would create a sync problem and break the "GUI is a thin management
  tool over Pi files" principle.
- **Multi-app abstraction.** Alt Theory is one app. Don't carry over
  cc-switch's per-app `app_type` (Claude/Codex/Gemini/OpenCode/Hermes/Claude
  Desktop) split.
- **Health monitoring / failover queue.** Over-engineered for v0.5. The
  user explicitly wants a simple local tool, not a fleet manager.
- **Per-role model split (Haiku/Sonnet/Opus).** Claude-specific concept
  that doesn't generalize; Pi's model list is flat.
- **System tray quick switch.** Irrelevant for an Electron local bundle.

### What "fallback" means here

- **For non-technical users without network access on first run**, the
  bundle cannot fetch from models.dev and cannot hit `/v1/models`. Fallback
  strategy: ship a *small, curated* `models.json` in `agent-assets/` (or
  next to the bundle) containing only the recommended providers (OpenRouter,
  opencode-go, minimax-cn) and a few models each. The GUI loads this
  fallback on startup if `~/.pi/agent/models.json` is missing/empty AND
  the user has not yet picked a provider. Once the user picks a provider
  and the key is verified, the GUI defers to Pi's own `ModelRegistry`
  (which has the full built-in list). This avoids baking a stale 2.3 MB
  JSON into the bundle while still giving the user something to start
  with.
- **For provider list beyond Pi's built-in**, the GUI should not try to
  enumerate. Pi's built-in list already has 25 providers (including
  opencode-go, openrouter, minimax-cn). If a user needs a provider that
  isn't in Pi's list, they need to add it manually via the custom-provider
  form — same as they would in plain `pi`.

### Recommended-model metadata (Q11, dropped)

Per user, Q11 ("exact id/provider/api-type/context-window for qwen 3.7 max
and mimo v2.5 pro") was the wrong question. The report does not include
specific model-id recommendations. A separate step should:
1. Consult Pi's current `models.generated.js` for the actual model ids of
   the recommended models.
2. Verify they exist in `opencode-go` or `minimax-cn` (the two providers
   the user is most likely to point friends at).
3. Hardcode the verified ids in the GUI's star-marker config.

Note: `qwen 3.7 max` does not appear in `models.dev/api.json` (checked
2026-06-21); possible model-name drift. `mimo v2.5 pro` does appear
under `xiaomi` and `xiaomimimo` providers. This is FYI, not a
recommendation.

### Open questions for the GUI design session

1. Should the GUI surface Pi's full built-in provider list in a dropdown,
   or only the providers that have a usable key in `auth.json`? (Likely the
   latter for non-technical users.)
2. Should the "Get Models" button be per-provider (one click after entering
   the base URL) or auto-fire on provider pick? (Likely per-provider with
   explicit click — auto-fire can be slow on first run.)
3. Should the fallback curated `models.json` live in `agent-assets/` (so
   it's tracked) or be generated at build time from Pi's `models.generated.js`
   filtered to recommended providers? (Likely the latter, so it stays in
   sync with Pi's upstream.)
4. The "active provider+model" store is `settings.json` (per
   `core-session-engine.md` §7 and the D1 decision in the plan-record). The
   GUI must write `settings.json` when the user marks a provider+model
   active. Confirm this REST endpoint exists or needs to be added.

## Open Questions

- **opencode-go pricing/limits:** the opencode-go entry in Pi's built-in
  list does not include cost fields. If we want to show users a price
  hint, we need a separate source.
- **OpenRouter vs opencode-go coverage:** Pi's built-in list includes both.
  For a non-technical user, presenting two similar-looking options is
  confusing. Which should be the default recommendation? (Out of scope
  for this research; needs product decision.)
- **OAuth future:** if opencode-go or OpenRouter later add OAuth login
  (e.g. via Pi's subscription read pattern), the GUI must add a
  "Login with ..." button. Pi's `custom-provider.md:62` notes that
  `pi.registerProvider()` can hold OAuth state. Not in v0.5 scope.

## Next Steps

- Hand this report to the next agent that will redesign the `/config` page.
  The agent should treat the "Borrow what" / "Don't copy what" / "Fallback
  what" sections as the design brief, not as a literal port.
- The plan-record's Stage 5 should be marked `completed` and the next
  stage (`Stage 3 - Config GUI`, already `tentative`) should be promoted
  to `active` with this report linked from it.
- A separate Q11 follow-up should pick the actual star-marker models
  from Pi's current built-in list (not from models.dev), since the
  built-in list is what the runtime actually uses.

## Related Documents

- `project/workstreams/0-frontend-and-research-console/notes-and-status/2026-06-17-windows-bundle-and-config-gui-plan-record-v1.md` (Stage 5 and Stage 6 of this plan-record are the immediate context)
- `project/workstreams/0-frontend-and-research-console/notes-and-status/2026-06-19-handoff-stage5-provider-model-ux-research.md` (the handoff that opened this research)
- `project/architecture/core-session-engine.md` §7 (Model Configuration) and §8 (Known Constraints)
- `agent-assets/skills/cs-swe-v0-4/SKILL.md` (the active SWE skill bundle for the GUI redesign that will follow)
- Reference repos: `%REFERENCE_REPO%\cc-switch` (cloned 2026-06-21), `%REFERENCE_REPO%\opencode` (cloned 2026-06-21)
- Local Pi install: `node_modules/@mariozechner/pi-coding-agent/` and `node_modules/@mariozechner/pi-ai/`
- Local models.dev API sample: `%REFERENCE_REPO%\models-dev-api-sample.json` (fetched 2026-06-21)
