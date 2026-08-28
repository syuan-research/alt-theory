---
doc_type: architecture-decision
status: current
date: 2026-07-16
architecture: [core-session-engine, branch-family-semantics]
source:
  - "Owner Decision 2026-07-16: v1-alpha sub-session substrate"
---

# Use mediated managed sessions as the child-work substrate

Related, helper, and subagent work uses real in-process managed sessions rather
than separate subprocess runtimes. Fresh and forked children may differ in seed
and framing, but they share the ordinary session substrate so persistence,
lineage, workspace policy, approvals, audit, and continuation remain available
through the same mediation path. This accepts tighter coupling to the managed
session lifecycle in exchange for avoiding an unmediated second execution
system.

## Considered alternatives

- Out-of-process Pi children were rejected because they bypassed the in-process
  security extension, approval bridge, writable-root boundary, and session
  records.
- Separate substrates for each trigger were rejected because their durable and
  security requirements were the same.

## Consequences

- A child is a durable session, not merely a background model call.
- Trigger names, seed modes, queue policy, and UI presentation may evolve
  without changing this decision.
- Child execution must not bypass the managed-session creation path.
