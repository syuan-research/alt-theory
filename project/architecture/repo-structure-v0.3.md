# Repo Structure v0.3

Status: active draft. This records the current folder strategy; it is not a complete architecture spec.

## Current Top-Level Roles

| Path | Role | Git policy |
|---|---|---|
| `alt-theory-app/` | Current runnable app code for the backend session engine and researcher console. | Tracked. |
| `agent-assets/` | Assets read by Alt Theory or future agent/plugin runtimes: app context, soul, role presets, prompts, KB, and model config examples. | Tracked unless explicitly ignored. |
| `project/` | Project planning, architecture, foundation docs, workstream records, cross-workstream records, and migration records. | Tracked for curated project records. Private/raw research material should stay outside this dev repo unless explicitly reviewed. |
| `references-to-legacy-materials/` | Curated pointers or retained legacy material that should not be treated as active architecture. | Tracked only when intentionally selected. |
| external research tree | Bulk academic research notes, simulated-user/evaluation material, and private research artifacts. Current candidate: `<external-research-tree>`. | Outside this repo; likely private Git or disk/OneDrive sync. |
| `node_modules/` | Local generated dependency tree. | Ignored. Only use outside OneDrive runnable worktrees. |

## Harness Instructions vs Alt Theory Runtime Instructions

There are two different instruction layers.

### Development Harness Layer

Root-level files such as `AGENTS.md` and `CLAUDE.md` are for tools that develop this repository, such as Codex, Claude Code, OpenCode, and similar harnesses.

They should explain how to work in this repo. They are not the Alt Theory runtime personality.

### Alt Theory Runtime Layer

Alt Theory itself also needs agent-facing instructions. Those belong under `agent-assets/`.

Current direction after the 2026-06-08 agent-asset loading repair:

```text
agent-assets/
  ALTTHEORY.md           # app/session context loaded by runtime sessions
  soul/                 # selectable personality / stance seeds
  role-presets/          # selectable agent role/style/behavior presets
  prompts/pi/           # Pi adapter prompt templates
  kb/ep-core/           # current centralized KB copy
  kb/metadata/          # KB domain metadata and prompt-use policy
  models.example.json   # uncredentialed provider/model config example
```

The previous `agent-assets/runtime/pi-tui/` duplicate runtime context has been
removed. Backend code now uses the centralized asset layout above.

The old `agent/agent.md` is a mixed legacy runtime-agent document. It should eventually be split by content:

- personality, stance, worldview, boundaries -> `agent-assets/soul/`;
- application/session context and filesystem/runtime framing ->
  `agent-assets/ALTTHEORY.md`;
- agent role/style/behavior presets -> `agent-assets/role-presets/`.

Do not merge old `agent/agent.md` into root `AGENTS.md` or root `CLAUDE.md`. Those root files are for development harnesses.

Future `memory.md` / `user.md` alignment with Hermes/OpenClaw is intentionally deferred. The pattern is relevant and mainstream enough to keep in view, but v0.3 does not need to lock a full memory injection system before the runtime needs it.

## Evaluation And Research Area

Evaluation remains first-class because it will drive product direction before
conference/user testing. The storage boundary changed on 2026-06-08:

Current dev-repo structure:

```text
project/workstreams/1-eval-env/
  README.md
  notes-and-status/
```

`1-eval-env` is evaluation environment and harness development. Evaluation
corpora, simulated-user material, broad academic research notes, and raw/private
data belong outside this dev repo unless deliberately curated back in.

Important priority note: evaluation is not a minor future appendix. Before the
conference-oriented phase, sim-user testing, LLM-as-judge evaluation,
evaluation-plan iteration, and human/friend testing are likely to become one of
the heaviest work areas. The dev repo keeps only the engineering surface needed
to support that work.

Raw dialogue, friend testing data, human-subject data, or identifiable transcripts should not be tracked by Git by default.

External research storage needs its own privacy/Git/sync policy. Do not assume
material outside this repo is shareable just because a development worktree
points at it.

## External Clones, Skills, And Plugins

External cloned repos should not be mixed into the main project by accident.

Common cases:

- External reference repos, such as CodeStable, agent-brain, pi-gui, or knowledge-rag, should be recorded in a curated reference index when needed.
- Active dependency-heavy clones that need package install/build/test output should live outside OneDrive when possible.
- Project-scoped dev skills live in `project/local-skills/` when harnesses need
  to read them directly. Runtime-loaded pilot skills stay in
  `agent-assets/skills/` only. Historical skill shards archive to local
  ignored `_archives/skills/`.
- Heavy skills/plugins should be treated like active dev clones, or reduced to curated/adapted skill files before entering the project.

For now, do not use Git submodules. They pin another Git repository inside this one, but add clone/update/version-management complexity that is not worth it while the project structure is still evolving.

## KB / RAG Priority

Native file search is currently good enough for the next conference-oriented phase. RAG and KB regeneration are fallback/contingency topics, not current blockers.

Do not rebuild KB or design a PDF extraction pipeline unless evaluation shows KB quality is materially blocking useful performance.

Current mapping:

- KB runtime copy: `agent-assets/kb/ep-core/`;
- KB domain metadata / prompt-use policy: `agent-assets/kb/metadata/`;
- RAG design/reference: `project/architecture/` or `project/workstreams/kb-search/` when copied;
- RAG code/package may remain optional/fallback.

## Legacy Migration Policy

Legacy migration is not folder mirroring.

Use `project/foundation/legacy-index.md` to decide whether a legacy file should be:

- copied;
- indexed only;
- deferred;
- excluded;
- reviewed for privacy.

Copy batches should be small and committed separately. Imported files should be marked as imported references unless they have been actively revised into current docs.

Future migration should be demand-driven rather than a fixed "Stage 5". When a later frontend, backend, or evaluation agent needs old material, use the legacy index to locate the relevant source, copy or summarize only the useful part, and record why it belongs in the new structure.

## CodeStable-Style Layer

Do not create a full `.codestable/` skeleton yet.

The current adapted split is:

- `project/architecture/`: current structure, runtime architecture, and architecture rationale;
- `project/plan-records/`: migration-level, repository-level, or legacy plan-records;
- `project/workstreams/`: active or near-active streams that may involve code, research, or evaluation;
- `project/workstreams/{workstream}/notes-and-status/`: ordinary workstream-local plan-records, status files, handoffs, and `swe-plan` records;
- `project/foundation/`: durable origin, principles, and legacy orientation;
- `project/foundation/legacy-index.md`: finding aid and migration triage for old materials;
- `project/cross-workstream/`: coordination records that genuinely span multiple workstreams.

Do not create a generic `project/workstreams/swe/` container. When code work
becomes active, place its records in the concrete backend, frontend, packaging,
evaluation implementation, or other named workstream.

This borrows the useful CodeStable distinction between architecture, roadmap/plan, decisions, and compound learning without adopting its whole process before the local workflow stabilizes.


