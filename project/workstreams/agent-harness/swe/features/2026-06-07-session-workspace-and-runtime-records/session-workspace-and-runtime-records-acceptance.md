---
doc_type: feature-acceptance
feature: 2026-06-07-session-workspace-and-runtime-records
status: accepted
summary: Workspace and Alt Theory runtime records now have distinct, tested locations.
tags: [backend, session, experiment-records]
---

# Session Workspace And Runtime Records Acceptance

## Result

Accepted.

## Evidence

- `createSessionDirs()` creates `workspace`, `history`, and `records`; no
  `notes` directory is created and `writeDir === sessionCwd`.
- Assembly manifests are written to `records/assembly-manifest.json`.
- Metrics are written to `records/session-metrics.json`.
- Runtime events append to `records/session-events.jsonl`.
- Event tests cover creation and selection events without conversation bodies.
- WebSocket integration still verifies connection-local sessions.
- `npm run test:backend`: 9/9 passed.
- `npm run smoke:core`: passed with Pi 0.70.2.

## Residual Boundary

This feature does not sandbox Pi filesystem writes. That is recorded as a
separate issue and exploration.
