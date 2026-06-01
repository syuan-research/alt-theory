# CS-SWE Shared Conventions

Status: active for `cs-swe-v0-2`.

This is a SWE-only rewrite of CodeStable's shared conventions for Alt Theory v0.3. It intentionally keeps CodeStable's engineering discipline while changing paths and deferring non-SWE workflows.

## Paths

```text
project/workstreams/swe/
  brainstorms/
    {slug}/
      brainstorm.md
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
  compound/
    YYYY-MM-DD-{doc_type}-{slug}.md
```

Shared references and tools:

```text
agent-assets/skills/cs-swe-v0-2/references/
agent-assets/skills/cs-swe-v0-2/tools/
```

Architecture:

```text
project/architecture/
```

Do not create `.codestable/` for this adaptation.

## Preserved CodeStable Semantics

Feature flow:

```text
brainstorm/intent when needed -> design -> impl -> accept
```

Issue flow:

```text
report -> analyze -> fix
```

Refactor flow:

```text
scan/design -> apply
```

Compound engineering memory:

```text
learning | trick | decision | explore
```

Only use compound records for engineering knowledge that arose from code work and is worth reusing.

## Deferred Upstream Handoffs

CodeStable raw references some workflows that are not ported in v0.2:

- `requirement observation (deferred in v0.2)`
- `roadmap/workstream observation (deferred in v0.2)`
- `project-architecture-update`
- `decision observation (deferred in v0.2)`
- `engineering learning observation (deferred in v0.2)`
- `engineering trick observation (deferred in v0.2)`
- `startup-context update observation`
- `guide update observation (deferred in v0.2)`
- `API/libdoc observation (deferred in v0.2)`
- `CS-SWE startup setup`

When copied workflow text points to one of these:

- do not pretend the workflow exists;
- preserve the underlying intent;
- write an observation in the current SWE artifact;
- update current project docs only if the task actually changed them;
- ask before creating new durable process areas.

Recommended replacements:

| Raw handoff intent | v0.2 handling |
|---|---|
| Requirement / capability vision | Record in feature design or plan-record; do not create requirements docs by default. |
| Roadmap item status | If no CS-SWE roadmap artifact exists, record in the workstream brief or plan-record. |
| Architecture update | Update `project/architecture/` only for current implemented architecture, not future plans. |
| Decision / convention | Record as an observation or `project/workstreams/swe/compound/` entry only after the user agrees it is settled. |
| Learning / trick | Record only if it is reusable engineering knowledge, not a one-off note. |
| Attention/note | Update `startup-context.md` only after user confirmation. |

## Core SWE Guardrails

- Minimal change: implement only what the current feature/issue/refactor requires.
- Scope separation: do not mix features, bug fixes, and refactors without explicit approval.
- Evidence before confidence: cite code paths, tests, or runtime checks when claiming behavior.
- No hidden decisions: if the design does not decide something important, stop and revise it.
- Acceptance is independent: verify against the design/report promise, not only against tests.
- Side discoveries become observations, not silent code changes.

## Reflection Triggers

Stop and reassess when:

- adding code to an already large file;
- adding another method to a class that is becoming a catch-all;
- writing a function that does multiple things;
- adding a special-case branch;
- copy-pasting logic;
- adding a fourth or later parameter;
- creating a generic helper because no obvious owner exists.

If the fix is behavior-preserving and necessary, make it an explicit step. If it changes architecture or behavior, split it into a refactor or future issue unless the user approves including it now.

## Validation Commands

Use the bundled tools:

```powershell
python agent-assets\skills\cs-swe-v0-2\tools\validate-yaml.py --file path\to\file.yaml --yaml-only
python agent-assets\skills\cs-swe-v0-2\tools\search-yaml.py --dir project\workstreams\swe\compound --query "keyword"
```

Do not run directory-wide YAML validation on mixed Markdown directories unless you know every Markdown file has valid frontmatter.






