# Release Standard

Status: canonical release procedure — CHANGELOG and tag-page format, bundle
naming, and the Windows/macOS build.

This is the single starting point for cutting an Alt Theory release. It
covers the release notes (CHANGELOG + GitHub Release page), the bundle
filenames, and the build. Historical portable and installer experiments are
out of scope.

## Release notes (CHANGELOG and GitHub Release page)

The release notes live in two places that must agree: `CHANGELOG.md` in the
repo root, and the detailed-notes section of the GitHub Release (tag) page.
`CHANGELOG.md` is the source for that section; the tag page also has the
installation material defined below.

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

The tag-page body starts with the download-and-launch instructions. The
`CHANGELOG.md` section for that version is pasted verbatim only after those
instructions. Installation must be visible before a reader reaches the change
list; the download instructions live only on the tag page, not in
`CHANGELOG.md`.

Immediately between the platform instructions and the detailed release notes,
include this conspicuous three-language guide pointer:

> For detailed installation steps, read `README-How-to-Install-安装指南-Windows.md` or `README-How-to-Install-安装指南-macOS.md` inside the downloaded ZIP.
>
> 详细安装步骤请阅读下载 ZIP 内的 `README-How-to-Install-安装指南-Windows.md` 或 `README-How-to-Install-安装指南-macOS.md`。
>
> 詳細安裝步驟請閱讀下載 ZIP 內的 `README-How-to-Install-安装指南-Windows.md` 或 `README-How-to-Install-安装指南-macOS.md`。

Then add the version heading and paste that version's `CHANGELOG.md` section.
Do not put a long preamble, screenshots, or internal verification detail ahead
of installation.

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
2. Double-click the ZIP to unpack the `AltTheory` folder under **Downloads**.
   It contains `AltTheory.app` and `Fix-Open.command`.
3. Use either method below to remove the download quarantine.

Method A — bundled helper:

1. Right-click `Fix-Open.command`, choose **Open**, then **Open** in the dialog.
2. Open `AltTheory.app`. If macOS still blocks it, open **System Settings →
   Privacy & Security**, choose **Open Anyway** for AltTheory, authenticate if
   requested, and confirm **Open**.

Method B — Terminal command:

```bash
xattr -dr com.apple.quarantine "$HOME/Downloads/AltTheory/AltTheory.app"
```

Then open `AltTheory.app`. If the extracted folder name, app name, or final
location differs, replace the path in the command so it points to the actual
`AltTheory.app`.

These steps exist because the Beta is not notarized by Apple. Current
macOS refuses an unsigned downloaded app as «"AltTheory" is damaged and
can't be opened» — and no longer offers the old right-click **Open**
bypass for app bundles (verified 2026-08-05 on macOS 26; older systems
that still show "Apple could not verify…" can use either route). The
two methods only remove macOS's download-quarantine flag. Run either one only
for the ZIP downloaded from this release. Apple Silicon only.
Node.js and npm are not required for either app. The release's
`BUILD-INFO-mac.txt` carries the SHA-256.

The same download-and-launch content is the install template used in four
places that must stay in step; when the install block changes, update all
of them:

1. this file's blocks above (tag-page source);
2. `README.md` / `README.zh-Hans.md` / `README.zh-Hant-HK.md` (minus the
   specific ZIP filename — they point at the generic release page);
3. `docs/en/start-here/install-and-launch.md` and the zh-Hans counterpart
   (same generic-release-page rule);
4. `scripts/release/README-How-to-Install-安装指南-Windows.md` and
   `scripts/release/README-How-to-Install-安装指南-macOS.md` — **user-facing** trilingual
   copies (English / 简体中文 / 繁體中文香港) that ship **inside** the
   matching platform ZIP, next to the app. Each file carries only that
   platform’s download-and-launch block from the tag page. `{X.Y.Z}` stays
   as the version placeholder in the repo copy, or is filled for a given
   release if you prefer.

`v1.4.1-beta.1` did not include the in-ZIP how-to files; ship them from
the next release onward (Windows ZIP gets the `-win` file; macOS ZIP gets
the `-mac` file plus `Fix-Open.command`).

## Tag and version flow

1. Decide the version (`X.Y.Z-beta.N`) and the release date.
2. Write the `CHANGELOG.md` section for it in the format above.
3. Build and verify the bundles (Build, Archive and naming, Required
   verification).
4. Tag `vX.Y.Z-beta.N` at the commit that matches the built source.
5. Create the GitHub Release on that tag, mark it a prerelease while in Beta,
   put the platform installation blocks and three-language guide pointer first,
   paste the `CHANGELOG.md` section below them, and attach the bundles and their
   `BUILD-INFO*.txt`.
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

