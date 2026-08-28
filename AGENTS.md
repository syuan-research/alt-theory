# AGENTS.md

This file contains repository-facing instructions for coding agents. Product
explanation belongs in `README.md`; durable technical explanation belongs in
`development/`.

This repository is the active Alt Theory product source. Do not infer private
workspace layout from this public file.

## Start Here

1. Read `README.md`.
2. For any UI surface, navigation, settings, or entry-point work, read
   `development/architecture/information-architecture.md`.
3. Read the relevant map under `development/architecture/`.
4. Before cutting a release (CHANGELOG, tag page, bundle build, or bundle
   naming), read `development/releases/release-standard.md`. It is the
   canonical release procedure: CHANGELOG format, tag-page flow, bundle
   naming, and the Windows/macOS build.
5. Read the matching private development `swe-plan` when one is provided.
   GPT-5.6, Kimi K3, Claude Opus, Fable, and comparable models normally do not
   need feature or issue scaffolding; stronger models made those default gates
   more constraining than helpful.
6. Check the exact Git status before editing and keep unrelated changes intact.

## Source Boundaries

- `alt-theory-app/core/` owns session/runtime behavior.
- `alt-theory-app/web-server/` owns HTTP, WebSocket, auth, local configuration,
  and static frontend serving.
- `alt-theory-app/frontend/` owns the current React frontend.
- `agent-assets/` contains runtime-loaded product assets. Do not treat it as
  contributor documentation or move it under `development/`.
- Treat Pi packages as upstream dependencies. Never patch installed or vendored
  Pi package code in place. If a clean fix requires an upstream change, record
  or report that boundary and use only supported local interfaces in Alt Theory.
- `development/` contains public engineering explanation, not active private
  planning or session records.
- Local runtime data, credentials, deployment state, and private test evidence
  belong outside this repository.

## Checks

The frontend is served from the gitignored build output `public-v6/`; rebuild it after any pull or checkout before running: `npm run build:frontend-v6`.

For backend or shared runtime changes:

```bash
npm run test:backend
```

For frontend changes:

```bash
npm run build:frontend-v6
```

Run both when a code change spans backend and frontend. Starting a bundle or
release does not itself invalidate completed checks; reuse and invalidation of
release-time test evidence are governed only by
`development/releases/release-standard.md`.

For a release, the checks above are not the release procedure. Follow
`development/releases/release-standard.md`, including its CHANGELOG format,
tag-page flow, bundle naming, clean-commit, package-content, extraction,
and launch checks.

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

## Branch archive

A branch that has been merged into `main` (or otherwise finished its work)
is no longer active. Do not leave finished branches under active names where
agents mistake them for in-progress work.

- When a branch is finished, archive it: rename it to the `archive/` prefix
  (for example `work/foo` becomes `archive/foo`) and record its status in
  the list below. The history stays; the prefix marks the state.
- If a branch must keep its active name, add a one-line status note in the
  list below instead (active / merged / superseded) so an agent reading this
  file knows its state without guessing.
- An agent that finds a branch not listed here and cannot determine its
  status should say so and ask, not assume.

### Current branch status

- `main` — active product line.
- `docs/v1.4-english-update` — merged into main (v1.4 English docs + Chinese
  README download links).
- `archive/bundle-mac` — archived 2026-08-09 after the v1.4.3-beta.1 mac build.
  Formerly carried the mac electron config; main has carried it since
  2026-08-04, so the branch had no unique content. mac bundles are now built
  from a clean checkout of the release tag.
- `archive/v1.2-adapter-importer` — merged into main; the Claude Code /
  adapter import work shipped in v1.3. Kept for history.
