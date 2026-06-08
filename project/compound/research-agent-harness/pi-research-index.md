# PI Research Index

Status: imported-reference index.

This folder collects the PI / agent-harness research files that directly explain the current v0.3 runtime architecture. It is not a full copy of the local `pi-gui` clone.

## Imported Files

| File | Source | Why it matters |
|---|---|---|
| `pi-capabilities.imported.md` | `_dev/approaches/migrate-to-agent-harness-architecture/agent-harness-research/pi-capabilities.md` | Summarizes PI capabilities and why PI was selected. |
| `frontend-architecture-research-report.imported.md` | `_dev/approaches/migrate-to-agent-harness-architecture/research/frontend-architecture-research-report.md` | Explains PI SDK events, pi-gui/pi-web-ui assumptions, and the current custom Express + WebSocket frontend/backend bridge. |

## External Clone

The local `pi-gui` clone remains an external reference:

```text
https://github.com/minghinmatthewlam/pi-gui
```

Remote:

```text
https://github.com/minghinmatthewlam/pi-gui.git
```

Policy:

- Do not vendor the whole clone into this repo.
- If PI GUI needs active secondary development with package installs/build output, create or use a non-OneDrive dev clone.
- Copy only reviewed, curated research notes or adapted code into this project.
