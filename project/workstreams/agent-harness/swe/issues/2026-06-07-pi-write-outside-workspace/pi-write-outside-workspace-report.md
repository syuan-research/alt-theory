---
doc_type: issue-report
issue: 2026-06-07-pi-write-outside-workspace
status: open
severity: P2
summary: Pi's built-in write tool can write outside the Alt Theory session workspace.
tags: [backend, security, pi-tools]
---

# Pi Write Outside Workspace Report

## 1. Observed Behavior

Alt Theory enables Pi's built-in `write` tool and asks the model to write only
under the session workspace. The tool also accepts absolute paths outside that
workspace and writes them when the current OS user has permission.

## 2. Expected Behavior

An Alt Theory restricted-write mode should enforce its advertised write root at
the tool or operating-system boundary, not only in prompt text.

## 3. Reproduction Steps

1. Create a write-enabled Alt Theory session.
2. Locate the Pi `write` tool.
3. Execute it with an absolute path outside `sessionCwd`.
4. Observe that the file is created if OS permissions allow it.

## 4. Environment / Context

- Alt Theory backend v2
- `@mariozechner/pi-coding-agent` 0.70.2
- Windows development environment
- Current conference experiment is controlled and does not expose the agent to
  untrusted users.

## 5. Related Files

- `alt-theory-app/core/alt-theory-core.ts`
- Pi built-in `dist/core/tools/write.js`
- Pi example `examples/extensions/sandbox/index.ts`

## 6. Regression?

No. The boundary was never implemented.

## Routing

Standard issue path. Current controlled experiments may proceed, but this issue
must be resolved before claiming a hard write boundary or exposing write-enabled
sessions to untrusted users.
