# AGENTS.md

Keep this file short. It is the map, not the encyclopedia.

Use it to find the right project docs, active skill bundle, recovery files, and safety rules. Deeper detail belongs in the linked files under `project/` and `agent-assets/`.

## Project Purpose

This worktree is the clean `v0.3` reorganization lane for Alt Theory. Alt Theory is an academic research project on the use of 2026 advanced agentic AI tool for social science education, with both swe and empirical research. 

Current emphasis:

- `main` is the integration branch; v0.5 pilot web-app work merged here in 2026-06;
- as of 2026-06-26, current v0.5.x bundle continuation also happens here for
  speed: the practical target is `dist/win-unpacked` from updated v0.5.5 code,
  using the v0.6 React frontend/config page backfilled into this tree;
- use `cs-swe-v0-4` as the active SWE-only skill bundle;
- keep project records, runtime `agent-assets/`, and app code in this tree;
- `llm-theo-v0.5-bundle` is now mainly a feasibility/probe reference unless a
  task explicitly asks for that branch; bundle docs live in
  `project/workstreams/1-bundle-verification/`.

Current v0.5.x bundle/config facts:

- Do not continue Candidate B / portable unless explicitly asked. The current
  practical user target is the `win-unpacked` folder app.
- `/config` is the local model setup surface. It should stay Pi-native:
  write Pi-compatible provider/auth/default config rather than inventing a
  separate model system.
- Model preset hard rule: stale Pi package snapshots are not provider truth.
  Writing outdated model IDs from Pi's bundled/generated model list into the
  user-facing config presets is almost always wrong. Fetch or verify current
  provider evidence before changing presets, especially for OpenCode Go, MiMo,
  Qwen, and other fast-moving gateways.
- v0.6 frontend/config work is not just background context; parts of it have
  been backported into v0.5.5. Read
  `project/compound/research-provider-model-ux/2026-06-26-decision-v0-5-local-config-and-bundle-path.md`
  before changing local model config or bundle packaging.
- During active UX polish, do not rebuild Electron after every small frontend
  edit. Use `npm --prefix alt-theory-app/frontend run build` for UI/build
  checks; run `npm run build:electron` only when a fresh bundle artifact is
  actually needed.

- Do not conflate VPS/hosted static frontend with the local bundle frontend.
  The local Windows bundle serves `alt-theory-app/web-server/public-v6`; the
  hosted/VPS default may still use `alt-theory-app/web-server/public/` unless
  deployment explicitly overrides `ALT_THEORY_PUBLIC_DIR`. Do not delete the
  old `public/config.html` as a bundle cleanup shortcut.
- Bundle user guides and future-agent guidance live in
  `project/workstreams/1-bundle-verification/`:
  `user-guide-v0-5x-local-bundle.zh.md`,
  `user-guide-v0-5x-local-bundle.en.md`, and
  `agent-guidance-v0-5x-bundle.md`.
## Quick Tree

```text
project/
  README.md
  architecture/
  foundation/
  workstreams/
  compound/
  brainstorms/
  cross-workstream/
  local-skills/          # dev-only SWE skills (not runtime-loaded)

agent-assets/
  README.md
  kb/
  role-presets/
  prompts/
  skills/                # runtime-loaded skills only (pilot: conversation-summary)

alt-theory-app/
references-to-legacy-materials/
_archives/               # local ignored snapshots only
```

## Read First

Start with:

