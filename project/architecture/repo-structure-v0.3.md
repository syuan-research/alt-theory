# Repo Structure v0.3

Status: active draft. This records the current folder strategy; it is not a complete architecture spec.

## Current Top-Level Roles

| Path | Role | Git policy |
|---|---|---|
| `apps/` | Runnable app code. Current app: `apps/alt-theory/`. | Tracked. |
| `agent-assets/` | Assets read by Alt Theory or future agent/plugin runtimes: prompts, KB, runtime context, profiles, future soul/instructions. | Tracked unless explicitly ignored. |
| `project/` | Project planning, architecture, foundation docs, workstream records, research notes, migration records. | Explicit whitelist. Only named files/subtrees are tracked. `project/private/` is ignored. |
| `evals/` | Evaluation planning and adopted evaluation materials for Alt Theory. Lightweight for now. | Explicit whitelist. Only current entry files are tracked. Raw/private data areas are ignored. |
| `references/` | Legacy or external references that are useful but not current source-of-truth. | Tracked for curated markdown only. |
| `node_modules/` | Local generated dependency tree. | Ignored. Only use outside OneDrive runnable worktrees. |

## Harness Instructions vs Alt Theory Runtime Instructions

There are two different instruction layers.

### Development Harness Layer

Root-level files such as `AGENTS.md` and `CLAUDE.md` are for tools that develop this repository, such as Codex, Claude Code, OpenCode, and similar harnesses.

They should explain how to work in this repo. They are not the Alt Theory runtime personality.

### Alt Theory Runtime Layer

Alt Theory itself also needs agent-facing instructions. Those belong under `agent-assets/`.

Current direction:

```text
agent-assets/
  profiles/default.md   # transitional lightweight agent profile
  soul.md               # future durable personality / stance
  AGENTS.md             # future Alt Theory runtime working instructions
```

The old `agent/agent.md` is a mixed legacy runtime-agent document. It should eventually be split by content:

- personality, stance, worldview, boundaries -> `agent-assets/soul.md`;
- project-specific runtime behavior, methods, and operating instructions -> `agent-assets/AGENTS.md`.

Do not merge old `agent/agent.md` into root `AGENTS.md` or root `CLAUDE.md`. Those root files are for development harnesses.

Future `memory.md` / `user.md` alignment with Hermes/OpenClaw is intentionally deferred. The pattern is relevant and mainstream enough to keep in view, but v0.3 does not need to lock a full memory injection system before the runtime needs it.

## Evaluation Area

`evals/` is a first-class project area because evaluation will drive product direction before conference/user testing.

Current lightweight structure:

```text
evals/
  README.md
  eval-framework-origin-20260304.md
```

Do not create detailed subdirectories until they are needed. Possible future areas include simulated users, LLM-as-judge rubrics, automated/headless harnesses, user-study protocols, reports, and raw data handling.

Important priority note: evaluation is not a minor future appendix. Before the conference-oriented phase, sim-user testing, LLM-as-judge evaluation, evaluation-plan iteration, and human/friend testing are likely to become one of the heaviest work areas. The current lightweight `evals/` shape is deliberately small because the testing method is still evolving with new literature and benchmark research, not because evaluation is low priority.

Raw dialogue, friend testing data, human-subject data, or identifiable transcripts should not be tracked by Git by default.

Current ignore policy:

```text
project/private/
evals/raw-data/
evals/runs/raw/
```

These locations may exist locally, but contents should remain private unless explicitly reviewed and anonymized. The repo uses whitelist-style tracking, so new project/eval files should not be assumed tracked just because they are under `project/` or `evals/`.

## External Clones, Skills, And Plugins

External cloned repos should not be mixed into the main project by accident.

Common cases:

- External reference repos, such as CodeStable, agent-brain, pi-gui, or knowledge-rag, are recorded in `references/external-index.md`.
- Active dependency-heavy clones that need package install/build/test output should live outside OneDrive when possible.
- Project-scoped skills/plugins can live inside the project when local harnesses need to read them directly. This is acceptable when they are mostly markdown/text and do not create heavy dependency trees.
- Heavy skills/plugins should be treated like active dev clones, or reduced to curated/adapted skill files before entering the project.

For now, do not use Git submodules. They pin another Git repository inside this one, but add clone/update/version-management complexity that is not worth it while the project structure is still evolving.

## KB / RAG Priority

Native file search is currently good enough for the next conference-oriented phase. RAG and KB regeneration are fallback/contingency topics, not current blockers.

Do not rebuild KB or design a PDF extraction pipeline unless evaluation shows KB quality is materially blocking useful performance.

Current mapping:

- KB runtime copy: `agent-assets/kb/ep-core/`;
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
- `project/plan-records/`: short-term or few-session living plans;
- `project/workstreams/`: active or near-active streams that may involve code, research, or evaluation;
- `project/foundation/`: durable origin, principles, and legacy orientation;
- `project/foundation/legacy-index.md`: finding aid and migration triage for old materials;
- `project/workstreams/parallel-development-brief.md`: high-level brief for parallel agents.

This borrows the useful CodeStable distinction between architecture, roadmap/plan, decisions, and compound learning without adopting its whole process before the local workflow stabilizes.
