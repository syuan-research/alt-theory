# Alt Theory Version Reference

Status: retrospective reference, not a full roadmap system.

This file gives the current `rd` version labels enough evidence to be useful
in later roadmap writing. It deliberately separates retrospective product
labels from historical Git tags and from older Dify-internal names.

## Path Placeholders

Use these placeholders in public-branch-safe records:

| Placeholder | Meaning |
|---|---|
| `%LLM_THEO_V0_2_ROOT%` | Preserved v0.2-era checkout and shared Git repository metadata. |
| `%LLM_THEO_DEV_ROOT%` | Current v0.3 development checkout. |

Do not replace these with personal absolute paths in tracked docs.

## Version Table

| Version label | Status | Main implementation line | What this label means | Evidence |
|---|---|---|---|---|
| `v0.1-rd` | Retrospective historical label | Dify workflow line | Workflow-based Alt Theory before the standalone Pi app. It used Dify workflow routing, Dify prompt variables, and Dify-managed dataset/retrieval behavior. | `%LLM_THEO_V0_2_ROOT%/resources/Alt Theory v0.4 (Dify) Description.md`; `%LLM_THEO_V0_2_ROOT%/resources/Alt Theory v0.4.yml`; `%LLM_THEO_V0_2_ROOT%/_dev/approaches/migrate-dify-prompts/`; `%LLM_THEO_V0_2_ROOT%/_dev/memory-and-rules/project-status/project-status_20260314.md`. |
| `v0.2-rd` | Retrospective historical label | Preserved v0.2 Git repo on `main` | Complete runnable program line before the v0.3 reorganization. It is not just a spec. It contains the Pi-based Alt Theory app, Express/WebSocket server, browser frontend, KB/profile switching, runtime prompts/assets, and the RAG/KB migration work. | `git -C %LLM_THEO_V0_2_ROOT% status --short --branch` showed `main...origin/main`; `git -C %LLM_THEO_V0_2_ROOT% remote -v` showed a GitHub `origin` fetch/push remote; `%LLM_THEO_V0_2_ROOT%/package.json`; `%LLM_THEO_V0_2_ROOT%/alt-theory-app/core/alt-theory-core.ts`; `%LLM_THEO_V0_2_ROOT%/alt-theory-app/web-server/server.ts`; `%LLM_THEO_V0_2_ROOT%/_dev/approaches/migrate-to-agent-harness-architecture/`; `%LLM_THEO_V0_2_ROOT%/_dev/approaches/feature-rag-and-knowledge-base/`; `%LLM_THEO_V0_2_ROOT%/alt-theory-rag/`. |
| `v0.3.0-rd` | Current dev baseline tag | `%LLM_THEO_DEV_ROOT%`, branch `reorg/v0.3-dev-run` | Researcher/developer v0.3 baseline after the clean dev-tree reorganization and backend harness closeout documentation. It anchors the current public-branch-safe dev structure, runtime-facing `agent-assets/`, foundation privacy docs, backend harness records, launch/run guidance, and private-evidence policy. | Git tag `v0.3.0-rd` at commit `4c923dc` (`docs: record backend harness closeout observations`); `%LLM_THEO_DEV_ROOT%/AGENTS.md`; `%LLM_THEO_DEV_ROOT%/project/README.md`; `%LLM_THEO_DEV_ROOT%/project/architecture/repo-structure-v0.3.md`; `%LLM_THEO_DEV_ROOT%/project/foundation/private-evidence-policy.md`; `%LLM_THEO_DEV_ROOT%/project/compound/2026-06-09-learning-backend-test-ladder-and-runtime-env.md`; `%LLM_THEO_DEV_ROOT%/project/workstreams/0-backend-agent-harness/README.md`. |
| `v0.3.1-rd` | Current dev patch tag | `%LLM_THEO_DEV_ROOT%`, branch `reorg/v0.3-dev-run` | UAT-enabling patch on top of `v0.3.0-rd`. It adds resource discovery controls for clean/internal/dev-debug runs and adds frontend resume transcript delivery so a resumed session can show prior messages instead of opening visually empty. | Git tag `v0.3.1-rd` at commit `9a4c0dc` (`feature: add UAT resource controls and resume transcript`); `%LLM_THEO_DEV_ROOT%/alt-theory-app/core/alt-theory-core.ts`; `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/server.ts`; `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/websocket-protocol.ts`; `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/public/client.js`; `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/backend-server.test.ts`. |
| `v0.3.2-rd` | Current dev patch tag | `%LLM_THEO_DEV_ROOT%`, branch `reorg/v0.3-dev-run` | Resume fidelity patch. It preserves resumed tool-call summaries, avoids rendering raw tool output as assistant text, and reuses the same frontend tool-label logic for resumed and live conversations. | Git tag `v0.3.2-rd` at commit `1504740` (`fix: preserve resumed tool call summaries`); `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/server.ts`; `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/public/client.js`; `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/backend-server.test.ts`. |
| `v0.3.3-rd` | Current dev patch tag | `%LLM_THEO_DEV_ROOT%`, branch `reorg/v0.3-dev-run` | Alt-only UAT prompt patch. It adds prompt mode control so Alt Theory can replace Pi's built-in coding-assistant identity, removes redundant left-sidebar session status, and treats user interruption as interrupted rather than failed. | Git tag `v0.3.3-rd` at commit `80221ed` (`fix: add alt-only prompt mode for UAT`); `%LLM_THEO_DEV_ROOT%/alt-theory-app/core/alt-theory-core.ts`; `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/public/client.js`; `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/backend-server.test.ts`; ignored local launch docs under `%LLM_THEO_DEV_ROOT%/runs/`. |
| `v0.3.4-rd` | Current dev patch tag | `%LLM_THEO_DEV_ROOT%`, branch `reorg/v0.3-dev-run` | Write-boundary patch. It keeps the write tool available for session notes and temporary draft assets while enforcing writable roots: the session write directory and `runs/local-assets/`. It also documents the Pi harness as the tool runtime without restoring Pi as the model identity. | Git tag `v0.3.4-rd` at commit `1867919` (`fix: guard write tool roots`); `%LLM_THEO_DEV_ROOT%/alt-theory-app/core/alt-theory-core.ts`; `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/public/client.js`; `%LLM_THEO_DEV_ROOT%/alt-theory-app/web-server/backend-server.test.ts`; ignored local run guidance under `%LLM_THEO_DEV_ROOT%/runs/README.md`. |

