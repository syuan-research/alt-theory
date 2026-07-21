# v0.5.x Local Config And Bundle Path Decision

Date: 2026-06-26

## Decision

The current Windows bundle continuation should use updated v0.5.5 code in
`llm-theo-v0.3-dev`, not the older zcode bundle branch as an implementation
source of truth. The immediate distribution target is the `dist/win-unpacked`
folder app produced by `npm run build:electron`.

Candidate B / portable repair is out of scope unless the user explicitly asks
for a packaging research probe.

## Current Implementation Facts

- v0.6 React frontend/config work has been backfilled into v0.5.5.
- `npm run dev:web:local:v6` starts the current local web app with
  `ALT_THEORY_MODE=local` and `public-v6`.
- `npm run build:electron` first builds `alt-theory-app/web-server/public-v6`,
  compiles the backend sidecar, then packages `dist/win-unpacked`.
- Packaged Electron sets `ALT_THEORY_PUBLIC_DIR` to the bundled `public-v6`
  folder before starting the backend.
- `/config` is the local model setup page. It should stay Pi-native: write
  Pi-compatible provider, auth, and default-model config instead of creating a
  separate Alt Theory model registry.
- Keyless provider drafts may be saved for user convenience, but a keyless
  provider must not be set active or treated as runtime-usable.

## Model Preset Rule

Do not hardcode stale model IDs or invent provider/model names. MiMo and Qwen
presets came from the v0.6 config work; future changes should be based on fresh
provider evidence, not memory.

Hard rule for future agents: stale Pi package snapshots are not provider truth.
Copying outdated models from Pi's bundled/generated model list into user-facing
config presets is almost always wrong, especially for fast-moving gateways such
as OpenCode Go, MiMo, and Qwen. If the model list may have changed, fetch or
verify current provider evidence before editing presets.

Current product-level presets in the v0.6-derived GUI:

- Xiaomi MiMo Token Plan (CN): prefilled endpoint `https://token-plan-cn.xiaomimimo.com/v1`; current model IDs `mimo-v2.5-pro` and `mimo-v2.5`.
- Xiaomi MiMo API (CN) and Xiaomi MiMo API (Global): visible as separate normal-API product/region templates, but the Base URL is intentionally blank until a current official console/docs endpoint is verified. Do not invent one.
- OpenCode Go OpenAI-compatible: `https://opencode.ai/zen/go/v1`; current visible model IDs include `mimo-v2.5-pro`, `mimo-v2.5`, `deepseek-v4-pro`, `kimi-k2.7`, and `glm-5.2`.
- OpenCode Go Anthropic-compatible: `https://opencode.ai/zen/go`; Pi/Anthropic SDK appends `/v1/messages`; current visible model IDs include `qwen3.7-max`, `qwen3.7-plus`, and `minimax-m3`.
- Qwen Bailian OpenAI-compatible: `qwen3.7-max-2026-05-20`.

Do not split Xiaomi/MiMo user-facing presets into `OpenAI-compatible` versus
`Anthropic-compatible` entries. That is the protocol adapter field inside a
provider config. The user-facing choice is product/channel and region: normal
MiMo API versus MiMo Token Plan, CN versus global where verified.
Legacy local configs named `opencode-go` may exist from the old mixed preset.
Do not silently treat that as the recommended path. The GUI should warn users to
recreate it as `opencode-go-openai` or `opencode-go-anthropic`; a fuller
migration can wait until real local-user distribution exists.

## UX Testing Policy

During active local UX polish, do not rebuild Electron after every small UI
change. Use:

```powershell
npm --prefix alt-theory-app/frontend run build
```

Run the full bundle build only when a fresh artifact is needed:

```powershell
npm run build:electron
```

## KB UX State

The environmental psychology knowledge base is no longer a left-sidebar
dropdown in the current simple/local UI. It is an input-area checkbox:

- checked: use `ep-core`
- unchecked: use `kb=none`

Resume should preserve the effective config, including `kb=none`, rather than
falling back to the original session manifest.










