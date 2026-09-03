---
doc_type: architecture
slug: branch-family-semantics
scope: Conversation families — branches, attached conversations, promotion, deletion, workspace unity
summary: The shipped rules for fork trees; one of the most intricate areas of the app — read this BEFORE touching any of it
status: current
last_reviewed: 2026-08-17
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
(+ the 20260805 v1.4.1 swe-plan). This file records only what is shipped and
the constraints that have an explicit source. The shared managed-session
substrate for attached children is recorded in [ADR 0002](adr/0002-mediated-child-session-substrate.md);
family and lineage semantics remain owned here.

Code hotspots this document governs:

- `alt-theory-app/web-server/session-store.ts` — lineage derivation
  (`withLineage`), cascade delete, living-representative, promotion
  records, heal, family walks
- `alt-theory-app/web-server/session-service.ts` — fork creation,
  workspace re-point
- `alt-theory-app/frontend/src/lib/sessionList.ts` — list membership,
  crown predicate, tree building, stray-family grouping, marker names
- `alt-theory-app/frontend/src/components/shell/LeftNav.tsx`,
  `.../conversation/ChildConversation.tsx` — the two crown entry points
- `alt-theory-app/frontend/src/components/shell/InspectorPanel.tsx` —
  the Related rail (family-wide attached visibility)

## 0. The one design rule (v1.4.1 refactor, owner 2026-08-06)

