# Session Metrics And Introspection Acceptance Report

> Stage: Stage 3 (Acceptance)
> Acceptance date: 2026-06-07

## 1. Interface Contract Verification

- [x] Metadata and metrics use WebSocket messages only.
- [x] `SessionMetrics` contains Alt Theory counters and Pi token/cost/context
  statistics.
- [x] Metric snapshots use atomic JSON persistence.

## 2. Behavior And Decision Verification

- [x] Creation pushes metadata and zero metrics.
- [x] Explicit metadata/metrics requests return connection-local values.
- [x] Successful `agent_end` is wired to increment, persist, and push metrics.
- [x] Failed tool calls count at `tool_execution_end`.

## 3. Acceptance Scenario Verification

Automated integration verified creation pushes and request responses for two
connections. Pure tests verified Pi-stat mapping and exact persisted JSON.

The live one-turn smoke was not executed because the execution policy rejected
sending private-workspace-derived session context to an external model
provider. Therefore the real provider `agent_end` path remains code-reviewed
and locally wired, not externally exercised in this acceptance.

## 4. Terminology Consistency

`messageCount`, `turnCount`, and `toolCallCount` follow the definitions in the
revised SWE-plan. `tokens` and `contextUsage` retain Pi field meanings.

## 5. Architecture Merge

Merged into `project/architecture/core-session-engine.md` as part of whole-plan
acceptance.

## 6. Requirement Writeback

No separate requirement document. User-facing metric needs remain traced by the
SWE-plan coverage table.

## 7. SWE-Plan Writeback

F6 and all other backend-v2 items are marked done. The main SWE-plan is marked
completed with implementation deviations recorded.

## 8. Attention Candidate Review

`tsx` needs permission to spawn its local esbuild helper in the managed
environment. This remains an environment note in the implementation report.

## 9. Leftovers

- Run `npm run smoke:backend` only when the user explicitly approves sending a
  minimal live prompt to the configured external provider.
- Frontend consumption of discovery and introspection remains a separate
  workstream.
