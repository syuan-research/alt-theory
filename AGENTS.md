# AGENTS.md

This file contains repository-facing instructions for coding agents. Product
explanation belongs in `README.md`; durable technical explanation belongs in
`development/`.

This repository is the active Alt Theory product source. Do not infer private
workspace layout from this public file.

## Start Here

1. Read `README.md`.
2. Read the relevant map under `development/architecture/`.
3. Read the matching private development `swe-plan` when one is provided.
   GPT-5.6, Kimi K3, Claude Opus, Fable, and comparable models normally do not
   need feature or issue scaffolding; stronger models made those default gates
   more constraining than helpful.
4. Check the exact Git status before editing and keep unrelated changes intact.

## Source Boundaries

- `alt-theory-app/core/` owns session/runtime behavior.
- `alt-theory-app/web-server/` owns HTTP, WebSocket, auth, local configuration,
  and static frontend serving.
- `alt-theory-app/frontend/` owns the current React frontend.
- `agent-assets/` contains runtime-loaded product assets. Do not treat it as
  contributor documentation or move it under `development/`.
- `development/` contains public engineering explanation, not active private
  planning or session records.
- Local runtime data, credentials, deployment state, and private test evidence
  belong outside this repository.

## Checks

For backend or shared runtime changes:

```bash
npm run test:backend
```

For frontend changes:

```bash
npm run build:frontend-v6
```

Run both for cross-layer or release-facing changes.

## Safety

- Do not commit API keys, account data, participant material, transcripts,
  local session data, logs, or machine-specific paths.
- Keep generated dependencies, build/cache output, and local runtime data
  ignored.
- Use placeholders or environment variables in examples.
- Preserve append-only session evidence and account isolation when changing
  persistence, import, or hosted-mode behavior.
- Do not weaken approval, workspace, or path guards to make a test pass.

## Change Discipline

- Prefer the smallest change at the shared source of truth.
- Update current architecture when an implemented boundary changes.
- Add feature or issue artifacts only when the user asks or they materially
  help explain durable public behavior; do not add private plans, handoffs,
  execution trackers, or agent-session output to this repository.
- An alpha checkpoint tag records a version that users actually encountered;
  it does not assert that acceptance work is complete.
