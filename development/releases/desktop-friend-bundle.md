# Desktop Friend Bundle

Status: canonical Windows and macOS friend-bundle procedure.

This is the single starting point for building an Alt Theory desktop artifact.
It describes the current folder-app distribution, not historical portable,
installer, or ASAR experiments.

## Release boundary

Build Windows and macOS on their matching operating systems from the same
committed source revision. A dedicated bundle worktree is optional; a clean
checkout of the exact commit is sufficient. Electron Builder packages the
working tree, so uncommitted source or generated files can otherwise enter an
artifact without appearing in its commit.

Before building:

1. confirm the intended commit and a clean tracked worktree;
2. confirm the root `package.json` version matches the intended tag and channel;
   this version drives Electron metadata and the in-app About panel; prerelease
   builds also give `shortVersionWindows` the numeric Windows mapping (for
   example, Beta 1 uses `1.3.0.1`);
3. close any Alt Theory process running from that checkout;
4. restore both lockfiles with `npm ci` and
   `npm --prefix alt-theory-app/frontend ci`;
5. do not change Pi, Electron, providers, ASAR, or distribution format as part
   of packaging.

User state is not part of the bundle. Existing conversations and configuration
remain under the user's Alt Theory data directory and must survive replacement
of the app folder.

## What the bundle reads

The executable source of truth is `build.files` in `package.json`. The current
bundle contains:

- `electron/`: desktop entry, preload bridge, and bundled-server loader;
- `alt-theory-app/web-server/public-v6/`: the static frontend (built from
  `alt-theory-app/frontend` via `npm run build:frontend-v6`; the legacy
  `public/` directory was removed when the pre-v6 vanilla UI was deleted);
- `dist-bundle/`: backend JavaScript produced by `npm run compile:bundle`;
- `agent-assets/`: runtime roles, souls, skills, KBs, and Alt Theory guidance;
- `docs/en/` and `docs/zh-Hans/`: packaged Help sources;
- `package.json` and required production `node_modules/`.

The package intentionally excludes:

- `agent-assets/*/snapshots/` and `agent-assets/*/experimental/`; packaging,
  rather than a second scanner, decides whether optional asset sets ship;
- all `@mistralai` SDK trees, because Alt Theory does not expose Mistral and
  those files caused the Alpha 6 Windows path-length failure.

`asar` remains disabled. `resources/app/agent-assets`, `docs`, and other
runtime files must remain ordinary directories that the app, agent tools, and
user can inspect. Do not turn on ASAR as a compression fix.

## Build

Run on each platform:

```text
npm ci
npm --prefix alt-theory-app/frontend ci
npm run build:electron
```

The command rebuilds the frontend, compiles the backend sidecar, and asks
Electron Builder for the current platform's unpacked directory:

- Windows x64: `dist/win-unpacked/`
- macOS arm64: `dist/mac-arm64/AltTheory.app`

`compile-bundle` currently prints known TypeScript diagnostics but succeeds
when it produces `dist-bundle/alt-theory-app/web-server/server.js`. Do not call
the bundle successful merely because that script continued.

## Archive and naming

Keep friend-facing names short because Windows Explorer normally derives an
extra extraction directory from the ZIP filename.

Use:

- Alpha 6: `AltTheory-a6-win.zip`, `AltTheory-a6-mac.zip`
- Beta 1: `AltTheory-b1-win.zip`, `AltTheory-b1-mac.zip`
- stable without a numbered channel: `AltTheory-win.zip`,
  `AltTheory-mac.zip`

Keep the ZIP filename near or below 24 characters. Do not put full SemVer,
commit, architecture, date, or adjectives such as `portable` in it. Record
those details and the SHA-256 in an adjacent `BUILD-INFO.txt`.

The Windows ZIP must contain one top-level `AltTheory/` folder. A reproducible
PowerShell archive step is:

```powershell
$stage = Join-Path (Resolve-Path "dist") "_friend-stage"
if (Test-Path -LiteralPath $stage) { throw "Remove the existing $stage first" }
$stageApp = Join-Path $stage "AltTheory"
New-Item -ItemType Directory -Path $stageApp | Out-Null
Copy-Item "dist\win-unpacked\*" $stageApp -Recurse
Compress-Archive -LiteralPath $stageApp `
  -DestinationPath "dist\AltTheory-b1-win.zip" -CompressionLevel Optimal
Remove-Item -LiteralPath $stage -Recurse
```

Change only the short channel label for later releases.

On macOS, preserve the `.app` bundle metadata:

```bash
ditto -c -k --sequesterRsrc --keepParent \
  dist/mac-arm64/AltTheory.app dist/AltTheory-b1-mac.zip
```

## Required verification

Automated content checks:

1. `resources/app/electron/main.cjs` exists;
2. the compiled backend, `public-v6`, packaged Help docs, `ALTTHEORY.md`, and
   intended default assets exist;
3. no archive entry contains `/@mistralai/`;
4. the longest relative path inside Windows `resources/app` is at most 180
   characters;
5. the archive has the required single top-level name;
6. the executable ProductVersion, FileVersion, CompanyName, description, and
   icon match the release metadata in the root `package.json`;
7. the in-app About version matches the tag and executable ProductVersion;
8. record artifact version, size, entry count, commit, and SHA-256 in
   `BUILD-INFO.txt`.

Manual acceptance:

1. extract the actual ZIP with the ordinary system extractor into a typical
   user directory;
2. launch that extracted copy, not `dist/win-unpacked`;
3. confirm the backend starts and the main window loads;
4. open an existing conversation and confirm saved provider/config state;
5. confirm packaged agent assets and Help files are ordinary browsable files.

If extraction is incomplete, stop at packaging. If extraction is complete but
launch fails, diagnose startup; do not change archive format to hide it.

## Current decisions and later maintenance

- Folder ZIP is the friend-test format.
- Portable self-extracting EXE is removed: it runs from a temporary directory.
- ASAR is rejected for the current runtime-file boundary.
- An installer is not the current path.
- Alpha 6 removes Mistral first. Whole-tree npm deduplication is a Beta
  dependency-hygiene direction, performed only with the intended Pi version
  pinned and followed by runtime checks.
- After a Pi upgrade, confirm the packaged app still starts without Mistral and
  repeat the path-length check. Do not maintain a Mistral compatibility layer.

Historical v0.5 bundle documents and old packaging scripts are evidence, not
instructions. This file and `package.json` govern new artifacts.
