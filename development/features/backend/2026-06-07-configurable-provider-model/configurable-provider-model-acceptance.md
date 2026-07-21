---
doc_type: feature-acceptance
feature: 2026-06-07-configurable-provider-model
status: accepted
summary: Custom provider/model selection and runtime-only MiMo authentication passed automated and live verification.
tags: [backend, provider, model-config]
---

# Configurable Provider Model Acceptance

Accepted.

- Automated tests selected a synthetic custom provider/model and recorded it in
  the manifest.
- `agent-assets/runtime/pi-tui/models.json` contains no credential.
- MiMo live session used `xiaomi-mimo-cn-openai/mimo-v2.5-pro`.
- Three turns completed with 56,931 total tokens reported by Pi, including
  46,656 cache-read tokens.
- The unique KB fact was retrieved and `workspace/summary.md` was written.

