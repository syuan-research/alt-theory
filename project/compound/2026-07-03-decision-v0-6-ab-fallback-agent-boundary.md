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
- Minimum backend record shape:
  - `abRunId`, `sessionId`, `parentEntryId`, `userEntryId`, `createdAt`
  - `candidates[]`: `candidateId`, actual runtime config snapshot, response
    entry/file references, status, error, timing, token/cost metrics
  - `evaluation`: selected candidate, optional per-candidate scores, optional
    notes, evaluator identity/role, timestamp

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
- The catalog also lists `pi-crew` as coordinated AI teams/workflows/worktrees
  orchestration, and third-party `@tintinweb/pi-subagents` documents parallel
  background agents, isolated sessions, custom agent types, live UI, steering,
  and resume.

Decision:

- Do not build an Alt Theory-native agent-team framework in v0.6.
- First integration target is Pi package/extension compatibility.
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

## Sources

- Local installed Pi `@mariozechner/pi-coding-agent` `README.md`
- Local installed Pi `examples/extensions/subagent/README.md`
- https://pi.dev/
- https://pi.dev/packages
- https://pi.dev/packages/pi-sub-agent
- https://github.com/mjakl/pi-subagent
- https://github.com/tintinweb/pi-subagents
