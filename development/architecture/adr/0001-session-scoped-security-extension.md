---
doc_type: architecture-decision
status: current
date: 2026-07-15
architecture: [core-session-engine]
source:
  - "Owner Decision 2026-07-15: v1-alpha security extension evaluation"
---

# Use Pi-native interception with Alt-owned session boundaries

Alt Theory mediates agent tool calls through Pi's native extension hook while
owning the security boundary around it: each managed session supplies its own
read/write roots, approval state, and audit sink. The implementation vendors
useful policy tables rather than depending on a third-party package or building
a general security framework, because the evaluated packages supplied useful
policy content but could not correctly express Alt Theory's per-session,
cross-platform workspace boundary.

## Considered alternatives

- Depending directly on an evaluated Pi security package was rejected because
  its global or incorrect path model did not enforce session-owned roots.
- A new Alt Theory security framework or OS sandbox was rejected as unnecessary
  for the product target; Pi interception already supplies the enforcement hook.

## Consequences

- Root containment and approval/audit state remain Alt Theory responsibilities.
- Policy checks are guard rails, not an OS sandbox, and must be described that
  way to users.
- Every managed session, including mediated child sessions, must enter through
  the path that binds the security extension and approval UI.
