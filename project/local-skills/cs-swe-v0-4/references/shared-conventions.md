# CS-SWE v0.4 Shared Conventions

Status: active for the v0.4 action-for-reflection bundle.

## 1. Two Kinds Of Paths

Skill-internal references are relative to `cs-swe-v0-4/`.

Examples:

```text
references/shared-conventions.md
references/workflows/feature.md
tools/validate-yaml.py
```

Do not write versioned project paths for internal bundle files. A future
version should not require rewriting many internal links.

Project artifacts are different. They are files this workflow creates or reads
in the repo, such as:

```text
project/workstreams/{workstream}/notes-and-status/
project/workstreams/{workstream}/swe/features/
project/compound/
project/brainstorms/
project/architecture/
project/cross-workstream/{domain}/notes-and-status/
```

There is no generic `project/workstreams/swe/` container in the current dev
tree.

## 2. Choose Roots Before Writing

Before creating any CS-SWE artifact, choose the concrete workstream or
cross-workstream domain.

Current concrete workstreams:

```text
project/workstreams/0-backend-agent-harness/
project/workstreams/0-frontend-and-research-console/
project/workstreams/1-bundle-verification/
project/workstreams/1-eval-env-dev/
```

Workstream-local continuity records:

```text
record_root: project/workstreams/{workstream}/
record_dir:  project/workstreams/{workstream}/notes-and-status/
```

SWE artifacts:

```text
artifact_root: project/workstreams/{workstream}/swe/
```

Use `artifact_root` only when that `swe/` subfolder exists or is deliberately
created for the workstream. At the time of v0.4 creation, the backend workstream
has `swe/`; frontend, bundle verification, and eval-env-dev do not. Do not
silently create backend-style SWE artifact folders for non-backend workstreams
without a user-visible reason.

Cross-workstream records:

```text
record_root: project/cross-workstream/{domain}/
record_dir:  project/cross-workstream/{domain}/notes-and-status/
```

Do not create `project/cross-workstream/notes-and-status/` directly. Use a
named domain such as `folder-and-worktree-management` or
`skill-cs-swe-adaptation`.

## 3. Standard Artifact Paths

Relative to `{record_root}`:

```text
notes-and-status/
  STATUS.md
  YYYY-MM-DD-{slug}-plan-record-v{n}.md
  YYYY-MM-DD-{swe-plan-slug}-swe-plan.md
  YYYY-MM-DD-{swe-plan-slug}-swe-plan-items.yaml    # optional
  YYYY-MM-DD-{topic}-observation.md                 # user-requested, low-commitment
```

Relative to `{artifact_root}` when a SWE artifact root is valid:

```text
features/
  YYYY-MM-DD-{slug}/
    {slug}-intent.md
    {slug}-brainstorm.md
    {slug}-design.md
    {slug}-checklist.yaml
    {slug}-acceptance.md
issues/
  YYYY-MM-DD-{slug}/
    {slug}-report.md
    {slug}-analysis.md
    {slug}-fix-note.md
refactors/
  YYYY-MM-DD-{slug}/
    {slug}-scan.md
    {slug}-refactor-design.md
    {slug}-checklist.yaml
    {slug}-apply-notes.md
```

Project-level durable artifacts:

```text
project/compound/
  YYYY-MM-DD-{doc_type}-{slug}.md
project/brainstorms/
  YYYY-MM-DD-brainstorm-{slug}.md
project/architecture/
```

## 4. Brainstorm Naming And Anchors

Central brainstorm records are flat files:

```text
project/brainstorms/YYYY-MM-DD-brainstorm-{slug}.md
```

Use a stable, descriptive, lowercase hyphen slug. Put a natural-language anchor
in frontmatter so future agents can search by meaning even when the slug is
compressed.

Recommended frontmatter:

```yaml
doc_type: brainstorm
slug: {slug}
anchor: {stable human-readable topic anchor}
scope: central
status: active
created: YYYY-MM-DD
related_workstreams: []
tags: []
```

`anchor` should name the durable topic, not the current chat turn. Examples:
`researcher console session recovery`, `runtime asset source of truth`,
`cs-swe brainstorm routing`.

## 5. Observation Boundary

`observation` is an entry type for `notes-and-status/`, not a status and not a
SWE issue. Use it only when the user asks to record an observation or when the
current plan-record already includes an observation entry.

Observations capture discovered issues, friction, or future-update points that
should not be handled inside the current task. They do not require root cause,
fix design, or acceptance.

When an observation points from one workstream to another, prefer writing it in
the observed target's `notes-and-status/` and include `observed_from:` in
frontmatter or the opening paragraph. For genuinely cross-domain observations,
write under the relevant named cross-workstream domain.

## 6. High-Fidelity Uncertainty

The user often uses Matt Pocock's high-fidelity / grill-me language as a
generalized project heuristic, not as a wholesale import of Matt Pocock's skill
system. The local source material is:

```text
project/compound/research-candidate-skills/20260531-mattpocock-skills-report-v0.2.md
```

In this project, a high-fidelity problem means the user cannot responsibly
decide from an abstract text question alone. They need to see concrete details:
UI shape, runtime behavior, file/folder convention, exact contract, example
artifact, spec wording, or other grounded evidence.

When a decision is high-fidelity:

- do not push the user to choose from abstract options;
- do not convert uncertainty into a fake decision;
- choose a bounded explore, probe, prototype, or action-for-reflection step;
- bring the concrete result back to the current brainstorm, plan-record, or
  feature/swe-plan workflow.

