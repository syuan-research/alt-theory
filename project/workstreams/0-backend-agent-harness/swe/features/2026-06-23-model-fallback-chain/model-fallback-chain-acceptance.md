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

## Chain at acceptance

Head: `qwen3.7-max-2026-05-20`. Trial `qwen3.7-max` removed from chain.

## Deferred

General fallback productization → **dev v0.6.x**. This Qwen chain is temporary ops/dev safety only.