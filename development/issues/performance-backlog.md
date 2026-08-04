---
doc_type: backlog
slug: performance-backlog
status: open
created: 2026-08-04
target: v1.5–v1.6
tags: [performance, scale, backend, frontend]
---

# Performance backlog

One running list of the work Alt Theory does that costs more than it needs to.
Everything here is important and not urgent: none of it is wrong today, and
each item gets worse on its own — with conversation length, with conversation
count, or with how long the app has been used. Add to this file rather than
opening a new note per finding.

Each entry states the user-visible cost first, then where it comes from, then
the direction — not a prescribed patch.

## 1. Every conversation action re-reads the whole conversation from disk

**Cost.** A delay in front of every prompt, abort, tool approval, model switch
and mode switch, growing with the length of the conversation. Invisible on a
short conversation; worst exactly where the product wants to be strongest —
the long continuing conversation.

**Source.** The WebSocket access guard (`server.ts`,
`requireSessionWsContentAccess`) runs on every client message except
`new_session` and calls `readSessionDetail`, which parses the entire Pi
transcript plus all run records, session events and A/B comparison records.
It needs two things from all of that: the deletion marker and the visibility
fields.

**Direction.** A single-session summary read covers the guard's needs; the
transcript is never consulted. `readSessionSummary` already exists inside
`session-store.ts` and is private.

Introduced by the Beta 1 change that stopped a trashed conversation from
accepting new work — the guard is right, its reading is oversized.

## 2. Reading the transcript re-reads it from disk every time

**Cost.** Same shape as item 1 and on the same hot path: the cost of showing a
conversation scales with its length even when nothing has changed.

**Source.** `SessionService.getTranscript` refreshes from
`readSessionDetail(...).transcript` on every call rather than serving the
transcript the service already holds in memory for the open session.

**Direction.** The open session is the authority on its own transcript; a full
re-read belongs where the file actually changed underneath us, not on read.

## 3. The conversation list re-parses every conversation's config log

**Cost.** The sidebar refresh gets slower in proportion to the number of
conversations and to how much each has been reconfigured — and it refreshes
after every completed answer, not only when the user opens the list.

**Source.** `buildSummary` (`session-store.ts`) resolves `projectId` as
`v4Session?.projectId ?? readConfigEvents(recordsDir).at(-1)?...`, and
`readConfigEvents` reads and JSON-parses the whole `config-events.jsonl`. The
`??` does short-circuit, so a conversation assigned to a project is cheap —
but a conversation with no project falls through and pays the full parse every
single refresh, and most conversations have no project.

**Direction.** Absence of a project is a normal state, not a reason to consult
a history log. Either record it in the session header the way every other
summary field is, or read the tail of the log rather than all of it.

## 4. Permanently deleted conversations are never gone from scans

**Cost.** The app gets slower in proportion to how much the user has deleted —
permanently, with no way to reclaim it. A researcher who runs and discards
many conversations pays the most.

**Source.** Permanent delete wipes `history/`, `branches/` and everything in
`records/` except the tombstone. What is left has no `session.json`, so
`readSessionParts` reports `legacy-v0.3` and `isDurableCatalogSession` accepts
it as a real conversation. Both lists filter it out by reason, so nobody sees
it, but every directory scan still walks it forever.

**Direction.** Recognise a purged tombstone before building a summary, or
remove the session directory outright once nothing inside it is retained —
which interacts with the workspace question at the end of this file.

## 5. Whole-directory scans repeated inside one operation

**Cost.** None at present scale. Listed so it is a known cost rather than a
surprise when a data directory grows.

**Source.** `softDeleteSession`, `restoreDeletedSession` and
`permanentlyDeleteSession` each call `allSessionSummaries`, itself two full
scans; the 30-day sweep calls `permanentlyDeleteSession` once per expired
entry, making the pass quadratic in the number of conversations.

---

## Found in the same review, not performance

Kept here so they are not lost to a second fragment; move them out if this
file ever needs to stay purely about cost.

**The 30-day Trash sweep stops at the first damaged conversation, silently.**
`purgeExpiredDeletedSessions` re-throws any error that is not the English
string `Close the conversation…`, so one unreadable session directory aborts
the whole pass, and the failure is logged to a console no desktop user sees.
Trash then quietly stops emptying while the interface keeps promising a
30-day removal. Fail per entry, and stop deciding control flow by matching an
English error message.

**A/B comparison arms are orphaned by Delete.** `ab-arm` children are neither
list members nor deletion-cascade targets, so deleting the parent leaves each
arm on disk holding a copy of the parent transcript, unreachable from both the
list and Trash: the user believes the conversation is gone and it is not.
Latent in Beta 1 — nothing can create an arm, because `compareResponses` has
no HTTP or WebSocket caller. Owner's decision (2026-08-04): an arm is the
live-research form of a Branch, and its visibility and lifecycle are settled
by the change that actually exposes A/B comparison. **That change must resolve
this.**

**"Gone" means two different things.** Permanent delete and the 30-day expiry
keep `workspace/` — attachments and working files — and the confirmation
dialog says so. Hosted private retention deletes `workspace/` as well. The
difference is currently deliberate and recorded in
`architecture/information-architecture.md`; it deserves an explicit decision
rather than an inherited one.

---

## Already fixed, for context

Found in the same review of the deletion path and repaired before the Beta 1
macOS artifact shipped, so they are not open work:

- Delete did not stop the run it was burying: the conversation left the list
  while the model kept writing, kept calling tools and kept spending, and the
  guard above then rejected `abort` — the only button that could have stopped
  it. Delete now aborts everything it moves into Trash, subagents included.
- Trash listed conversations that had already been emptied by hosted private
  retention as recoverable, breaking the retention promise and offering a
  Restore that could only return a blank conversation. Membership is now an
  allowlist: Trash lists what the user deleted, nothing else.
