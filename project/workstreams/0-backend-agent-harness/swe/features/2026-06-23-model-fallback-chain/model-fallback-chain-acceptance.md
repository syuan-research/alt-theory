---
doc_type: feature-acceptance
feature: 2026-06-23-model-fallback-chain
status: accepted
summary: Local DashScope Qwen fallback verified; interim chain committed with v0.6.x generalization deferred.
---

# Model Fallback Chain Acceptance

## Verified

- Unit tests for quota / auth / 429 classification and exclusion persistence.
- Local manual run: quota exhaustion on chain head triggers `model_fallback` event and successful turn completion on next model.
- Resume skips excluded models; manifest records active model after fallback.

## Chain at acceptance (2026-06-23)

Head: `qwen3.7-max-2026-05-20`. Trial `qwen3.7-max` removed from chain.

## Post-acceptance pilot updates (2026-06-24)

- Chain reordered: free 3.7 checkpoints → paid `05-20` → `glm-5.1` → `kimi-k2.6`.
- Hosted pilot incident: root-owned `runtime/` blocked fallback writes; process
  crash before `5791fce`. Recovered via ownership fix + model switch to
  `qwen3.7-max-preview`.
- Hardening shipped: `5791fce` (`exclude()` persist failure non-fatal); VPS
  deploy same day; `alt-theory-vps-deploy` skill documents data-dir ownership.
- Free checkpoints exhausted (`06-08`, `05-17`, `preview`); chain trimmed to
  `05-20` → `glm-5.1` → `kimi-k2.6`; VPS default model set to `05-20`.

## Deferred

General fallback productization → **dev v0.6.x**. This Qwen chain is temporary ops/dev safety only.