# Alt Theory Windows Local Bundle - 2026-06-28

Release package:

```text
alt-theory-win-protable-2026-06-28.zip
```

This README is for the zip package next to it. Do not run only the `.exe` after unzipping; keep the whole extracted folder together.

## Naming Convention

Current package naming pattern:

```text
alt-theory-win-protable-YYYY-MM-DD.zip
```

The date is the bundle/release date. Future local Windows bundle zips should keep the same date-suffixed pattern so testers and agents can identify which build was sent.

Note: this release keeps the existing filename spelling `protable`. If the project later standardizes the spelling to `portable`, update this README and the release-note filename at the same time so old and new artifacts are not confused.

## What Changed In This Build

Compared with the earlier bundle/probe work, this package is built from the current v0.5.x integration tree rather than the older zcode bundle branch.

Main changes:

- Uses the current pragmatic v0.5.x Windows folder bundle path: `dist/win-unpacked` -> zip.
- Uses the v0.6-derived local React config UI inside the v0.5.x bundle.
- Serves the packaged local frontend from `alt-theory-app/web-server/public-v6`.
- Adds the local `Model setup` flow for non-technical API key/provider setup.
- Splits OpenCode Go into separate OpenAI-compatible and Anthropic-compatible presets.
- Keeps current Qwen 3.7 / MiMo-oriented preset labels instead of stale Pi model-list snapshots.
- Renames the normal MiMo overseas option to `Xiaomi MiMo API (Global)`.
- Keeps `Xiaomi MiMo Token Plan (CN)` separate from normal MiMo API entries.
- Adds a warning-only path for legacy local configs named `opencode-go`; users should recreate them as `opencode-go-openai` or `opencode-go-anthropic`.
- Moves the EP knowledge base choice to a clearer checkbox-style user flow in the local UI.
- Keeps local runtime data under the user's local `.alt-theory` config/log directory, not inside the app folder.

## Known Limits

- This is a folder bundle, not a polished installer.
- Windows may show a security warning because the package is not code-signed.
- The local UI is marked/test treated as a work-in-progress surface; visual polish is not final.
- The package is for local Windows testing. It is not the VPS hosted pilot UI.
- Do not delete or infer anything about the old hosted `alt-theory-app/web-server/public/config.html` from this package; the local bundle uses `public-v6`, while hosted/VPS paths may still use `public/`.

## Tester Guide

Use the non-technical tester guide when sending this package to a friend or pilot tester:

```text
development/releases/v0.5-bundle/user-guide.zh.md
development/releases/v0.5-bundle/user-guide.en.md
```

The short instruction is:

1. Unzip the whole package.
2. Run `AltTheory.exe` from the extracted folder.
3. Open `Model setup`.
4. Add the provider/key they actually have.
5. Return to chat and send one short test message.

## Agent Notes

Future agents should read these before changing bundle/config behavior:

```text
development/releases/v0.5-bundle/agent-guidance.md
development/architecture/local-windows-bundle.md
```

Do not open or inspect release zip contents unless the user explicitly asks for package verification.
