# Refactor Workflow

Use only for behavior-preserving cleanup, restructuring, or technical-debt reduction.

If behavior changes, route to feature or issue.

## Flow

```text
scan -> design -> apply
```

Fast path can be used only for very small, obvious, behavior-preserving cleanup with clear verification.

## Paths

```text
{artifact_root}/refactors/YYYY-MM-DD-{slug}/
  {slug}-scan.md
  {slug}-refactor-design.md
  {slug}-checklist.yaml
  {slug}-apply-notes.md
```

## Scan

Before proposing changes, identify:

- target files/modules;
- current responsibilities;
- concrete smell or maintenance risk;
- why this is behavior-preserving;
- what should not be changed.

Common scan categories:

- oversized file;
- mixed responsibilities;
- duplicated logic;
- unclear ownership;
- directory flattening;
- naming/placement mismatch;
- fragile special-case branches.

## Design

The design must state:

- selected scan items;
- exact refactor method;
- files/directories moved or split;
- public behavior that must remain unchanged;
- verification plan;
- rollback signal.

Do not use refactor design to sneak in a new capability.

## Apply

- Execute in small steps.
- Keep behavior checks close to each step.
- Stop if a step requires semantic changes not approved in the design.
- Record actual changes in apply notes.

## Acceptance

Acceptance requires:

- behavior-preserving evidence;
- tests/build/manual checks as relevant;
- no new feature behavior;
- no unrelated bug fix;
- notes on future feature/issue work discovered during the refactor.
