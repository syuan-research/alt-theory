# Alt Theory App

This is the v0.3 copied app structure.

Current first-slice mapping:

- `core/` was copied from `alt-theory-app/core/`.
- `web/server/` contains the Express + WebSocket backend.
- `web/frontend/public/` contains the static frontend.

Runtime path policy for this slice:

- PI runtime context is read from `agent-assets/runtime/pi-tui/`.
- KB is read from `agent-assets/kb/`.
- Static frontend is served from `apps/alt-theory/web/frontend/public/`.

This app has not yet been fully smoke-tested in v0.3 because dependencies are not installed in the new worktree.
