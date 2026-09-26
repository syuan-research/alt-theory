---
doc_type: architecture
slug: research-identity-visibility-privacy-and-retention
scope: Access policy, install designation, the export marker, and what deletes a conversation
summary: The current access, study-designation and export-marker contract of the local app; the hosted study mode was removed on 2026-09-26
status: current
last_reviewed: 2026-09-26
tags: [research, identity, privacy, retention, access]
depends_on: [core-session-engine]
implements: []
---

# Architecture: Research Identity, Visibility, Privacy, and Retention

This document records the current access and research-designation contract.
It does not define the researcher-console workflow, study design, comparison
protocol, or Review-page product meaning; see
[`researcher-console.md`](researcher-console.md).

## One deployment: the local app

Alt Theory runs on the user's own machine, for one owner. There are no
accounts, no sign-in, and nothing deletes content the user did not delete.
The hosted
study mode (`ALT_THEORY_MODE=hosted`: accounts with participant / researcher
/ admin roles, per-owner session filtering, `research` / `private`
visibility, and hard deletion of private conversations after 7 inactive
days) was removed on 2026-09-26. The VPS study deployment that used it runs
an older release and is unaffected. `ALT_THEORY_MODE=local` survives only as
the development opt-in for the `~/.alt-theory` store paths
(`local-mode-paths.ts`).

## Access policy

Every REST route and WebSocket action that lists a conversation or touches
its content asks `web-server/access-policy.ts` (`AccessPolicy`:
`canList(viewer, sessionId)`, `canReadContent(viewer, sessionId)`). The
guards around it (`requireSessionRestContentAccess`, the WebSocket
`requireSessionWsContentAccess`, the list and activity filters) only check
that the conversation exists and is not in Trash. The one policy is
`localAccess`: the owner sees everything. A future multi-user deployment
supplies its own policy at this seam — deciding from the request and what it
keeps about each conversation — instead of adding inline rules to routes.
Routes that manage the machine's own model keys or write the user's own
folders are marked in `server.ts` as never to be exposed to other users.

## Study designation

An install-level participant designation is stored in `app-settings.json`
as `participant { designated, label }`; absent means the ordinary
GitHub-download posture. `GET /api/app` returns it. The designation controls
whether study surfaces render and seeds the export marker's default. It is
not a claim that the install can upload data.

The session-level research identifier is optional `studyTag { studyId, batch? }`.
Absent means ordinary daily use. When present, it identifies the session for
the researcher workbench and record/review surfaces; it does not grant access
or change privacy.

Code: `alt-theory-app/web-server/app-settings.ts`,
`alt-theory-app/web-server/server.ts` (`/api/app`, `defaultDraftVisibility`),
`alt-theory-app/web-server/session-records.ts` (`StudyTag`).

## The export marker

`visibility` on `records/session.json` is `exportable` or `no-export`: a
marker for a future export filter. It hides, uploads and deletes nothing.
New conversations default to `exportable` on a designated install and to
`no-export` otherwise. A `no-export` conversation carries a
`consentSnapshot` with research readability and quoting off and
`privateOverride` set. An old header's hosted `private` still reads as
withheld; old `ownerAccountId`, `roleCondition` and `retentionDueAt` fields
are ignored.

Before materialization the marker is part of the client's new-conversation
draft; the creating request carries it and the server checks the vocabulary
(`isSessionVisibility`). After materialization `switch_visibility` updates
the header through the session service; a switch during a run is accepted as
pending and applied at settle with the consent snapshot captured at
selection time (see
[`session-lifecycle-and-turn-continuity.md`](session-lifecycle-and-turn-continuity.md)).

## What deletes a conversation

Only the user does: Delete moves a conversation to Trash, and the Trash sweep
purges it 30 days later (`sweepExpiredDeletedSessions`), never while it is
open. Permanent deletion leaves `records/deleted.json` as a tombstone.

## Researcher-facing boundary

The researcher console consumes this contract; it does not redefine it.
Changes to designation defaults, the marker's meaning, or what deletes a
conversation are product/data and ethical changes and need owner discussion
before implementation.

## Verification anchors

- `alt-theory-app/web-server/session-records.test.ts`
- `alt-theory-app/web-server/session-deletion-lifecycle.test.ts`
- `alt-theory-app/web-server/backend-server.integration.ts` ("a local server
  serves every conversation, whatever an old header or account file says")
- [`researcher-console.md`](researcher-console.md) for current researcher-facing surfaces
