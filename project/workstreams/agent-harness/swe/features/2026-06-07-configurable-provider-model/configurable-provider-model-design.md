---
doc_type: feature-design
feature: 2026-06-07-configurable-provider-model
status: approved
summary: Select custom Pi providers and models from an external models.json while keeping API keys runtime-only.
tags: [backend, provider, model-config]
---

# Configurable Provider Model

## Scope

Allow the core/server to receive a `models.json` path, provider ID, model ID,
runtime API key, and optional thinking level.

Non-goals: provider UI, remote model discovery, persisted credentials, and a
universal cost catalog.

## Design

`AuthStorage` receives the API key through its runtime override.
`ModelRegistry` loads the supplied model configuration and resolves the explicit
provider/model pair. The manifest records provider/model but never the key.

The runtime bundle may track provider definitions without coupling model
availability to Pi's built-in catalog.

## Acceptance

- A synthetic custom provider/model is selected in automated tests.
- No credential is written to source, manifest, JSONL configuration, or records.
- MiMo V2.5 Pro completes the backend live smoke through the configured
  Anthropic-compatible endpoint.
