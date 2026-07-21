---
doc_type: learning
type: research
date: 2026-06-12
slug: write-tool-boundary-layering
topic: How should Alt Theory layer write-tool path enforcement, Pi extension guards, and OS sandboxing?
scope: Alt Theory backend agent harness with embedded Pi 0.70.2
keywords: [backend, pi, write-tool, sandbox, extensions, tool-boundary]
status: active
confidence: high
---

# Write Tool Boundary Layering

## Lesson

Treat write-tool safety as layered enforcement, not as one generic "sandbox"
problem.

For Alt Theory's current backend, the immediate defect is narrow: the exposed
`write` tool accepts paths outside the intended session `writeDir`. The first
fix should therefore enforce `writeDir` containment at the tool operation layer.
Pi extension gates and OS/process sandboxes remain useful, but they solve
different layers of the problem.

## R1 Branches

### R1-a - Code + Local Pi API

Use Pi's SDK surface to replace or wrap the built-in `write` tool.

Key evidence:

- Pi exposes write tool factories and `WriteOperations`.
- `WriteOperations` includes `writeFile(absolutePath, content)` and
  `mkdir(dir)`, which are natural enforcement points.
- Pi's tool registry permits custom/extension tools with the same name to
  replace built-ins.

Recommended child:

- `R1-a-1`: guarded same-name `write` tool. Resolve the requested path, reject
  absolute/outside paths and traversal escapes, then delegate to Pi's normal
  write implementation.

Why first: it is local, testable, dependency-free, and exactly matches the
current risk surface.

### R1-b - Pi Extension / Package Guard

Use Pi's extension system to intercept `tool_call` before execution.

Key evidence:

- Pi `tool_call` handlers can block a tool call.
- `event.input` is mutable before execution.
- Pi's `protected-paths.ts` example demonstrates path-based blocking for
  write/edit.

Best use: a reusable guard package or second-layer policy, especially if Alt
Theory later wants consistent protection for `edit`, project-local packages, or
multiple Pi entrypoints.

Why not first: it adds resource-discovery/config lifecycle complexity, while
the current embedded app can enforce the one risky operation directly.

### R1-c - OS / Process Sandbox

Use a process-level sandbox for broader containment.

Key evidence:

- Pi includes a sandbox extension example based on
  `@anthropic-ai/sandbox-runtime`, but that example primarily wraps `bash`.
- The dependency is not currently installed in the Alt Theory lockfile.
- The example targets macOS/Linux. It is not a direct Windows-local researcher
  console solution.
- Linux-oriented options such as Sandlock are promising for VPS/deployment
  hardening because they can constrain filesystem, network, IPC, syscalls, and
  copy-on-write behavior.

Best use: future online/VPS or deployment hardening. It should protect the
whole process or subprocess execution environment, not substitute for a simple
write-tool path check.

## Practical Ordering

1. Ship `R1-a-1`: a guarded same-name `write` tool bound to session `writeDir`.
2. Test inside/outside writes, absolute paths, traversal attempts, and source
   tree targets.
3. Decide later whether `R1-b` should become a reusable Pi package-style guard.
4. Treat `R1-c` as a deployment hardening lane, especially for Linux/VPS.

## Design Rule

Tool allowlists are not sandboxes. A tool can be allowed by name while its
arguments still reach unsafe filesystem locations. Architecture and acceptance
records should distinguish:

- prompt policy: what the model is told to do;
- tool policy: which tools are exposed;
- parameter boundary: which paths/arguments the tool implementation accepts;
- process boundary: what the operating system permits the process to do.

## Related Records

- `project/workstreams/0-backend-agent-harness/notes-and-status/2026-06-12-write-tool-boundary-stage1-research-plan-record.md`
- `project/compound/2026-06-07-explore-pi-sandbox-and-package-boundaries.md`
- `project/architecture/core-session-engine.md`