The executable source of truth is `build.files` plus `build.extraResources` in
`package.json`. The current bundle contains:

- `electron/`: desktop entry, preload bridge, and bundled-server loader;
- `alt-theory-app/web-server/public-v6/`: the static frontend (built from
  `alt-theory-app/frontend` via `npm run build:frontend-v6`; the legacy
  `public/` directory was removed when the pre-v6 vanilla UI was deleted);
- `dist-bundle/`: backend JavaScript produced by `npm run compile:bundle`;
- `agent-assets/`: external ordinary files under `resources/`, containing
  runtime roles, souls, skills, KBs, and Alt Theory guidance;
- `docs/en/` and `docs/zh-Hans/`: external ordinary Help sources under
  `resources/docs/`;
- `package.json` and required production `node_modules/`.

The package intentionally excludes:

- `agent-assets/*/snapshots/` and `agent-assets/*/experimental/`; packaging,
  rather than a second scanner, decides whether optional asset sets ship;
- all `@mistralai` SDK trees, because Alt Theory does not expose Mistral and
  those files caused the Alpha 6 Windows path-length failure.

Application code and production dependencies are packaged in
`resources/app.asar`. Runtime assets and Help docs that require real paths stay
outside it as `extraResources`. Packaged mode resolves code from
`app.getAppPath()` and physical resources from `process.resourcesPath`; repo
mode resolves both from the checkout root. Do not point `process.cwd()` at
`app.asar` or add a packaged-only asset-path branch.

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
from the ZIP filename, so a long filename eats into the available path budget.
The Alpha 6 Windows path-length failure came from exactly this. Keep the ZIP
filename near or below 24 characters where the version allows;
`AltTheory-1.4.0-win.zip` is 22.

Earlier releases used mixed forms — short channel labels
(`AltTheory-b1-win.zip`) and long architecture-stamped names
(`AltTheory-1.4.0-beta.1-mac-arm64.zip`). Both are retired. The form
above is the standard for every release from 1.4.1 on.

The Windows ZIP must contain one top-level `AltTheory/` folder, with
`README-How-to-Install-安装指南-Windows.md` beside the app files (not buried under
`resources/`). Before the next release, rename the repo guide to this canonical
filename and update the staging script in the same change. A reproducible
PowerShell archive step:

```powershell
$ver = "1.4.0"
$stage = Join-Path (Resolve-Path "dist") "_release-stage"
if (Test-Path -LiteralPath $stage) { throw "Remove the existing $stage first" }
$stageApp = Join-Path $stage "AltTheory"
New-Item -ItemType Directory -Path $stageApp | Out-Null
Copy-Item "dist\win-unpacked\*" $stageApp -Recurse
Copy-Item "scripts\release\README-How-to-Install-安装指南-Windows.md" $stageApp
Compress-Archive -LiteralPath $stageApp `
  -DestinationPath "dist\AltTheory-$ver-win.zip" -CompressionLevel Optimal
Remove-Item -LiteralPath $stage -Recurse
```

Set `$ver` to the X.Y.Z form per release. The macOS ZIP mirrors the
Windows layout — one top-level `AltTheory/` folder holding `AltTheory.app`,
`scripts/release/Fix-Open.command` (the Gatekeeper fix-open script the
launch instructions rely on), and `scripts/release/README-How-to-Install-安装指南-macOS.md`
(trilingual how-to for mac only, same text as the tag-page mac block) —
and must preserve the `.app` bundle metadata, so stage and archive with
`ditto` (never `zip -r`: it follows the Electron.framework symlinks and
produces a genuinely damaged app):

```bash
ver="1.4.0"
stage="dist/_release-stage/AltTheory"
rm -rf dist/_release-stage
mkdir -p "$stage"
ditto dist/mac-arm64/AltTheory.app "$stage/AltTheory.app"
cp "scripts/release/Fix-Open.command" "$stage/"
cp "scripts/release/README-How-to-Install-安装指南-macOS.md" "$stage/"
chmod +x "$stage/Fix-Open.command"
ditto -c -k --sequesterRsrc --keepParent "$stage" "dist/AltTheory-$ver-mac.zip"
rm -rf dist/_release-stage
```

## Required verification

Automated content checks:

1. `resources/app.asar` exists and contains `electron/main.cjs`, the compiled
   backend, `public-v6`, `package.json`, and production dependencies;
2. `resources/agent-assets/ALTTHEORY.md`, intended default assets, and packaged
   Help docs under `resources/docs/` exist as ordinary files;
3. no archive entry contains `/@mistralai/`;
4. no required real-path resource was accidentally left only inside ASAR;
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
- Application code uses ASAR; path-addressed agent assets and Help docs remain
  external `extraResources`.
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
