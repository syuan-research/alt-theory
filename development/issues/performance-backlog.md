---
doc_type: backlog
slug: performance-backlog
status: applied-v1.4-round-2
created: 2026-08-04
target: v1.4
tags: [performance, scale, backend, frontend]
---

# Performance backlog

One running list of the work Alt Theory does that costs more than it needs to.
Add to this file rather than opening a note per finding.

Everything here is important and not urgent: none of it is wrong today, and
each item gets worse on its own — with conversation length, with conversation
count, or with how long the app has been used. Each entry states the
user-visible cost first, then where it comes from, then a direction rather
than a prescribed patch.

**Applied 2026-08-04 (v1.4 round 2, commits 8aa1072 / fdf1577 / f237b64):**
items 1–7 all addressed (4 via the projects-feature deletion, ed171cb; 3 as
its own commit after studying cherry studio / open-webui / the Vercel AI SDK
block-memoization pattern). The Trash-sweep silent abort is fixed; the
ab-arm orphan is verified live-but-untriggered (0 arms in the real store)
and stays open pending the owner's product call.

**Measurement basis.** Numbers below were measured on 2026-08-04 against the
real store at `~/.alt-theory/sessions` (80 conversations, 5.2 MB) and against
copies of it grown to 200 and 500 conversations, on the development Mac.
Anything not measured says so.

## 1. Every conversation action re-reads the whole conversation file

**Cost.** A delay in front of every prompt, abort, tool approval, model switch
and mode switch. Measured on a copied real conversation, growing only its Pi
JSONL:

| entries in the conversation file | cost added to every action |
|---|---|
| ~10 (a fresh conversation) | 0.4 ms |
| ~500 | 8.7 ms |
| ~2,000 | 34 ms |
| ~8,000 | 137 ms |

**The sharp part.** The cost tracks the *file*, not the conversation the user
sees. In the measurement above the visible transcript stayed at 8 messages
while the cost went to 137 ms, because the read parses every entry in the
file — superseded turns, abandoned retries, and every branch. Branching,
retrying and comparing are what Alt Theory is *for*, so the feature that makes
the product worth using is also what inflates this number.

**Source.** The WebSocket access guard (`server.ts`,
`requireSessionWsContentAccess`) runs on every client message except
`new_session` and calls `readSessionDetail`, which parses the entire Pi
transcript plus all run records, session events and A/B comparison records. It
needs two things out of all that: the deletion marker and the visibility
fields.

**Direction.** A single-session summary read covers what the guard checks;
the transcript is never consulted. `readSessionSummary` already exists inside
`session-store.ts` and is private to it.

Introduced by the Beta 1 change that stopped a conversation in Trash from
accepting new work. The guard is right; its reading is oversized.

## 2. Reading the transcript re-reads it from disk every time

**Cost.** The same file and therefore the same table as item 1, on the same
hot path: showing a conversation costs in proportion to its whole history even
when nothing has changed.

**Source.** `SessionService.getTranscript` refreshes from
`readSessionDetail(...).transcript` on every call instead of serving the
transcript the service already holds in memory for the open session.

**Direction.** The open session is the authority on its own transcript. A full
re-read belongs where the file actually changed underneath us, not on every
read.

## 3. Every streaming token re-renders the entire transcript

**Cost.** While an answer streams, the interface does work proportional to
`length of the conversation × tokens per second`. The visible symptom is the
window becoming less responsive during long answers in long conversations —
exactly the situation the product is built around. **Not measured**; the
mechanism is structural and was read from the code, so it should be confirmed
with a profiler before anyone optimises against it.

**Source.** Three things combine:

- `AppProvider` exposes one memoised context value that includes
  `streamParts`, which is replaced on every streaming delta;
- `MessageList` consumes that context and maps every settled message;
- there is no `React.memo` anywhere under `frontend/src/components`
  (0 occurrences).

So a new context value per token invalidates every consumer, and every settled
message re-renders. The markdown *parse* is safe — `MarkdownBody` memoises
`renderMarkdown(text)` per message — but the React work is not.

**Direction.** Streaming state does not belong in the same context as settled
conversation state. Split it out (its own context, or a ref plus a subscribe
hook) so that a token invalidates only what is drawing the token. Memoising
the message row is the smaller, second-best version of the same fix.

## 4. The conversation list re-parses every conversation's config log

**Cost.** The sidebar refresh is linear in the number of conversations, and it
runs after every completed answer, not only when the user opens the list:

| conversations | one list refresh |
|---|---|
| 80 (the real store today) | 5.5 ms |
| 200 | 21 ms |
| 500 | 54 ms |

