# CS-SWE v0.3 Shared Conventions

Status: active for this skill bundle.

## 1. Two Kinds Of Paths

Skill-internal references are relative to `cs-swe-v0-3/`.

Examples:

```text
references/shared-conventions.md
references/workflows/feature.md
tools/validate-yaml.py
```

Do not write versioned project paths for internal bundle files. A future version should not require rewriting many internal links.

Project artifacts are different. They are files this workflow creates or reads in the repo, such as:

```text
project/workstreams/swe/features/
project/workstreams/swe/plans/
project/architecture/
```

## 2. Artifact Root

Pick one artifact root before creating SWE artifacts.

Default current SWE root:

```text
project/workstreams/swe/
```

Domain workstream root, when the user or project already separates a lane:

```text
project/workstreams/{workstream}/swe/
```

Older `track` and current `workstream` are equivalent container-level concepts in this project. Use `workstream` in v0.3 files.

## 3. Standard Project Artifact Paths

Relative to `{artifact_root}`:

```text
plans/
  {swe-plan-slug}/
    {swe-plan-slug}-swe-plan.md
    {swe-plan-slug}-items.yaml    # optional
    drafts/                       # optional
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
compound/
  YYYY-MM-DD-{doc_type}-{slug}.md
```

## 4. Preserved CodeStable Semantics

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

## 5. `swe-plan`

`swe-plan` is the v0.3 term for CodeStable raw `roadmap` mechanics in SWE work.

Use it for multi-feature engineering plans, shared interface/protocol constraints, dependency tracking, and multi-agent coordination.

Do not use `roadmap` as the active SWE workflow term. In this project, `roadmap` is broader and more long-horizon.

`items.yaml` is optional. Use it only when state/dependency/writeback tracking is useful.

## 6. Architecture And Requirements

`project/architecture/` describes current or accepted system structure. Planned target structure for a multi-feature demand lives in the `swe-plan` until accepted child features make it current.

Requirements are reference material in v0.3 unless the user explicitly opens a separate requirement workflow. Do not import CodeStable raw requirement status machinery by default.

## 7. Tools

Run tools by resolving the current skill folder as `{skill_dir}`:

```powershell
python {skill_dir}\tools\validate-yaml.py --file path\to\file.yaml --yaml-only
python {skill_dir}\tools\search-yaml.py --dir project\workstreams\swe\compound --query "keyword"
```

This command path is a project execution path, not an internal documentation reference.
