# Release Standard

Status: canonical release procedure — CHANGELOG and tag-page format, bundle
naming, and the Windows/macOS build.

This is the single starting point for cutting an Alt Theory release. It
covers the release notes (CHANGELOG + GitHub Release page), the bundle
filenames, and the build. Historical portable, installer, or ASAR
experiments are out of scope.

## Release notes (CHANGELOG and GitHub Release page)

The release notes live in two places that must agree: `CHANGELOG.md` in the
repo root, and the body of the GitHub Release (tag) page. `CHANGELOG.md` is
the source; the tag-page body is the same text pasted at release time.

### Format

- One `## vX.Y.Z-beta.N — YYYY-MM-DD` section per release, newest first.
- One or two plain sentences under the heading stating what the release is
  for. No marketing register, no atmospheric openers.
- Group changes under `### Topic` headings that name the area in plain
  nouns (Performance, Trash, Conversation families, Settings, Steer, Removed
  code). One area per heading; do not split a topic across two headings.
- One bullet per change. Each bullet states the user-visible change first,
  then the mechanism or the prior behavior if it helps. No restatement
  sentence after a complete bullet list.
- Single language per file. `CHANGELOG.md` is English. Translated copies
  (when they exist) are separate files matched to the README languages, not
  inline bilingual blocks.
- Engineering detail, commit hashes, and internal names stay out. Link to
  the relevant architecture doc or commit history instead.

### Tag-page (GitHub Release) body

The tag-page body has two parts: the release notes (the `CHANGELOG.md`
section for that version, pasted verbatim) and the download-and-launch
instructions. The download instructions live only on the tag page, not in
`CHANGELOG.md`.

Download-and-launch instructions use one standard block per platform. They
name this release's bundle file and point at this release's assets (the tag
page is the download source, so naming the file here is correct; the rule
against naming files applies to `README.md` and the user docs, which point
at the generic release page instead).

Windows: download and launch

1. Download `AltTheory-{X.Y.Z}-win.zip`.
2. Extract the complete `AltTheory` folder. This is a folder app, not an
   installer. If extraction fails, extract into a folder with a shorter
   path (Windows enforces a maximum path length).
3. Run `AltTheory.exe`.

The Beta is not code-signed. Windows SmartScreen may show an
unidentified-app warning; choose **More info → Run anyway** only for the
ZIP downloaded from this release. The release's `BUILD-INFO-win.txt`
carries the SHA-256.

macOS: download and launch

1. Download `AltTheory-{X.Y.Z}-mac.zip`.
2. Double-click the ZIP to unpack the `AltTheory` folder. It contains
   `AltTheory.app` and a small `Fix-Open.command` script.
3. Right-click `Fix-Open.command`, choose **Open**, then **Open** in the
   dialog. A Terminal window reports the fix and waits for a key.
4. Move `AltTheory.app` to Applications and open it with an ordinary
   double-click.

The fix step exists because the Beta is not notarized by Apple. Current
macOS refuses an unsigned downloaded app as «"AltTheory" is damaged and
can't be opened» — and no longer offers the old right-click **Open**
bypass for app bundles (verified 2026-08-05 on macOS 26; older systems
that still show "Apple could not verify…" can use either route). The
script only removes macOS's download-quarantine flag from the
`AltTheory.app` beside it (or one already moved to Applications). Run it
only for the ZIP downloaded from this release. Apple Silicon only.
Node.js and npm are not required for either app. The release's
`BUILD-INFO-mac.txt` carries the SHA-256.

The same download-and-launch content (minus the specific filename, which
the user docs replace with a pointer to the release page) is the install
template used in `README.md` and
`docs/en/start-here/install-and-launch.md`. Keep the three in step; when
the install block changes, update all three.

## Tag and version flow

1. Decide the version (`X.Y.Z-beta.N`) and the release date.
2. Write the `CHANGELOG.md` section for it in the format above.
3. Build and verify the bundles (Build, Archive and naming, Required
   verification).
4. Tag `vX.Y.Z-beta.N` at the commit that matches the built source.
5. Create the GitHub Release on that tag, mark it a prerelease while in
   Beta, paste the `CHANGELOG.md` section as the body, and attach the
   bundles and their `BUILD-INFO*.txt`.
