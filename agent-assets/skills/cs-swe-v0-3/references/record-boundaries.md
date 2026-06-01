# Record Boundaries

Use this file when deciding whether to write a CS-SWE artifact, a plan-record, a brainstorm, or an architecture note.

## Boundary Table

| Artifact | Owns | Does Not Own |
|---|---|---|
| Plan-record | session/few-session continuity, co-evolution, action-for-reflection, reframing, context recovery | feature design, checklist, acceptance, issue fix, refactor apply, child-feature state |
| `swe-plan` | multi-feature SWE decomposition, interface/protocol contracts, child feature seeds, optional dependency/state tracking | long-horizon project roadmap, current architecture, general research plan |
| Feature artifacts | single feature promise, design, implementation checklist, acceptance evidence | broad session history, unrelated bug fixes, product roadmap |
| Issue artifacts | bug report, root-cause analysis, fix note, verification | new feature scope, unrelated refactor goals |
| Refactor artifacts | behavior-preserving scan/design/apply and verification | behavior change, bug fix, new capability |
| Brainstorm | exploratory thinking, alternatives, problem/solution co-evolution input | mandatory implementation commitment or universal status tracker |
| Architecture | current/accepted system structure | future target plan before implementation |
| Requirement references | source material for capability and boundary thinking | full requirement ontology/status machine |
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
- Create a separate brainstorm when it should be independently recoverable, comparable, or attached to multiple anchors.

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
