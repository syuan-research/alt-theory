---
doc_type: decision
category: architecture
date: 2026-07-03
slug: v0-6-ab-fallback-agent-boundary
status: active
area: backend agent harness / research UX / Pi ecosystem
tags: [v0-6, ab-test, model-fallback, pi, subagent, multi-agent]
---

# v0.6 A/B, Fallback, And Agent Boundary

## Context

v0.6 has two substantive new research capabilities:

- compare multiple candidate replies for the same user turn;
- support subagent / multi-agent workflows without drifting away from Pi's
  extension and package ecosystem.

Model fallback is also important for online users. Online use mostly studies
real scenarios and observed reply quality, not strict per-session attachment to
one exact LLM.

## Sequencing

Do the Pi subagent / multi-agent route selection before implementing A/B
execution records. The A/B record model should fit the selected plugin's
runtime shape instead of forcing an Alt Theory-only execution model first.

Until that route is selected, A/B only has three fixed requirements:

- record each candidate's actual runtime configuration;
- record each candidate's output reference and status;
- record user choice and optional per-candidate scores as session-attached
  research evidence.

## Decisions

### Model Fallback

- Fallback is a real online reliability feature, not merely an internal patch.
- The backend must not hard-code provider, model-family, or candidate-order
  restrictions. Candidate order and cross-provider behavior are configuration.
- The backend executes the configured fallback policy, stops on configured
  limits, and records the original model, actual model, provider, reason chain,
  timestamp, and failure path.
- Any future restriction such as same-provider-only fallback is not an existing
  user decision unless explicitly decided later.

### A/B Candidate Replies

- A/B means a user can compare two or more replies for the same prompt, choose
  the better reply, and optionally score each side.
- Candidate replies may differ by role, prompt, model, provider, KB, custom
  instruction, or any configured runtime layer. The backend must not assume
  "only the model differs."
- Choice and score records are session-attached research records, not a reason
  to change session identity or rebuild session management.
- Minimum backend record shape is intentionally not final until the Pi
  subagent/plugin route is selected. Do not implement an Alt Theory-specific
  A/B runner before that.

### A/B Triggering

The backend should support these trigger classes without forcing a UI shape:

- configured session/project/user-condition trigger;
- single-turn backend trigger;
- rule trigger such as role, KB domain, user group, turn number, or keyword.

The UI entry is undecided. It may be a research-tools area, folded menu,
experiment control, or another surface. Do not bake "A/B button" into the
architecture.

### Pi / Subagent / Multi-Agent Boundary

Evidence checked 2026-07-03:

- Pi core is intentionally minimal and does not ship built-in sub-agents or
  plan mode by default, but it explicitly supports TypeScript extensions,
  skills, prompt templates, themes, packages, JSON/RPC modes, and SDK embedding.
- Pi's own installed package includes an `examples/extensions/subagent/`
  extension that runs each subagent in a separate `pi` process, supports
  single/parallel/chain modes, streaming output, and usage tracking.
- Pi's public package catalog includes `pi-sub-agent`, a package extension that
  adds a `subagent` tool. Its package page says it runs delegated tasks in
  separate `pi --mode json -p --no-session` subprocesses, supports single,
  parallel, and chain modes, and discovers user/project agents.
- The catalog includes multiple subagent and multi-agent packages:
  `@mjakl/pi-subagent`, `pi-subagents`, `@tintinweb/pi-subagents`,
  `@gotgenes/pi-subagents`, `pi-multiagent`, `pi-crew`, and
  `@gjczone/pi-swarm`.
- The subagent packages are closer to v0.6's immediate need than the team/swarm
  packages. Team/swarm packages may matter later, but they should not drive the
  first integration.

Decision:

- Do not build an Alt Theory-native agent-team framework in v0.6.
- First integration target is Pi package/extension compatibility.
- Default route to evaluate first: a Pi subagent extension/package with
  isolated Pi sessions and per-agent config, not a team/swarm orchestrator.
- If a subagent feature is needed soon, prefer installing or adapting a Pi
  subagent package/extension and recording Alt Theory research metadata around
  it.
- Only build an Alt Theory compatibility shim if the Pi package/extension path
  cannot expose the research records we need.

## Non-Decisions

- Exact A/B UI placement.
- Exact score dimensions.
- Exact fallback candidate list.
- Exact Pi subagent package to install.
- Full multi-agent team UX.
- Final A/B execution record schema.

## Sources

- Local installed Pi `@mariozechner/pi-coding-agent` `README.md`
- Local installed Pi `examples/extensions/subagent/README.md`
- https://pi.dev/
- https://pi.dev/packages
- https://pi.dev/packages/pi-sub-agent
- https://pi.dev/packages/pi-subagents
- https://pi.dev/packages/%40mjakl/pi-subagent
- https://pi.dev/packages/%40tintinweb/pi-subagents
- https://pi.dev/packages/pi-multiagent
- https://pi.dev/packages/pi-crew
- https://pi.dev/packages/%40gjczone/pi-swarm
- https://github.com/mjakl/pi-subagent
- https://github.com/tintinweb/pi-subagents