6. The GitHub Release is the public release notes. `CHANGELOG.md` mirrors
   it so repo readers see the same text.

The root `package.json` version, the in-app About version, the executable
ProductVersion, and the tag must all carry the same `X.Y.Z-beta.N`. A Beta
build also maps to a numeric `shortVersionWindows` (for example, 1.4.0.1).

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

Bundle filenames are uniform across platforms and releases:

```
AltTheory-{X.Y.Z}-{platform}.zip
```

- `{X.Y.Z}` is the release's major.minor.patch only. The beta channel
  suffix (`-beta.N`) stays in the tag and `package.json` but is dropped
  from the filename. So release `v1.4.0-beta.1` ships as
  `AltTheory-1.4.0-win.zip` and `AltTheory-1.4.0-mac.zip`.
- `{platform}` is `win` or `mac`.
- Both platforms use the same form. Do not vary the name by channel label
  (`b1`, `a6`), architecture (`arm64`, `x64`), date, or adjective. Those
  details are metadata and go in the adjacent `BUILD-INFO.txt` with the
  SHA-256.

Keep the filename short. Windows enforces a maximum path length (260 chars
by default), and Windows Explorer derives an extra extraction directory
from the ZIP filename, so a long filename eats into the budget that the
deep paths inside `resources/app/` already consume. The Alpha 6 Windows
path-length failure came from exactly this. Keep the ZIP filename near or
below 24 characters where the version allows; `AltTheory-1.4.0-win.zip`
is 22.

Earlier releases used mixed forms — short channel labels
(`AltTheory-b1-win.zip`) and long architecture-stamped names
(`AltTheory-1.4.0-beta.1-mac-arm64.zip`). Both are retired. The form
above is the standard for every release from 1.4.1 on.

The Windows ZIP must contain one top-level `AltTheory/` folder. A
reproducible PowerShell archive step:

```powershell
$ver = "1.4.0"
$stage = Join-Path (Resolve-Path "dist") "_release-stage"
if (Test-Path -LiteralPath $stage) { throw "Remove the existing $stage first" }
$stageApp = Join-Path $stage "AltTheory"
New-Item -ItemType Directory -Path $stageApp | Out-Null
Copy-Item "dist\win-unpacked\*" $stageApp -Recurse
Compress-Archive -LiteralPath $stageApp `
  -DestinationPath "dist\AltTheory-$ver-win.zip" -CompressionLevel Optimal
Remove-Item -LiteralPath $stage -Recurse
```

Set `$ver` to the X.Y.Z form per release. The macOS ZIP mirrors the
Windows layout — one top-level `AltTheory/` folder holding `AltTheory.app`
plus `scripts/release/Fix-Open.command` (the Gatekeeper fix-open script the
launch instructions rely on) — and must preserve the `.app` bundle
metadata, so stage and archive with `ditto` (never `zip -r`: it follows
the Electron.framework symlinks and produces a genuinely damaged app):

```bash
ver="1.4.0"
stage="dist/_release-stage/AltTheory"
rm -rf dist/_release-stage
mkdir -p "$stage"
ditto dist/mac-arm64/AltTheory.app "$stage/AltTheory.app"
cp "scripts/release/Fix-Open.command" "$stage/"
chmod +x "$stage/Fix-Open.command"
ditto -c -k --sequesterRsrc --keepParent "$stage" "dist/AltTheory-$ver-mac.zip"
rm -rf dist/_release-stage
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

- Folder ZIP is the distribution format.
- Portable self-extracting EXE is removed: it runs from a temporary directory.
- ASAR is rejected for the current runtime-file boundary.
- An installer is not the current path.
- Bundle filenames are uniform (`AltTheory-{version}-{platform}.zip`); the
  mixed short-label and architecture-stamped names used by 1.3.0–1.4.0 are
  retired.
- Alpha 6 removes Mistral first. Whole-tree npm deduplication is a Beta
  dependency-hygiene direction, performed only with the intended Pi version
  pinned and followed by runtime checks.
- After a Pi upgrade, confirm the packaged app still starts without Mistral and
  repeat the path-length check. Do not maintain a Mistral compatibility layer.

Historical v0.5 bundle documents and old packaging scripts are evidence, not
instructions. This file and `package.json` govern new artifacts.
