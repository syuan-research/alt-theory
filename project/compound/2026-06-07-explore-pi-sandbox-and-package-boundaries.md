---
doc_type: explore
type: question
date: 2026-06-07
slug: pi-sandbox-and-package-boundaries
topic: What write isolation and package security mechanisms does Pi 0.70.2 provide?
scope: Local installed Pi 0.70.2 source, docs, and examples
keywords: [pi, sandbox, write-tool, extensions, packages, windows]
status: active
confidence: high
---

# Pi Sandbox And Package Boundaries

## Question and Scope

Does Pi 0.70.2 enforce workspace-only writes, and which native extension or
sandbox mechanisms can Alt Theory reuse?

## Quick Answer

Pi's built-in write tool does not enforce cwd containment. Pi intentionally
supports replacement tools and pluggable filesystem operations, so Alt Theory
can implement a contained write tool or extension. Pi's included OS-sandbox
example protects bash through `@anthropic-ai/sandbox-runtime`, but the example
explicitly supports only macOS and Linux and disables itself on Windows. Pi
packages and extensions are not a security boundary; they run with full process
permissions.

## Key Evidence

- `node_modules/@mariozechner/pi-coding-agent/dist/core/tools/write.js:132`:
  built-in write resolves a path and invokes filesystem operations without a
  containment check.
- `node_modules/@mariozechner/pi-coding-agent/docs/extensions.md:1822`:
  built-in tools accept pluggable operation interfaces, supporting a custom
  write implementation.
- `node_modules/@mariozechner/pi-coding-agent/examples/extensions/sandbox/index.ts:1`:
  the provided sandbox example is specifically an OS-level bash wrapper.
- `node_modules/@mariozechner/pi-coding-agent/examples/extensions/sandbox/index.ts:252`:
  the example disables sandboxing outside Darwin and Linux.
- `node_modules/@mariozechner/pi-coding-agent/README.md:368`:
  Pi warns that packages and extensions run with full system access.

## Detail

The smallest reusable Pi mechanism is a custom `write` tool using
`WriteOperations`, or an extension that replaces the built-in tool. Such a tool
can canonicalize the requested path, reject paths outside the configured
workspace, and handle symlinks explicitly.

The example OS sandbox is useful evidence for Linux/macOS deployments and for
network/bash isolation. It is not a direct Windows solution and does not by
itself prove that direct Node filesystem calls from other tools are contained.

Pi packages are a distribution mechanism for extensions, skills, prompts, and
themes. Installing a package may run npm/git installation flows, and loaded
extensions execute arbitrary code with the Pi process permissions. Package
review and pinning are supply-chain controls, not runtime isolation.

## Open Questions

- What Windows-compatible OS sandbox should an eventual desktop release use?
- Should Alt Theory first ship a contained custom write tool, then add broader
  OS isolation as defense in depth?
- How should symlink/junction and Windows path canonicalization be tested?

## Next Steps

Use this evidence when designing the dedicated write-boundary feature; do not
block the controlled live-provider experiment on that future design.

## Related Documents

- `project/workstreams/agent-harness/swe/issues/2026-06-07-pi-write-outside-workspace/`
- `project/workstreams/agent-harness/notes-and-status/2026-06-07-backend-v2-plan-record-v1.md`