Relations are **derived from immutable lineage, in one place** — never
maintained per-feature. The server computes, for every summary (Trash
included), `lineagePath` (ancestor ids, root first; a purged top id still
anchors the family) and `lineageMarker` (mechanical name, §3). Everything
downstream — display tree, cascade, crown, rail, workspace unity — reads
those. Bugs in this area historically came from per-feature relation
walks that stopped at deleted middles; do not reintroduce them.
- Server-side, membership is ONE walk: `familyOf(sessionId, summaries)` in
  `session-store.ts` (every summary sharing `lineagePath[0]`, Trash
  included; a purged root's id keeps its children one family). Delete,
  delete-entire-family, promote, heal, and workspace re-point all read it
  (v1.5 part 2, card 10 — the earlier tree walk stopped at a purged
  ancestor and split siblings). Heal's "root wins" folder alignment skips
  a family whose root is purged: there is no root to win.

## 1. Data model (immutable lineage, flags move)

- `forkedFrom { sessionId, purpose, listed? }` on every child.
  **Lineage is immutable provenance** — promotion, deletion, restore, and
  moves never rewrite who forked from whom.
- Purposes: `fork` (Branch), `side` (BTW), `helper`, `subagent`, `ab-arm`.
- Derived on every list build (never stored): `lineagePath: string[]`,
  `lineageMarker: string | null` (`withLineage` in session-store.ts).
  The walk goes THROUGH Trash; only a purged (permanently deleted)
  ancestor ends it, and that purged id still anchors the family key.
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
  all branches, plus explicitly listed children (`isListMember` in
  `frontend/src/lib/listMember.ts` — one implementation, imported by the
  frontend and by `session-store.ts`; the server's `isListVisible` is
  that predicate minus Trash and minus a delisted root).
- **Display parent = nearest list ancestor** (walk `lineagePath` from the
  nearest end): a deleted middle branch never splinters the root from its
  grandchildren — they attach to the closest living ancestor.
- Display inversion: a delisted root nests UNDER its successor
  (`delistedFor`, fallback most recent member branch) — role swap, not
  data migration. The successor is cut from its own parent edge (checked
  against the family ROOT via `lineagePath[0]`) or the family would close
  a display cycle and vanish (shipped bug 2026-08-05, pinned by test).
- **Stray-family grouping**: members whose ENTIRE ancestor chain is gone
  from the list data regroup by family key (`lineagePath[0]`) instead of
  scattering: the family head takes the top row, the rest nest under it,
  and the head row carries a crown marker (`isFamilyHead`).
  Head = `familyHead`: the anchored branch (`fork.listed === true`) at
  ANY depth, else the oldest first-level branch, else the oldest branch
  anywhere, else the oldest member — the uniform mechanical fallback
  (owner 2026-08-06: prefer the crowned/most-natural head, but always
  fall through to OLDEST so a living family can never fail to resolve).

## 3. Marker names (owner 2026-08-06)

- Display-layer only (`ui-alias.json` is never rewritten): the list title
  is `marker · base title`.
- `lineageMarker` = one token segment per fork-child level, joined by
  `-`: tokens `br` (branch), `btw`, `h` (helper), `sa` (subagent), `ab`
  (ab-arm; not shown in UI). Example: `br1-btw2` = second BTW of the
  first branch. Every depth extends the path, so branch-of-btw vs
  btw-of-btw can never collide.
- Index = birth order (`createdAt`) among same-parent same-purpose
  siblings **including Trash**, so deleting a sibling never renumbers the
  others (purging can). Renames don't participate: family logic keys off
  lineage only; a bare machine-token alias (old "Branch 1" or new "br1")
  collapses to the marker, a real name is kept under the prefix.
- Tokens are all-lowercase by ruling (owner 2026-08-06: consistency over
  word-vs-acronym casing like `Br`/`BTW`). The Related rail carries a
  small sticky legend (`.related-legend`) explaining the tokens.

## 4. Promotion ("Make this the main conversation" — role swap + coexist)

- Promotion changes only presentation flags: target gets listed, the
  nearest delistable visible ROOT steps down (`delisted: true` +
  `delistedFor`). Only roots are delistable — a listed child never loses
  its status to a later promotion (opus D2).
- Crown visibility = `canTakeMainline`, shared by the session-list
  3-dots and the ChildConversation header. True when:
  - a delisted root could take its spot back; or
  - a branch/listed child has a delistable visible root ancestor
    (checked over `lineagePath`, so a deleted middle never hides a
    living root); or
  - **rootless family**: any member that is not the current head — the
    crown RE-HEADS the family. Server side clears competing branch
    anchors across the whole family (only when no living root exists) so
    the head stays unique.
- After promotion the crown disappears from the new head and appears on
  members whose promotion would change the head again. Reversal is just
  promotion in the other direction.

## 5. Deletion, succession, restore

- Cascade (`attachedDeletionTargets`, owner 2026-08-06 — replaces the
  per-node living-branch walk): **Delete removes exactly the chosen
  conversation.** Attached conversations (side/helper/subagent/ab-arm)
  belong to the FAMILY, not to one parent: they survive any deletion
  that leaves a living anchor (`keepsFamilyAlive`: root — delisted
  counts —, branch, or listed child, at any depth), and the LAST anchor
  takes every remaining unlisted attached conversation with it, so no
  invisible orphans remain. ab-arm is no longer special-cased (a spare
  arm record surviving alongside its family is harmless).
- Living-representative invariant: while any member of a fork tree is
  alive, at least one member is listed. Successor rule (owner
  2026-08-05): nearest living ancestor first (auto-relist), else the
  OLDEST first-level branch, else the oldest living branch/member.
- Deleting a rootless family's display head: the next head is derived
  (§2) — no data write needed.
- Restore resurrects RECORDS, never role decisions: a demoted mainline
  deleted and restored comes back delisted; purged links are not
  synthesized.
- **Delete entire family** is the explicit exception to ordinary Delete. It
  marks every living member of the immutable lineage tree in one recoverable
  Trash entry; restoring that entry restores the same members.

## 6. The Related rail (family-wide attached visibility)

- Rule lives in ONE place: `relatedRowsFor` in sessionList.ts. It returns
  one row shape (`RelatedRow`: session, relation, kind, icon, `runStatus`,
  `role` = the summary's `agentType`, `createdAt`, pane size) and the
  pane renders rows; filter and search are pure functions over rows
  (`filterRelatedRows`, tested in `sessionList.test.ts`). The summary
  carries `agentType` from the spawn record (`buildSummary`).
- Scope `family` (the pane's "Whole family" card) adds the living family
  members the default view keeps out — sibling and cousin branches.
  There is no wider scope. The kind filter (Branches / Subagents / BTW /
  Helpers, counts from the current scope) and the search intersect; the
  ancestor chain ignores the kind filter and obeys the search. Rows are
  grouped by kind under collapsible heads; a member whose working folder
  differs from the open conversation's shows a folder line.
- The FULL ancestor chain shows first, root → direct parent (owner
  2026-08-07: a child must always see its parent), living members only —
  deleted middles are skipped without a placeholder (the marker still
  shows the path). Cards read "Parent"/"Ancestor" with an up-elbow icon;
  a delisted origin appears as one of these ancestors (crown icon) — it
  is in no list, so its rail row is its only door.
- Then direct children (branches + attached), then ALL attached
  conversations of the whole family (same family key), labeled — no
  matter which parent they hang off or whether that parent still lives
  (owner 2026-08-06: "family alive ⇒ subagent reachable", from every
  member's rail, identical branches included; no fork-time or
  who-knows-it heuristics). Sibling BRANCHES stay out.

## 7. Workspace unity (one family, one folder)

- Invariant: every member of a fork tree shares the tree root's working
  folder. Enforced at: fork creation (inherit from parent), workspace
  re-point (`setSessionWorkspace` walks the WHOLE tree from the
  structural root via `forkFamilyIds` = `familyOf`, whichever member
  was dragged),
  and startup (`healFamilyInvariants`: root wins; also repairs
  no-listed-member families).
- The folder-move dialogs state that the whole family moves. Moving the
  OTHER (unrelated) conversations of the folder too is opt-in — the
  dialog checkbox defaults to unchecked (owner 2026-08-06). Folder
  groups in the list sort by NAME (stable), roots inside by recency.

## 8. Invariants to preserve when changing this area

1. Lineage (`forkedFrom`) is never rewritten; `lineagePath` /
   `lineageMarker` are derived in ONE place (`withLineage`).
2. Only presentation flags move on promote/delete/restore.
3. A living tree always has a listed representative.
4. Attached conversations live exactly as long as their family has an
   anchor (§5) — never tied to a single parent.
5. A family shares one working folder; root wins on conflict.
6. Frontend predicate (`canTakeMainline`) and server behavior
   (`promoteToMainlineRecords`) must agree; `familyHead` is shared by
   tree building and the crown so they cannot disagree.
7. Never clear `listed` on side/helper/subagent as a side effect.

## 9. Known trade-offs (accepted, owner 2026-08-06)

- First-level display names are machine tokens now (`br1`, not
  "Branch 1") — uniform with deeper levels.
- Trash-inclusive numbering can show gaps (`br2` without a visible
  `br1`); purging still shifts numbers.
- The rail's family-wide attached pass can get noisy in large families;
  narrowing to "members that know it" would need fork-time comparison,
  which is deliberately ruled out.
- Deleting a branch keeps even its OWN subagents while the family has an
  anchor; a spare ab-arm record likewise persists until family death.

Tests that pin these rules: `web-server/session-deletion-lifecycle.test.ts`,
`web-server/session-service.test.ts` (fork family / repoint / promote
preconditions), `frontend/src/lib/sessionList.test.ts`.
