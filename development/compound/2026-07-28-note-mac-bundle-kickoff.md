---
doc_type: note
slug: mac-bundle-kickoff
scope: macOS bundle work (branch bundle/mac, worktree dev/worktrees/mac-bundle)
status: current
created: 2026-07-28
---

# Note: Mac Bundle Kickoff — What Carries Over From the v0.5.x Probe

This branch produces the macOS local app (`AltTheory.app`) for non-technical
social-science users. A first probe bundle was built 2026-06-28 on the old
repo (`Hanyetu/alt-theory`, v0.5.x line). **That bundle was never put into
use, the repo has since changed (now `syuan-research/alt-theory`), and none
of its code needs salvaging** — this note is the record of what was learned
there, so the old trees never need to be reopened.

## Already true in THIS tree (verified 2026-07-28)

- `electron/` exists (`main.cjs`, `bundle-server.cjs`, `preload.cjs`) from
  the Windows bundle work (`development/architecture/local-windows-bundle.md`).
- **The free-port fix is already here**: no `ALT_THEORY_PORT`/`PORT`
  override → bind port 0 and take the OS-assigned port; a busy override
  falls back to a free port. (In the v0.5.x probe this was an uncommitted
  patch — hard-coded port 3000 silently failed when taken. Nothing to
  port over; it landed with the Windows bundle line.)
- `npm run build:electron` = build frontend-v6 → `compile:bundle` (tsc to
  `dist-bundle/`) → `electron-builder build --dir`.
- `package.json` `build` has only a `win` block. **No `mac` block, no icon**
  — the two real gaps for this branch.

## Lessons from the v0.5.x probe (2026-06-28, arm64 Mac)

- The Mac build **works without a `mac` block**: `electron-builder --dir`
  targets the current platform, producing `dist/mac-arm64/AltTheory.app`
  (generic Electron icon, no dmg). The `mac` block is for polish: icon,
  category, dmg/zip target, `"identity": null`.
- Build with `CSC_IDENTITY_AUTO_DISCOVERY=false` (or `"identity": null` in
  the `mac` block) so electron-builder never looks for an Apple signing
  identity. **No paid signing/notarization — decided.** Users do a one-time
  Gatekeeper "Open Anyway"; end-user guide:
  `/Users/shuai/llm-theo/MAC-OPEN-GUIDE.md`.
- **Install BOTH package roots**: `npm install` AND
  `npm --prefix alt-theory-app/frontend install`. Skipping the second fails
  the build with missing `react`/`vite`.
- `compile:bundle` prints pre-existing TypeScript diagnostics and continues;
  electron-builder warns about the default icon and disabled asar — all
  harmless noise.
- Smoke test: launch the binary directly
  (`AltTheory.app/Contents/MacOS/AltTheory`) to see logs; success =
  `Alt Theory server running on http://127.0.0.1:<port>` and the UI at that
  URL; logs also land in `~/.alt-theory/logs/bundle-debug.log`.
- Distribution path: zip the `.app`, share via GitHub release, ship
  MAC-OPEN-GUIDE.md alongside.
- Probe was **arm64 only**; Intel/universal is an open decision.
- Icon drafts + Codex handoff: `/Users/shuai/llm-theo/icon-candidates/`
  (nothing wired in yet).

## alpha.5 probe result (2026-07-28, this worktree)

- **Electron 33 cannot run the current backend.** The alpha.3 session-import
  adapters (`codex-session-import.ts`, `opencode-session-import.ts`)
  statically import `node:sqlite`, which needs Node ≥22.5; Electron 33
  embeds Node 20, so the bundled backend died at startup with
  `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`.
- Fix applied here: `electron` bumped `^33.0.0` → `43.2.0` (embeds a
  current Node). `electron/main.cjs` uses only stable APIs
  (app/BrowserWindow/dialog/ipcMain/shell) and needed no changes;
  electron-builder 25 packaged it unchanged.
- Smoke test passed after the bump: auto free port (51606 this run),
  `HTTP 200` with `<title>Alt Theory</title>`, `/api/sessions` serving the
  real catalog from `~/.alt-theory/data` (state from earlier local-mode
  runs was picked up — the shared local data dir works).
- `mac` builder block added same day (`category` education, `identity: null`,
  `dir`/arm64 target): the no-signing policy now lives in config, so a plain
  `npm run build:electron` works without the `CSC_IDENTITY_AUTO_DISCOVERY`
  env var. Icon still pending (visual decision, owner's call —
  `icon-candidates/` has drafts); until then the app shows the generic
  Electron icon.
- **arm64-only is accepted** (owner, 2026-07-28): the Windows bundle is
  x64-only too — platform coverage is pragmatic, add Intel only if real
  users ask.
- Still open: asar disabled (fine for alpha/beta — enabling it would need
  `asarUnpack` for every app-resource dir handed to spawned processes),
  unsigned "Open Anyway" flow unverified on a clean machine, and a
  beta-walkthrough pass over Electron-version-sensitive paths
  (file dialogs, notifications, external links) after the 33→43 jump.

## Superseded / stale — do not read for truth

- Worktrees `llm-theo-v0.3-dev` and `llm-theo-mac-bundle-probe` (old repo,
  frozen July 2026). The uncommitted port patch there is obsolete.
- `/Users/shuai/llm-theo/mac-bundle-howto.md` describes the v0.5.x
  procedure against the old repo; its build steps still broadly match this
  tree's scripts, but paths and repo remotes are outdated.
