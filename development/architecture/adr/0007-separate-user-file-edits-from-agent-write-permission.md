---
doc_type: architecture-decision
status: current
date: 2026-09-15
architecture: [workspace-files-and-action-safety, information-architecture]
source:
  - "Owner Decision 2026-09-15: working-folder text editing"
  - "git commit cf70974"
---

# Separate user file edits from agent write permission

Alt Theory lets a local user edit an existing text file in any readable working
folder from the file preview. This route is independent of the folder's agent
Edit grant: that grant controls autonomous agent writes, not the user's direct
editing of their own files. Hosted mode does not expose the working-folder
write route.

The editor uses optimistic conflict detection rather than a file lock. It sends
the modification time observed at load; a changed file returns a conflict and
requires an explicit choice before the stale draft can replace the current file.

## Considered alternatives

- Reusing the agent Edit grant for user edits was rejected because it would
  make an agent capability setting unexpectedly restrict the user's own action.
- Blind last-write-wins was rejected because an agent or external editor could
  be overwritten silently.
- File locks were not added: the timestamp check covers the main overwrite risk
  without introducing lock recovery.

## Consequences

- The route remains local-only and reuses the working-root containment and
  sensitive-path verdict with write intent.
- Records, managed workspace, and working-folder edits share the same
  `expectedUpdatedAt`, explicit force/copy resolution, atomic replacement, and
  CRLF/BOM preservation.
- Files changed without a modification-time change are outside the optimistic
  check; a stronger content identity is warranted only if evidence shows that
  case matters.
