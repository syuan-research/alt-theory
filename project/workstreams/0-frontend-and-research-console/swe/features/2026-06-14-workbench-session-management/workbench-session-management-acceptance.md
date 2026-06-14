---
doc_type: feature-acceptance
feature: 2026-06-14-workbench-session-management
created: 2026-06-15
status: accepted
workstream: 0-frontend-and-research-console
---

# Workbench Session Management Acceptance

## Scope

Accepted scope:

- persist and expose session `projectId`;
- apply project defaults to drafts and allow same-session reassignment for
  materialized sessions;
- soft-delete sessions through a recoverable `records/deleted.json` marker;
- group and search the session catalog by project in the frontend;
- add desktop pane resize/collapse controls and restore buttons;
- render loaded and streaming assistant Markdown through the local `marked`
  vendor bundle with post-render sanitization;
- add a compact `Provenance` inspector tab for effective config and recent
  run lineage;
- preserve normal-flow behavior: no fallback confirmation UI, no Trash UI, no
  project-admin workflow, no framework migration.

## Automated Verification

- `npm run test:backend`: pass (`39/39`)
- `node --check alt-theory-app/web-server/public/client.js`: pass
- HTTP smoke:
  - `GET /`: `200`
  - `GET /vendor/marked.js`: `200`
- WebSocket smoke:
  - local browser session reached connected state after dev server restart

## Manual UAT

Local browser UAT on `http://127.0.0.1:3000` confirmed:

- desktop pane resize/collapse behavior works;
- assistant Markdown rendering works for session content;
- session delete works for newly created v0.4 sessions;
- the `Provenance` tab is visible and understandable as a non-blocking
  inspection surface;
- old legacy/incomplete sessions no longer fail detail load because the
  backend now returns `effectiveConfig: null` when newer config fields are
  unavailable;
- legacy/incomplete sessions can now be soft-deleted from the normal catalog.

Live recovery evidence during UAT:

- the earlier `Disconnected` state was a stopped local dev server, not a
  frontend/runtime bug;
- two failing legacy rows were used as live delete verification and are now
  soft-deleted from the catalog:
  - `2d9b6790-d704-4913-b76f-811915d36ad6`
  - `8cee4610-1715-487b-8576-cbc90ee78b83`

## Architectural Writeback

This feature requires writeback to:

- `project/architecture/researcher-console.md`
- `project/architecture/core-session-engine.md`
- `project/workstreams/0-frontend-and-research-console/notes-and-status/2026-06-14-research-console-v0-4-swe-plan.md`
- `project/workstreams/0-frontend-and-research-console/notes-and-status/2026-06-14-research-console-v0-4-swe-plan-items.yaml`

## Residual Risk

- Mobile-specific visual UAT was not rerun as a separate browser pass during
  this checkpoint. The feature reuses the existing responsive drawer layout and
  adds desktop-focused pane controls, so residual risk is low but not zero.

## Result

Accepted. `workbench-session-management` is complete for the current v0.4
scope and is ready to mark `done` in the parent SWE plan.
