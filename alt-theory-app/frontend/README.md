# Alt Theory v0.6 Frontend

Full SWE-plan frontend rebuild. Reference behavior: `web-server/public/client.js`.

## Run (recommended — one URL, built v0.6 UI)

```powershell
# worktree root
npm run build:frontend-v6
npm run dev:web:local
```

Open `http://127.0.0.1:3000` — the local app with the `~/.alt-theory` store,
model config at `/config`.

## Hot reload dev (two terminals)

```powershell
npm run dev:web:local
npm run dev:frontend-v6        # http://localhost:5173
```

## SWE plan status

See `development/architecture/researcher-console.md` for the current frontend architecture.

Handoff Milestone 1 was proof-only, not product completion.
