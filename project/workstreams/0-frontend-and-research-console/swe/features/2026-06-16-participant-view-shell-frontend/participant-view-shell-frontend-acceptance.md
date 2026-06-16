---
doc_type: feature-acceptance
feature: 2026-06-16-participant-view-shell-frontend
status: accepted
summary: Accepted participant/researcher/debug view-mode shell with login gate, private-mode toggle/badge, and conversation-action frontend (delete-latest, send lockout, stop hint). Frontend-only; consumes existing v0.5 backend contracts.
swe_plan: research-console-v0-5
swe_plan_items:
  - participant-view-shell
  - conversation-action-cleanup
created: 2026-06-16
tags: [v0-5, frontend, participant-view-shell, conversation-actions]
---

# Participant View Shell Frontend Acceptance

## Scope Accepted

Frontend pass on `alt-theory-app/web-server/public/{index.html,client.js,style.css}`:

- App identity resolved from `GET /api/auth/me`; effective view mode participant /
  researcher / debug.
- Login gate for anonymous browsers when accounts are configured (the backend 401
  on session routes is the configured-accounts signal).
- Login/logout, generic wrong-code error, auth badge, participant role-condition label.
- View-mode gating: participant hides Launch/Config, project, model/provider,
  Records/Paths/Provenance tabs, and the revise/fork lineage row; researcher shows
  the full workbench; a client-only Debug toggle (researcher/admin) re-shows
  advanced panels for current-browser troubleshooting without changing server
  identity, ownership, or consent.
- Low-noise private-mode toggle/badge using WebSocket `switch_visibility` before
  first prompt; verbatim plan copy shown once; locks once materialized.
- Conversation-action frontend: delete-latest control, hardened send lockout while
  running, stop→"edit or delete your latest message" hint.

No backend, protocol, session-record, auth, retention, or lineage change.

## Evidence

- `npm run test:backend`: 55/55 pass (regression held; no backend touched).
- Browser UAT (`scripts/uat-participant-shell.mjs`): 22/22 pass. Uses Playwright
  Chromium via the bundled `@playwright/mcp` playwright and an isolated temp data
  dir with participant + researcher test accounts; no live model turn needed.

## Key Behaviors Verified

- Login gate appears for anonymous + configured accounts; wrong code keeps it gated.
- Participant login clears the gate and hides researcher-only controls/tabs.
- Private toggle is switchable in draft and shows the Private badge.
- delete-latest, run-hint, send/stop, and debug-toggle controls are present and gated.
- Researcher view restores config + Records tab + debug toggle.
- No uncaught page errors (expected pre-login 401 excluded as intended signal).

## Plan Writeback

`participant-view-shell` → done and `conversation-action-cleanup` → done in:

- `2026-06-16-research-console-v0-5-swe-plan-items.yaml`
- `2026-06-16-research-console-v0-5-swe-plan.md`

`project/architecture/researcher-console.md` updated with a 2026-06-16 changelog entry.

## Deferred

- `summary-and-research-panels` (depends on this shell).
- Live model-turn UAT of a full participant prompt loop + actual delete-latest
  transcript effect (deferred to `deployment-pilot-smoke`; the delete-latest backend
  behavior was already accepted separately).