This differs from classic grill-me. Grill-style questioning is useful for
low-fidelity alignment and branching. High-fidelity blockers require seeing or
making something concrete before a decision.

## 7. Compound Guard

Compound is project-level (`project/compound/`) because decisions, learnings,
tricks, and explore records are durable assets. Do not write compound artifacts
autonomously.

Agents may say "this is a compound-worthy candidate" in chat or a plan-record.
Write `project/compound/` only when the user explicitly asks for a decision,
learning, trick, or explore artifact, or when that workflow has clearly been
opened.

## 8. `project/private/`

`project/private/` is optional unsorted temporary user storage in the dev repo.
It is not a formal SWE artifact root, not an authoritative record source, and
not a place to hide active CS-SWE outputs.

If material appears there, treat it as input to classify before moving or
citing. Ask or infer whether it belongs in a workstream, central brainstorm,
compound, architecture, external research tree, or should remain unsorted.

## 9. Shared Metadata Standards

**Feature spec**: brainstorm / design / acceptance share `doc_type` /
`feature` / `status` / `summary` / `tags`. Sub-workflows add specific fields.
`status`: brainstorm = `confirmed`; design = `draft` / `approved`; acceptance
per its workflow.

**Issue spec**: report / analysis / fix-note share `doc_type` / `issue` /
`status` / `tags`. `severity` / `root_cause_type` / `path` are added per
phase.

**Archive artifacts (compound)**: learning / trick / decision / explore use
`project/compound/` only after the compound guard is satisfied.

**Writing constraint**: when describing metadata, write "extra fields" or
"phase state changes", do not re-expand the full set.

## 10. Preserved CodeStable Semantics

Feature:

```text
brainstorm or intent if needed -> design -> implementation -> acceptance
```

Issue:

```text
report -> analyze -> fix
```

Refactor:

```text
scan/design -> apply
```

Multi-feature SWE plan:

```text
swe-plan -> child feature design -> implementation -> acceptance -> optional swe-plan writeback
```

## 11. `swe-plan`

`swe-plan` is the v0.4 term for CodeStable raw `roadmap` mechanics in SWE work.

Use it for multi-feature engineering plans, shared interface/protocol
constraints, dependency tracking, and multi-agent coordination.

Do not use `roadmap` as the active SWE workflow term. In this project,
`roadmap` is broader and more long-horizon.

`items.yaml` is optional. Use it only when state/dependency/writeback tracking
is useful.

## 12. Checklist Lifecycle

- Checklist is the feature workflow's sole execution list.
- Generated by feature design after approval (`steps` + `checks`).
- Fast-forward features do not generate checklist, design, or acceptance; only
  output is `{slug}-intent.md`.
- Implementation checks items off. Acceptance reads remaining items as the
  "not yet done" gap.
- Do not create checklist for issues or refactors; they have their own
  phase-specific templates.

## 13. SWE-Plan To Feature Handoff

- `swe-plan` seeds child features in its "Child Features" section.
- Each child feature gets name, scope summary, dependencies, and optional state.
- Feature design reads the swe-plan for constraints, and does not rewrite it.
- Feature acceptance performs writeback: updates child-feature state and
  optionally marks swe-plan items done.
- Only acceptance writes back. Design and implementation never modify the
  swe-plan directly.

## 14. Phase Exit Recommendations

- Feature: brainstorm -> design -> impl -> acceptance. Each phase produces
  exactly one artifact.
- Issue: report -> analyze -> fix. Report and analysis may be one combined
  document for small bugs.
- Refactor: scan+design (may be one document) -> apply.
- swe-plan: always standalone. Child features branch off independently.
- Brainstorm/decide/learn/explore/trick/arch: each is standalone; no
  sequential phase chain.

## 15. Scoped Commit Convention

- Each phase exit is a commit point.
- Commit message format: `{workflow}: {short description}`.
- Examples: `feature: approve design for auth-module`,
  `issue: fix null pointer in parser`, `refactor: apply extract-method to
  UserService`.
- Feature acceptance gets its own commit after verification passes.
- Do not bundle multiple workflow phases in one commit.

## 16. Archive Search

- `search-yaml.py` searches YAML frontmatter fields in compound artifacts and
  any other markdown directory.
- Use `{skill_dir}\tools\search-yaml.py` with `--dir project\compound --query
  "keyword"`.
- For full-text search, use `rg` directly.
- Compound search is project-wide, not limited to a workstream.

## 17. Architecture And Requirements

`project/architecture/` describes current or accepted system structure. Planned
target structure for a multi-feature demand lives in the `swe-plan` until
accepted child features make it current.

Architecture mode `update`: write after feature acceptance confirms structural
change.

Architecture mode `check`: verify current docs match codebase, no write unless
drift is found.

Architecture mode `backfill`: create missing architecture documents from
existing codebase.

Requirements are reference material in v0.4 unless the user explicitly opens a
separate requirement workflow. Do not import CodeStable raw requirement status
machinery by default.

## 18. Reflection Triggers

These situations trigger a reflection check:

- repeated same bug pattern;
- non-obvious API behavior discovered;
- design choice with non-trivial trade-offs;
- exploration that revealed unexpected architecture;
- "I wish I had known this before" moment.

Reflection does not authorize autonomous compound writing. Surface the candidate
and wait for the user or active workflow.

## 19. Tools

Run tools by resolving the current skill folder as `{skill_dir}`:

```powershell
python {skill_dir}\tools\validate-yaml.py --file path\to\file.yaml --yaml-only
python {skill_dir}\tools\search-yaml.py --dir project\compound --query "keyword"
```

This command path is a project execution path, not an internal documentation
reference.