No `v0.4-rd` label is assigned yet. The current work is still in the
researcher/developer v0.3 line.

## Historical Name Mapping

The older repository contains names that should not be copied directly into the
new `rd` roadmap labels:

- The old Dify artifact calls itself `Alt Theory v0.4`. In this retrospective
  `rd` reference, that Dify workflow line is treated as `v0.1-rd` because it is
  the pre-standalone baseline for the current product history.
- The preserved v0.2 Git repo currently has a historical tag named `v0.1.0` on
  its `main` commit. That tag is real Git history, but it is not the same thing
  as the retrospective `v0.1-rd` product label.
- The `v0.3-integration` tag in the preserved repo records the RAG integration
  milestone. It is component evidence for the v0.2-era system, not a claim that
  the whole product line was already the current `v0.3-rd`.
- The `v0.3.x-rd` labels are current researcher/developer labels on the dev
  integration line.

## Evidence Notes

### Dify line

The Dify evidence is strong enough for a `v0.1-rd` retrospective label:

- `resources/Alt Theory v0.4 (Dify) Description.md` describes a
  workflow-based Alt Theory system built on Dify with query classification and
  routing pipelines.
- `resources/Alt Theory v0.4.yml` is a Dify workflow export using Dify system
  variables and workflow nodes.
- `_dev/approaches/migrate-dify-prompts/` preserves the migration work from
  Dify prompts into the later agent/runtime system.
- project status files from March 2026 explicitly frame the work as migration
  from Dify v0.4.

Uncertainty: the old Dify-internal `v0.4` name predates this retrospective
`rd` version scheme. The `v0.1-rd` mapping is a roadmap convention, not a
historical rename of the Dify artifact.

### v0.2 program line

The v0.2 evidence is not only documents or specs:

- `package.json` includes the Pi packages, Express, WebSocket, and dotenv
  dependencies used by the runnable app.
- `alt-theory-app/core/alt-theory-core.ts` defines the core session layer,
  system-prompt assembly, profile/KB binding, and tool selection.
- `alt-theory-app/web-server/server.ts` defines an Express + WebSocket backend
  that bridges browser messages to PI SDK agent sessions.
- `alt-theory-app/web-server/public/` contains the browser frontend.
- `_dev/approaches/migrate-to-agent-harness-architecture/` records the PI
  runtime decision and fullstack MVP direction.
- `_dev/approaches/feature-rag-and-knowledge-base/` and `alt-theory-rag/`
  record the KB/RAG migration work, including the `v0.3-integration` RAG
  milestone.
- The Git checkout is on `main` tracking `origin/main`; the remote URL is
  intentionally omitted here because tracked public docs should not expose
  account identifiers.

### v0.3 researcher/developer line

The v0.3 line is the cleaned, current development lane outside the synced
historical checkout:

- `project/architecture/repo-structure-v0.3.md` defines the active top-level
  roles for `alt-theory-app/`, `agent-assets/`, and `project/`.
- `AGENTS.md` and `project/README.md` define the current dev harness rules,
  public-branch privacy expectations, and adapted CS-SWE workflow.
- `project/foundation/private-evidence-policy.md` defines the private evidence
  storage rule so raw UAT/browser/model output does not scatter across the
  repo.
- `v0.3.0-rd` is the clean baseline tag after backend harness closeout records.
- `v0.3.1-rd` through `v0.3.4-rd` are patch tags for UAT blockers and testing
  affordances: resource-discovery control, resume transcript fidelity,
  alt-only prompt mode, and guarded write roots.

## Naming Rule For Now

Use `rd` for researcher/developer versions.

Patch-level changes inside the current researcher/developer line should bump
the third number, for example `v0.3.1-rd` after `v0.3.0-rd`.

Do not create `v0.4-rd` until there is a deliberate product-level boundary
larger than a UAT/dev patch. A future `v0.4-rd` would need its own short
boundary statement and evidence, rather than being inferred from normal v0.3
feature accumulation.
