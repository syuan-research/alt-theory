# CodeStable Source Skill Map

Status: source-reading notes for `cs-modified-v0-1`, not a full fork of CodeStable.

Source repo:

```text
https://github.com/liuzhengdongfortest/CodeStable
```

## Read In This Adaptation Pass

| Source skill/doc | Useful idea kept | Modified or deferred |
|---|---|---|
| `cs/SKILL.md` | Route open-ended work by task type instead of treating all work as coding. | Do not require `.codestable/attention.md`; do not make the root skill only a router. |
| `cs-onboard/SKILL.md` | Existing messy projects need audit + migration mapping, not blind folder moves. | Do not create the full `.codestable/` skeleton now. |
| `cs-onboard/reference/system-overview.md` | Separate capability vision, current architecture, planning, single actions, and compound learning. | Current paths remain `project/`, `evals/`, and `agent-assets/`. |
| `cs-onboard/reference/shared-conventions.md` | Do not write future plans into architecture; keep decisions/learnings discoverable; preserve superseded history. | The fixed path and filename scheme is too strong for v0.3. |
| `cs-req/SKILL.md` | Capability vision should explain user need, solution, and boundary without implementation details. | No `requirements/` directory yet; use current project docs until a real need appears. |
| `cs-arch/SKILL.md` | Architecture is current system map, evidence-based, not future target. | Use `project/architecture/`; do not require `ARCHITECTURE.md` index yet. |
| `cs-roadmap/SKILL.md` | Big needs should be split before becoming feature work; roadmap is planning, not current architecture. | Do not force interface-contract-level detail before the project is ready. |
| `cs-decide/SKILL.md` | Only settled decisions become permanent decision docs; record rationale and consequences. | For now, settled decisions can live in current docs/plan-records unless a decision index becomes necessary. |
| `cs-feat/SKILL.md` | Checkpoint between design, implementation, and acceptance prevents AI from running too far. | Do not force full feature workflow for small docs/migration tasks. |
| `cs-learn/SKILL.md` and `cs-trick/SKILL.md` | Preserve reusable pitfalls and practices separately from one-off specs. | `project/compound/` remains future unless there is concrete content worth preserving. |

## Current Local Judgment

The upstream CodeStable philosophy fits Alt Theory well: direction is not decision, roadmap is not architecture, and durable learning should survive across agents.

The upstream operational shell is too heavy for this migration moment. Its most risky assumptions for this project are:

- every workflow can depend on `.codestable/attention.md`;
- the full directory tree should exist before use;
- feature/roadmap workflow can demand fine-grained interface contracts early;
- compound decisions can become official too quickly if the user is still exploring.

Therefore v0.1 is deliberately a thin rule layer. It should reduce future-agent confusion without freezing the whole project management system.