**Source.** `buildSummary` (`session-store.ts`) resolves `projectId` as
`v4Session?.projectId ?? readConfigEvents(recordsDir).at(-1)?...`, and
`readConfigEvents` reads and JSON-parses the whole `config-events.jsonl`. The
`??` short-circuits, so this was expected to be a rare legacy path — measured,
it is the normal path: **80 of 80 real conversations carry `projectId: null`
in their header and fall through to the log on every single refresh.**

**Direction.** Having no project is a normal state, not a reason to consult a
history log. Record it in the session header the way every other summary field
is, or read the tail of the log instead of all of it.

**But look at item 4 of `simplification-backlog.md` first.** No conversation
can be *given* a project — the whole projects feature has no reachable
entry point — which is why 80 of 80 headers are null. Deleting the feature
removes this cost entirely; optimising the fallback alone leaves the dead
feature in place. They are one change.

## 5. Permanently deleted conversations are never gone from scans

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

## 6. Whole-directory scans repeated inside one operation

**Cost.** Negligible at present scale. Listed so it is a known cost rather
than a surprise when a data directory grows.

**Source.** `softDeleteSession`, `restoreDeletedSession` and
`permanentlyDeleteSession` each call `allSessionSummaries`, itself two full
scans; the 30-day sweep calls `permanentlyDeleteSession` once per expired
entry, making that pass quadratic in the number of conversations.

## 7. Waiting for a subagent polls instead of awaiting

**Cost.** Up to 250 ms of dead time after a subagent has actually finished,
every time the lead conversation waits for one. Not a CPU cost — the poll is
cheap — but it is latency added to a feature whose whole point is delegation.

**Source.** `SessionService.waitForSubagentResult` loops on `sleep(250)`
against a 600-second deadline, checking `busy` / `isStreaming` flags, rather
than awaiting the run's own completion promise.

**Direction.** The run already resolves a promise when it ends; wait on that
and keep the deadline as a timeout around it.

---

## Checked and found fine

Recorded so nobody re-investigates these:

- **Streaming markdown** already freezes blocks finished by a blank line and
  re-parses only the growing tail (`MarkdownBody`). The naive "re-parse the
  whole message per token" cost is not present.
- **Bundle size.** 3.8 MB of JavaScript is built, but Mermaid, Cytoscape and
  KaTeX are behind a dynamic `import()`; first paint loads roughly 500 KB from
  localhost. Not worth work.
- **Startup** performs one full conversation scan (the Trash retention sweep
  runs immediately on boot) — 54 ms at 500 conversations. Electron and
  Chromium dominate launch time; this does not.
- **models.dev metadata** was made non-blocking in alpha.6; the provider list
  no longer waits on a third-party host.

## Found in the same review, not performance

Kept here so they do not become a second fragment; move them out if this file
ever needs to stay purely about cost.

**The 30-day Trash sweep stops at the first damaged conversation, silently.**
`purgeExpiredDeletedSessions` re-throws any error that is not the English
string `Close the conversation…`, so one unreadable session directory aborts
the whole pass, and the failure goes to a console no desktop user sees. Trash
then quietly stops emptying while the interface keeps promising 30-day
removal. Fail per entry, and stop deciding control flow by matching an English
error message.

**A/B comparison arms are orphaned by Delete — live in Beta 1.** `ab-arm`
children are neither list members nor deletion-cascade targets, so deleting
the parent leaves each arm on disk holding a copy of the parent transcript,
absent from both the conversation list and Trash, with no way to remove it:
the user believes the conversation is gone and it is not.

This was first recorded as latent on the strength of a grep for
`compareResponses` — a name taken from a doc comment. The real method is
`generateAbComparison`, and it has a complete chain: the Workbench "Compare
responses" button → `Comparison.tsx` → `server.ts:1478` → arms forked as
`ab-arm`. `researcherDoorOpen()` returns true for any local install, so the
button is reachable on every Beta 1 machine. **The bug is live.**

The cascade fix is one word — add `"ab-arm"` to the deletion targets in
`attachedDeletionTargets`. Whether arms should instead become visible
conversations like Branches is a product question and remains open; see item
15 of `simplification-backlog.md`.

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
  guard in item 1 then rejected `abort` — the only button that could have
  stopped it. Delete now aborts everything it moves into Trash, subagents
  included.
- Trash listed conversations already emptied by hosted private retention as
  recoverable, breaking the retention promise and offering a Restore that
  could only return a blank conversation. Membership is now an allowlist.
