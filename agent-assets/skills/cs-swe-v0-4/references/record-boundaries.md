# Record Boundaries

Use this file when deciding whether to write a CS-SWE artifact, a plan-record, a brainstorm, or an architecture note.

## Boundary Table

| Artifact | Owns | Does Not Own |
|---|---|---|
| Plan-record | session/few-session continuity, co-evolution, action-for-reflection, reframing, context recovery | feature design, checklist, acceptance, issue fix, refactor apply, child-feature state |
| `swe-plan` | multi-feature SWE decomposition, interface/protocol contracts, child feature seeds, optional dependency/state tracking | long-horizon project roadmap, current architecture, general research plan |
| Feature design | feature promise, design document, checklist | implementation details, test framework, acceptance report |
| Feature implementation | code changes per checklist, completion report | design decisions, scope expansion, acceptance verification |
| Feature acceptance | verification against design, architecture/req/swe-plan writeback | new design decisions, code changes |
| Issue artifacts | bug report, root-cause analysis, fix note, verification | new feature scope, unrelated refactor goals |
| Refactor artifacts | behavior-preserving scan/design/apply and verification | behavior change, bug fix, new capability |
| Brainstorm | exploratory thinking, alternatives, problem/solution co-evolution input | mandatory implementation commitment or universal status tracker |
| Observation | user-requested `notes-and-status/` note for discovered friction, cross-domain issue, or future-update point | root-cause analysis, fix commitment, feature design, autonomous action item |
| Architecture | current/accepted system structure (update/check/backfill) | future target plan before implementation |
| Requirement references | source material for capability and boundary thinking | full requirement ontology/status machine |
| Decision | settled tech choices, constraints, conventions, architecture decisions | unsettled discussion, implementation details |
| Learning | pitfalls, best practices, knowledge from coding work | spec content, unsettled discussion |
| Explore | evidence-based code exploration records | implementation plans, design decisions |
| Trick | reusable patterns, library usage, techniques | spec content, one-time fixes |
| Compound-worthy candidate | chat or plan-record note that something may deserve decision/learning/trick/explore later | direct write to `project/compound/` without user request |
| `_archives/` | local ignored snapshots for comparison/recovery | active skill surface or Git version history |

## Routing Rules

Stable single code change:

- Use the direct CS-SWE workflow.
- No plan-record is required unless context recovery or problem evolution makes it useful.

Stable multi-feature SWE demand:

- Use `swe-plan`.
- A plan-record may explain why the plan exists, but should not duplicate child-feature state or interface contracts.

Unstable problem space:

- Use or update a plan-record first.
- If action-for-reflection stabilizes a coding demand, then create a feature artifact or `swe-plan`.

Brainstorm-like discussion:

- Keep it in plan-record when it mainly explains the current session turn.
- Create a separate central brainstorm when it should be independently recoverable, comparable, or attached to multiple anchors.
- Create a feature-local brainstorm only when an existing feature context,
  active feature workflow, or `swe-plan` child feature already anchors it.
- Treat `swe-plan` as later promotion, not a brainstorm landing path.

Observation:

- Use only when the user asks to record an observation or the current
  plan-record already includes an observation entry.
- Put it in the observed target's `notes-and-status/` where practical.
- Do not upgrade observation into a SWE issue unless the user asks to enter
  report/analyze/fix work.

Compound:

- Do not write to `project/compound/` just because something seems useful.
- Surface it as a compound-worthy candidate unless the user explicitly asks for
  decision, learning, trick, or explore output.

Architecture ideas:

- Put planned target architecture in `swe-plan`.
- Update `project/architecture/` only after implementation and acceptance make it current.

## Handoff Target

Always name the handoff target:

- session recovery;
- `swe-plan` to feature design;
- feature design to implementation;
- issue analysis to fix;
- refactor design to apply.

Generic "handoff" without a target is too ambiguous.
