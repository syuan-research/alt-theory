---
doc_type: architecture-decision
status: current
date: 2026-09-05
architecture: [workspace-files-and-action-safety]
source:
  - "Owner Decision 2026-09-05: projects and one folder mechanism"
  - "git commits 0a9fa2f, 85c7e11, and 5680675"
---

# Let projects own folder composition

Alt Theory represents a project as a durable entity with a generated id, an
editable name, one changeable main folder, and zero or more companion folders.
A conversation persists only its main folder; it receives companion folders by
resolving the matching project from application settings. This replaces both
path-as-project-identity and per-session `additionalDirs`, so project identity
can survive a main-folder move and one folder mechanism governs every
conversation in the project.

## Considered alternatives

- Using the main-folder path as the project id was rejected because changing
  that folder would change identity and because a project may own settings
  beyond folders.
- Keeping session-level additional folders beside project companions was
  rejected because the two mechanisms could disagree about the same
  conversation's readable and writable roots.

## Consequences

- Legacy settings are migrated to generated project ids and persisted so an
  id-addressed action remains stable across reads.
- Changing a project's main folder preflights every affected conversation,
  re-points their families through the existing session-workspace path, and
  writes the project setting last. One running conversation refuses the whole
  move without a partial settings change.
- Companion and global folder policy is read live through `folderPolicyFor()`;
  open conversations receive the current roots at their next path check.
- A missing main folder does not delete the project. The project remains
  visible so the user can re-point it, while new conversation creation in that
  missing folder is refused.
