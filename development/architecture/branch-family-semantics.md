---
doc_type: architecture
slug: branch-family-semantics
scope: Conversation families — branches, attached conversations, promotion, deletion, workspace unity
summary: The shipped rules for fork trees; one of the most intricate areas of the app — read this BEFORE touching any of it
status: current
last_reviewed: 2026-08-05
tags: [core, backend, frontend, sessions, branching]
depends_on: [core-session-engine]
implements: []
---

# Architecture: Branch & Family Semantics

**Read this before changing anything family-related** (owner instruction,
2026-08-05: this area keeps being re-inferred from code, and it is one of
the most complex parts of the app). Full design history, adversarial
reviews, and superseded alternatives live in the private workstream doc
`llm-theo-development/workstreams/0-v1-full-stack/notes-and-status/20260804-v1.4-branch-promotion-restore-design.md`
(+ the 20260805 v1.4.1 swe-plan). This file records only what is shipped,
and why.

Code hotspots this document governs:

- `alt-theory-app/web-server/session-store.ts` — cascade delete,
  living-representative, promotion records, heal, family walks
- `alt-theory-app/web-server/session-service.ts` — fork creation,
  workspace re-point
- `alt-theory-app/frontend/src/lib/sessionList.ts` — list membership,
  crown predicate, tree building, orphan grouping
- `alt-theory-app/frontend/src/components/shell/LeftNav.tsx`,
  `.../conversation/ChildConversation.tsx` — the two crown entry points

## 1. Data model (immutable lineage, flags move)

- `forkedFrom { sessionId, purpose, listed? }` on every child.
  **Lineage is immutable provenance** — promotion, deletion, restore, and
  moves never rewrite who forked from whom.
- Purposes: `fork` (Branch), `side` (BTW), `helper`, `subagent`, `ab-arm`.
- `delisted?: boolean` + `delistedFor?: string` exist on ROOTS only:
  a demoted old mainline and who took its spot.
- `fork.listed === true` has TWO meanings by context:
  - on side/helper/subagent: user added it to the conversation list
    (membership itself — never clear it as a side effect);
  - on a fork child: promotion anchor. Branches are list members by
    nature, so for them the flag only marks "user chose this one as the
    family head" (rootless families, §4).

## 2. List membership and the family tree

- Members: all roots (delisted ones included — demoted, never hidden),
  all branches, plus explicitly listed children (`isListMember`).
- Nesting: children under their parent. Display inversion: a delisted
  root nests UNDER its successor (`delistedFor`, fallback most recent
  member branch) — role swap, not data migration.
- **Orphan grouping** (v1.4.1): when a parent is gone from the list data
  (deleted/purged mainline), its orphaned members do NOT scatter into
  top-level rows — the family head takes the top row and the others nest
  under it. Head = `orphanGroupHead`: the anchored branch
  (`fork.listed === true`), else the OLDEST branch, else the oldest
  member. Rationale: deleting a mainline is routine in the edit-heavy
  flow; the family must stay one visual unit, headed automatically
  (owner ruling 2026-08-05: oldest first-level branch succeeds — no
  manual step required).

## 3. Promotion ("Make this the main conversation" — role swap + coexist)

- Promotion changes only presentation flags: target gets listed, the
  nearest delistable visible ROOT steps down (`delisted: true` +
  `delistedFor`). Only roots are delistable — a listed child never loses
  its status to a later promotion (opus D2).
- Crown visibility = `canTakeMainline`, shared by the session-list
  3-dots and the ChildConversation header. True when:
  - a delisted root could take its spot back; or
  - a branch/listed child has a delistable visible root ancestor; or
  - **rootless family** (v1.4.1): the member is a direct orphan and not
    the current head — the crown RE-HEADS the orphan group. Server side
    clears competing branch anchors so the head stays unique.
- After promotion the crown disappears from the new head (nothing left
  to change) and appears on members whose promotion would change the
  head again. Reversal is just promotion in the other direction.

## 4. Deletion, succession, restore

- Cascade (`attachedDeletionTargets`): branches NEVER cascade with a
  deleted parent. Attached conversations (side/helper/subagent) survive
  while ANY branch in the chain lives (no fork-time bound — owner
  2026-08-04: never silently lose content); `ab-arm` always follows its
  parent (arms are disposable, `2c088f1`).
- Living-representative invariant: while any member of a fork tree is
  alive, at least one member is listed. Successor rule (owner
  2026-08-05): nearest living ancestor first (auto-relist), else the
  OLDEST first-level branch, else the oldest living branch/member.
- Deleting a rootless family's display head: the next head is derived
  (§2) — no data write needed.
- Restore resurrects RECORDS, never role decisions: a demoted mainline
  deleted and restored comes back delisted; purged links are not
  synthesized.

## 5. Workspace unity (one family, one folder)

- Invariant: every member of a fork tree shares the tree root's working
  folder. Enforced at: fork creation (inherit from parent), workspace
  re-point (`setSessionWorkspace` walks the WHOLE tree from the
  structural root via `forkFamilyIds`, whichever member was dragged),
  and startup (`healFamilyInvariants`: root wins; also repairs
  no-listed-member families).
- The folder-move dialogs state that the whole family moves. Folder
  groups in the list sort by NAME (stable), roots inside by recency.

## 6. Invariants to preserve when changing this area

1. Lineage (`forkedFrom`) is never rewritten.
2. Only presentation flags move on promote/delete/restore.
3. A living tree always has a listed representative.
4. A family shares one working folder; root wins on conflict.
5. Frontend predicate (`canTakeMainline`) and server behavior
   (`promoteToMainlineRecords`) must agree; `orphanGroupHead` is shared
   by tree building and the crown so they cannot disagree.
6. Never clear `listed` on side/helper/subagent as a side effect.

Tests that pin these rules: `web-server/session-deletion-lifecycle.test.ts`,
`web-server/session-service.test.ts` (fork family / repoint / promote
preconditions), `frontend/src/lib/sessionList.test.ts`.
