---
doc_type: issue-analysis
issue: 2026-06-07-pi-write-outside-workspace
status: analyzed
root_cause_type: missing-guard
path: standard
tags: [backend, security, pi-tools]
---

# Pi Write Outside Workspace Analysis

## 1. Problem Location

| File | Function | Role |
|---|---|---|
| `alt-theory-app/core/alt-theory-core.ts` | `createAltTheorySession` | Enables Pi's built-in `write` tool and supplies prompt guidance only. |
| Pi `dist/core/tools/write.js` | `createWriteToolDefinition` | Resolves a supplied path and directly invokes filesystem operations. |

## 2. Failure Path

1. Alt Theory includes the built-in `write` tool by name.
2. The model supplies a relative or absolute path.
3. Pi resolves that path against `cwd`; an absolute path remains absolute.
4. Pi creates the parent directory and writes without checking containment in
   the Alt Theory workspace.

## 3. Root Cause

Alt Theory relies on prompt guidance while using a general-purpose Pi tool that
has no workspace-containment guard. Root cause category: `missing-guard`.

## 4. Impact Assessment

- Impact scope: every write-enabled Alt Theory session.
- Potential victims: local files accessible to the application OS user.
- Data integrity: unintended overwrite is possible if a model chooses an
  existing absolute path.
- Severity review: P2 in the current controlled experiment because no untrusted
  user or content is involved. This becomes release-blocking security work
  before untrusted-user deployment.

## 5. Fix Options

| Option | Approach | Files | Risk |
|---|---|---|---|
| A | Replace built-in write with a custom tool whose operations reject paths outside `workspace`. | Alt Theory core + new tool module | low-medium |
| B | Add a Pi extension that overrides write/edit/bash and centralizes path policy. | runtime extension/package + loader config | medium |
| C | Run the whole agent in an OS/container sandbox and keep tool-level checks as defense in depth. | deployment/runtime architecture | high, Windows support uncertain |

No fix is selected in this issue yet. The companion exploration records what Pi
0.70.2 already provides.