1. [%LLM_THEO_ROOT%/Agents.md](file:///%LLM_THEO_ROOT%/Agents.md) for workspace tree routing
2. `%LLM_THEO_ROOT%/dev/worktrees/` layout and branch context via `git worktree list`
3. `project/README.md`
4. `agent-assets/README.md`
5. the relevant workstream under `project/workstreams/`
6. the relevant workstream-local or cross-workstream file under `notes-and-status/`

Current manual-restructure note: after the 2026-06-08 cleanup, this dev
worktree intentionally keeps software/dev records and runtime-facing assets,
while bulk research/evaluation material is being split out of this repo. The
backend now loads current runtime-facing assets from `agent-assets/`.

For software coding work, read:

1. `project/local-skills/cs-swe-v0-4/SKILL.md`
2. `project/local-skills/cs-swe-v0-4/references/shared-conventions.md`
3. the matching workflow file under `project/local-skills/cs-swe-v0-4/references/workflows/`
4. relevant system architecture maps under `project/architecture/` (e.g., `repo-structure-v0.3.md`, `core-session-engine.md`)

For branch/recovery context, also check:

- `project/cross-workstream/folder-and-worktree-management/notes-and-status/2026-06-02-v0-3-recovery-todo.md`
- `project/cross-workstream/folder-and-worktree-management/notes-and-status/2026-06-06-worktree-consolidation-plan-record-v1.md`

## Source Of Truth Pointers

- `project/` is the source of truth for project structure, recovery, plans, dev-facing workstream records, and architecture.
- `agent-assets/` is the source of truth for runtime-facing assets, role presets, prompts, and KB copies.
- `agent-assets/skills/` is the runtime skill root. Pilot keeps only
  `conversation-summary/` there.
- `project/local-skills/cs-swe-v0-4/` is the active SWE skill bundle for dev
  harness work.
- `project/local-skills/model-preset-maintenance/` is the dev/release model
  preset maintenance skill.
- `_archives/skills/` holds historical `cs-swe-*` shards for local comparison.
  It is gitignored and not runtime-loaded.

## Pilot Deployment And Account Skills

This worktree (`main`) carries the live v0.5 pilot web-app code. For deployment
or pilot-account tasks, prefer the local/global Alt Theory operational skills
instead of ad hoc SSH or account-file edits. Deploy archives from this tree's
`main` HEAD unless a task explicitly names another lane.

Skill source and common global copies:

```text
%LLM_THEO_ROOT%\local-skills\alt-theory-vps-deploy\
%LLM_THEO_ROOT%\local-skills\alt-theory-account-admin\
%USERPROFILE%\.codex\skills\alt-theory-vps-deploy\
%USERPROFILE%\.codex\skills\alt-theory-account-admin\
%USERPROFILE%\.agents\skills\alt-theory-vps-deploy\
%USERPROFILE%\.agents\skills\alt-theory-account-admin\
```

Use `alt-theory-vps-deploy` before changing the live VPS or `/opt/alt-theory`.
Use `alt-theory-account-admin` before creating, disabling, or inspecting pilot
accounts. Do not print root passwords, API keys, login codes, account hashes,
or raw participant transcripts.

**VPS ops notes live in ignored archives, not in architecture.** Before deploy,
restart, or 503/network diagnosis on the live pilot, read:

```text
_archives/private-evidence/2-deployment-and-operations/
  2026-06-22-vps-networking-as-is.md           # current networking as-is
  2026-06-22-cloudflared-503-mitigation-record.md
  2026-06-15-contabo-mobile-deploy/              # original deploy evidence
```

That folder is gitignored on purpose (secrets, machine-specific state). Missing
from `project/architecture/` is expected — agents must open the archive path
above instead of guessing from product docs.

## Plan-Records And Workstreams

Default workstream-local records live in:

```text
project/workstreams/{workstream}/notes-and-status/
  STATUS.md
  {YYYYMMDD}-{name}-plan-record-v{n}.md
  {YYYYMMDD}-{name}-swe-plan.md
  {YYYYMMDD}-{name}-swe-plan-items.yaml
  {YYYYMMDD}-handoff-{description}.md
```

Cross-workstream records must live inside a named cross-workstream domain. Do
not create a `notes-and-status/` container directly under `cross-workstream/`.

Current named cross-workstream domains include:

```text
project/cross-workstream/folder-and-worktree-management/notes-and-status/
project/cross-workstream/skill-cs-swe-adaptation/notes-and-status/
```

Use top-level `project/plan-records/` only for migration-level, repository-level, or legacy records.

`swe-plan` may share the same `notes-and-status/` container as plan-records, but it is still a distinct artifact type.

Project-wide durable notes live in:

- `project/compound/` for decisions, learnings, tricks, and explores
- `project/brainstorms/` for central/open brainstorm records

## Uncertainty And Questions

Do not ask the user to answer questions that can be resolved by reading local docs, codes, checking files, running safe inspection commands, or looking at prior plan-records.

When a real uncertainty remains, give 2-4 realistic best guesses or options. Avoid false binaries, extreme framings, and arbitrary parameter choices. Each option should say what evidence, framing, or assumptions supports it; and be transparent about assumptions.

If the uncertainty is high-fidelity or requiring a very complex answer:

- Inspect first. 
- If it still cannot be resolved, present a small option tree with useful branches already pruned. 
- Do not force the user to own/offer a premature/detailed solution. Instead discuss the dependencies/prerequisite/timing to resolve or re-define it.

When an assumption is needed to keep moving, state it as an assumption and prefer reversible actions.

## Reference Repositories

Reference clones should live outside OneDrive when practical. Current reference repo root:

```text
D:\reference-repo
```

Do not treat reference repos as the project source of truth. They are external inputs and comparison material.

Never move, delete, or rewrite reference repos.

## Archives And Snapshots

`_archives/` is local and ignored by Git. Use it for directly openable snapshots or backups that the user wants available in the current file tree without turning them into active tracked assets.

Current relevant local skill archive:

```text
_archives/skills/
  cs-swe-v0-3/
  cs-swe-v0-2/
  cs-swe-*-v0-2/
  cs-swe-v0-3-before-repair-1129b96/
```

## Version-Control Safety

Before broad edits, inspect branch and status with unsandboxed/escalated Git.

Codex agents must treat sandboxed Git in this linked-worktree repo as
prohibited. This is not a preference. Sandboxed Codex Git has repeatedly
created or failed to remove stale `index.lock` files under the bare Git store.
Do not "just check status" first. Do not run `git status`, `git diff`,
`git add`, `git commit`, `git worktree`, `git check-ignore`, or any other Git
command in the sandbox.

If Git is needed, request unsandboxed/escalated execution before the first Git
command. If escalation is not available, skip Git and report that instead of
trying a sandboxed command.

If an `index.lock` appears, stop all Git commands, inspect running Git
processes and the lock file with non-Git tooling, and remove only that specific
stale lock if no Git process exists. After that, continue with
unsandboxed/escalated Git only. Never alternate sandboxed and unsandboxed Git
during the same task or cleanup.

Current workflow expectation:

- `main` in this worktree is the integration line (includes merged v0.5 pilot);
- `feature/v0.5-bundle-verification` in `llm-theo-v0.5-bundle` is the active
  bundle/packaging lane; merge docs into `main`, code may stay on the bundle branch;
- `feature/v0.5-pilot-participant-system` / `llm-theo-v0.4.1-pilot` is retired;
- `feature/electron-bundle-verification` / `llm-theo-v0.3-electron` is stale code;
- create another worktree only when concurrent work needs a separate checkout,
  dependency environment, runnable state, or risk boundary.

Do not run destructive git commands or irreversible filesystem moves without explicit approval.

Prefer branch/commit checkpoints for recoverability.

Keep unrelated untracked files separate from the current task.

## Git Ignore Policy

Use `.gitignore` as a safety filter, not as the project structure rule.

Current policy:

- default to tracking normal repository source, docs, architecture, curated
  assets, config templates, and workstream records;
- ignore generated dependencies, build/cache/test output, logs, local scratch
  files, secrets, local environment files, runtime/session data, local archives,
  and private/raw research or user data;
- do not use a root-level whitelist that silently hides new valid directories;
- do not use ignore rules to hide invalid folder placement. If a file is in the
  wrong project area, move it or record the issue instead;
- before broad commits, check both `git status --short` and ignored files when
  relevant, and use `git check-ignore -v <path>` when a file expected for Git is
  missing.

The external research tree `%LLM_THEO_RESEARCH_ROOT%` has its own
Git/privacy/sync policy and may later have its own `AGENTS.md`. Do not assume
material is shareable or tracked just because another coding-agent workdir can
read it.

## Public-Branch Privacy

Treat tracked files in this dev tree as future public-branch material.

- In plan-records, acceptance reports, architecture docs, README files, and
  compound records, replace personal absolute paths with variables or
  placeholders before considering a file ready for commit.
- Keep project-internal paths when they are useful, but prefer repo-relative
  paths where practical. For machine-local paths use placeholders such as
  `%USERPROFILE%`, `%APPDATA%`, `%LOCALAPPDATA%`, `%TEMP%`,
  `%LLM_THEO_DEV_ROOT%`, `%LLM_THEO_RESEARCH_ROOT%`, `<INSTITUTION>`, or
  `<external-research-tree>`.
- Do not record plaintext keys, tokens, account identifiers, institution
  details, user names, private transcript text, or personal directory names
  unless the user explicitly says that exact detail is safe to publish.
- Evidence generated from browser/UAT, live model calls, local logs, screenshots,
  JSONL transcripts, or external folders should stay ignored by default. Track a
  sanitized summary or acceptance note instead of the raw evidence unless the
  user explicitly asks to curate and sanitize the raw artifact.
- If raw evidence should be kept privately for later local recovery, archive it
  under `_archives/private-evidence/{workstream}/{YYYYMMDD}-{slug}/` and record
  only a sanitized local archive pointer in tracked docs. See
  `project/foundation/private-evidence-policy.md`.
- Before broad commits that touch records, scan for obvious personal path and
  secret patterns such as `C:\Users\`, `%USERPROFILE%` expansions,
  institution OneDrive names, `api_key`, `token`, and local paths outside this
  repo.

## Local Development Notes

- OneDrive-synced project folders should not host active npm installs that create real `node_modules/` trees.
- Runnable dependency-heavy worktrees should stay outside OneDrive.
- See `project/foundation/local-development-rules.md`,
  `project/foundation/gitignore-policy.md`, and
  `project/foundation/private-evidence-policy.md` for the current machine, Git,
  and private evidence policy details.



