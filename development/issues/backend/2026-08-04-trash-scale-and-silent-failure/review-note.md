---
doc_type: review-note
slug: trash-scale-and-silent-failure
status: banked
created: 2026-08-04
target: v1.5 or v1.6
workstream: 0-v1-full-stack
tags: [v1-3, beta, backend, session-store, trash, deletion, scale]
---

# Trash and deletion: scale and silent failure

Full review of the deletion / Trash subsystem as shipped in `v1.3.0-beta.1`.
Three defects were fixed at review time; the rest are banked here deliberately.
They are important and not urgent: none of them is wrong today, each of them
gets worse on its own, and none is visible until it already hurts.

The banked items are not a performance topic. They are what a deletion
subsystem does as it ages: **cost that grows with use, and a background job
that fails without saying so.**

## Reviewed surface

- `web-server/session-deletion.ts` — the `deleted.json` tombstone record.
- `web-server/session-store.ts` — Trash listing, soft delete and its cascade,
  restore, permanent delete, the 30-day sweep.
- `web-server/session-retention.ts` — the hosted-only private-retention wipe,
  which writes the same tombstone.
- `web-server/server.ts` — the REST endpoints and the WebSocket access guard.
- `frontend/src/components/shell/SettingsView.tsx` — the Trash panel.
- `frontend/src/lib/sessionList.ts` — which conversations the list shows.

## Fixed before Beta 1 shipped

1. **Delete did not stop the run it was burying.** Deleting a conversation
   while it was generating removed it from the list but left the run alive,
   and the WebSocket guard then rejected every further message on that
   session — including `abort`. The model kept writing, kept calling tools,
   kept spending, with no remaining button able to interrupt it; a pending
   tool approval could never be answered. Delete now aborts every conversation
   the same action moves into Trash, subagents included.
   (`sessionsAttachedToDeletion` + `DELETE /api/sessions/:sessionId`.)

2. **Trash offered Restore for conversations that were already emptied.**
   Membership was decided by subtracting the endings the code knew about, so
   a conversation wiped by hosted private retention appeared as recoverable
   for 30 days. That broke the retention promise made to its participant and
   offered a Restore that could only return a blank conversation. Membership
   is now an allowlist — Trash lists what the user deleted, nothing else —
   which also holds for any deletion kind added later.

3. **The macOS bundle shipped no application icon** while Windows shipped
   one, so a single release would have carried two app identities.

## Deferred by decision

**A/B comparison arms are orphaned by Delete.** `ab-arm` children are neither
list members (`isListMember`) nor cascade targets (`attachedDeletionTargets`
covers `side`, `helper`, `subagent`). Deleting the parent leaves each arm on
disk holding a copy of the parent transcript up to the fork point, unreachable
from the list and from Trash forever: the user believes the conversation is
gone and it is not.

Latent in Beta 1 — `SessionService.compareResponses` has no HTTP or WebSocket
caller, so nothing can create an arm. The owner's decision is that an arm is
the live-research form of a Branch, and that its visibility and lifecycle
should be settled when the comparison interface is actually built, rather than
by changing code no one runs. **This must be resolved in the same change that
exposes A/B comparison.**

## Banked

### 1. Every conversation action re-reads the whole conversation from disk

The WebSocket guard added in Beta 1 runs on every client message except
`new_session`, and calls `readSessionDetail`, which parses the entire Pi
transcript plus all run records, session events and A/B records — in order to
read one field, `deletedAt`.

Consequence: a fixed delay is added in front of every prompt, abort, approval
and mode switch, and that delay grows with the length of the conversation. It
is invisible on a short conversation and worst exactly where the product wants
to be strongest — the long continuing conversation.

Direction: the guard needs the deletion marker and the visibility fields, not
the transcript. A single-session summary read (the `readSessionSummary` path,
currently private to `session-store.ts`) covers both.

### 2. Permanently deleted conversations are never actually gone from scans

Permanent delete wipes `history/`, `branches/` and everything in `records/`
except the tombstone. What is left has no `session.json`, so
`readSessionParts` reports it as `legacy-v0.3`, and `isDurableCatalogSession`
then treats it as a real conversation. It is filtered out of both lists by
reason, so nobody sees it — but every future directory scan still walks it,
and `allSessionSummaries` (called by soft delete, restore, permanent delete)
scans everything twice.

Consequence: the app gets slower in proportion to how much the user has
deleted, permanently, with no way for the user to reclaim it. A researcher who
runs and discards many conversations pays the most.

Direction: either recognise a purged tombstone before building a summary, or
remove the session directory outright once nothing inside it is retained
(which interacts with the workspace decision below).

### 3. The 30-day sweep stops at the first damaged conversation, silently

`purgeExpiredDeletedSessions` iterates expired Trash entries and re-throws any
error that is not the English string `Close the conversation…`. One unreadable
or half-written session directory therefore aborts the whole pass, and
`sweepExpiredDeletedSessions` logs to the console — which a desktop user never
sees.

Consequence: Trash silently stops emptying. The user is told deleted
conversations are removed after 30 days; they are not, and nothing anywhere
says so. Discovery is by disk usage, months later.

Direction: fail per entry rather than per pass, and stop deciding control flow
by matching an English error message. Whether a repeated failure should
surface in the interface is a product question, not a code one.

### 4. Repeated whole-directory scans in the delete path

`softDeleteSession`, `restoreDeletedSession` and `permanentlyDeleteSession`
each call `allSessionSummaries`, itself two full scans; the sweep calls
`permanentlyDeleteSession` once per expired entry, making the pass quadratic
in the number of conversations. Harmless at present scale and listed only so
that it is a known cost rather than a surprise when a data directory grows.

## Standing product question

Permanent delete and the 30-day expiry keep `workspace/` — attachments and
working files — and the confirmation dialog says so. Hosted private retention
deletes `workspace/` as well. The same word, "gone", therefore means two
different things depending on which path reached it. This is currently a
deliberate difference, recorded in `architecture/information-architecture.md`;
it deserves an explicit decision rather than an inherited one.
