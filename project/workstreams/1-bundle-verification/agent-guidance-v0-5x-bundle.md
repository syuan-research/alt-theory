# v0.5.x Bundle Agent Guidance

This file is for future coding/review agents. It is not the friend-facing test guide.

## Do Not Conflate These Surfaces

Alt Theory currently has multiple delivery surfaces that share backend code but do not use the same frontend/static path by default:

- VPS / hosted pilot: default server static path, historically `alt-theory-app/web-server/public/` unless deployment explicitly overrides it.
- Windows local bundle: packaged Electron sets `ALT_THEORY_MODE=local` and `ALT_THEORY_PUBLIC_DIR=alt-theory-app/web-server/public-v6`.
- Local dev for bundle UI: `npm run dev:web:local:v6`, also serving `public-v6`.

Therefore:

- Do not delete `alt-theory-app/web-server/public/config.html` just because the current bundle uses React `public-v6`.
- Do not assume a change tested in `public-v6` changes the VPS UI.
- Do not assume a hosted/VPS fix belongs in the bundle path.
- If changing config behavior, identify which frontend(s) need the update: old `public/`, React `public-v6`, or both.

## Current Bundle Target

Current pragmatic target:

```text
source: dev/worktrees/llm-theo-v0.3-dev
build:  npm run build:electron
output: dist/win-unpacked/
launch: dist/win-unpacked/AltTheory.exe
```

Do not continue Candidate B / portable repair or the older zcode bundle lane unless the user explicitly reopens a packaging probe.

## Config And Provider Rules

`/config` must stay Pi-native. It writes Pi-compatible `models.json`, `auth.json`, and `settings.json`; it must not create a separate Alt Theory model registry.

Provider presets are user-facing product/channel templates, not stale snapshots from Pi package internals. Do not copy old Pi-generated model lists into the GUI. Verify current provider evidence before editing fast-moving presets.

Current important presets:

- OpenCode Go OpenAI-compatible: base URL `https://opencode.ai/zen/go/v1`, API `openai-completions`, for `/chat/completions` models such as MiMo, DeepSeek, Kimi, GLM.
- OpenCode Go Anthropic-compatible: base URL `https://opencode.ai/zen/go`, API `anthropic-messages`; Pi/Anthropic SDK appends `/v1/messages`; for Qwen 3.7 and MiniMax.
- MiMo Token Plan CN is not the same as normal MiMo API CN/Global.
- Qwen Bailian uses the DashScope compatible endpoint and current Qwen 3.7 label recorded in the provider decision doc.

Legacy local configs named `opencode-go` may exist from the old mixed preset. Current policy is warning-only: tell the user to recreate as `opencode-go-openai` or `opencode-go-anthropic`. Do not silently delete their config.

## User Guide Boundary

Friend/non-technical tester guidance lives here:

```text
project/workstreams/1-bundle-verification/user-guide-v0-5x-local-bundle.zh.md
project/workstreams/1-bundle-verification/user-guide-v0-5x-local-bundle.en.md
```

Keep those guides user-facing. Do not put internal architecture caveats, code-review instructions, or provider implementation debates there.

## Process Safety

Do not kill broad Node/npm process sets. Grok or another agent may be running benchmark/probe jobs from the same worktree. If port 3000 is occupied, identify the owning process and ask before stopping anything that looks like `runs/local-launch/`, a bench, or a probe.

## Efficient Verification

For small React UI/config changes:

```powershell
npm --prefix alt-theory-app/frontend run typecheck
npm --prefix alt-theory-app/frontend run build
```

For fresh friend-testable artifact:

```powershell
npm run build:electron
```

Known current behavior: `compile-bundle` may print pre-existing TypeScript diagnostics but continue after producing `dist-bundle/.../server.js`. Do not treat those diagnostics as newly introduced unless your change is clearly involved.

Minimum smoke after full bundle build:

- `dist/win-unpacked/AltTheory.exe` exists.
- packaged `resources/app/alt-theory-app/web-server/public-v6` contains the expected current frontend asset.
- launch `AltTheory.exe` without killing unrelated processes.
- `http://127.0.0.1:<port>/config` responds.
- check `%USERPROFILE%\.alt-theory\logs\bundle-debug.log` for packaged project root and public dir.
