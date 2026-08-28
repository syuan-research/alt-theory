---
doc_type: architecture-decision
status: current
date: 2026-07-21
architecture: [session-import-adapters]
source:
  - "Owner Decision 2026-07-21: cross-harness current-tip import"
---

# Import external sessions through deterministic, loss-explicit projection

Alt Theory imports persisted conversations through source-specific,
deterministic adapters that create ordinary Pi sessions. Each import preserves
source evidence and provenance, labels transformations, and refuses or reports
elements that cannot be represented safely instead of silently deleting or
inventing history. The current product projects the source conversation's
current continuation state; that is an implemented scope, not a permanent ban
on future branch or older-tip support.

## Considered alternatives

- Requiring a live source harness was rejected because persisted source data is
  sufficient for the supported adapters and would make import less recoverable.
- Using an agent to interpret every source session remains a labelled fallback,
  not the faithful path, because it weakens determinism.
- Pretending generated Pi ancestry reproduces source-native history was rejected;
  provenance and declared transformation are more truthful.

## Consequences

- Imported sessions continue through the ordinary session registration and
  runtime paths.
- Raw source retention is not presented as model-visible context; verification
  checks the actual projected Pi context.
- New source formats must declare loss or refuse unsupported content rather than
  silently omit it.
