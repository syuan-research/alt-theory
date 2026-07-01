---
name: model-preset-maintenance
description: Maintain Alt Theory recommended provider and model preset assets. Use when updating agent-assets/model-presets/recommended-models.json, checking current provider model ids, adding or removing recommended models, or preparing model defaults before a release or friend test.
---

# Model Preset Maintenance

Update `agent-assets/model-presets/recommended-models.json`.

Rules:

- Treat recommendations as editable product defaults, not validation truth.
- Preserve product decisions unless current provider evidence contradicts them.
- Do not infer recommendations from bundled Pi or OpenCode registry snapshots alone.
- Prefer provider live APIs or official docs close to the release/test date.
- Use `status: "verified"` only when the id is confirmed against a provider source.
- Use `status: "candidate"` when the id follows a likely provider pattern but is not verified.
- Record `checkedAt`, `source`, and short `notes`.
- If unsure, leave `recommendedModels: []` or mark candidate; do not invent replacements.
- Frontend may display recommended models, but users must be able to edit, fetch, or manually enter ids.

Minimal workflow:

1. Identify target providers and product-stated recommendations.
2. Check provider source: OpenRouter `/api/v1/models`, DashScope/Aliyun docs or model endpoint, or another primary source.
3. Update only the relevant provider block.
4. Keep stale models out of default recommendations; mention them only when useful context.
5. Run a JSON parse check before committing.
