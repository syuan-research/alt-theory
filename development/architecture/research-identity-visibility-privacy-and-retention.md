---
doc_type: architecture
slug: research-identity-visibility-privacy-and-retention
scope: Account and install designation, session ownership and visibility, hosted/local privacy meaning, retention, and researcher access
summary: The current identity, access, privacy, and retention contract for research-designated Alt Theory use
status: current
last_reviewed: 2026-08-28
tags: [research, identity, privacy, retention, access]
depends_on: [core-session-engine]
implements: []
---

# Architecture: Research Identity, Visibility, Privacy, and Retention

This document records the current product/data contract for research identity
and access. It does not define the larger researcher-console workflow, study
design, comparison protocol, or Review-page product meaning. Those surfaces are
implemented unevenly and remain provisional; see
[`researcher-console.md`](researcher-console.md).

The contract below is implemented, but its boundary is not perfectly isolated
in code. Account/auth, session records, REST authorization, WebSocket session
creation, and the frontend designation gate are separate code paths. They must
preserve the same meanings.

## Deployment modes

`ALT_THEORY_MODE` selects the deployment. It defaults to `local`; `hosted` must
be selected explicitly. The Electron bundle and local development scripts set
local mode. The hosted mode is the VPS study deployment.

The two modes deliberately use different visibility vocabularies:

| Deployment | Session values | Default | Meaning of the withheld value |
|---|---|---|---|
| Hosted | `research` / `private` | `research` | The participant's content is withheld from ordinary researcher/admin content access and receives hosted private retention. |
| Local | `exportable` / `no-export` | `exportable` when the install is designated, otherwise `no-export` | A marker for a future/manual export decision. It does not hide, upload, or delete local content. |

`isVisibilityForMode()` rejects a value from the other vocabulary. The local
`no-export` marker and hosted `private` value both indicate that content is
withheld from research use, but only hosted `private` carries deletion
semantics.

Code: `alt-theory-app/web-server/server.ts` (`appMode`, `localMode`, and draft
visibility), `alt-theory-app/web-server/session-records.ts`
(`SessionVisibility`, `isVisibilityForMode`, `withholdsFromResearch`).

## Identity and designation

Hosted accounts are data-directory records with one of three roles:
`participant`, `researcher`, or `admin`. Login codes are stored as scrypt hashes;
the browser receives an HttpOnly process-local session cookie. Disabled or
missing accounts invalidate the browser session. There is no self-registration
or global admin UI in this contract.

Local installs have no account identity. An install-level participant
designation is stored in `app-settings.json` as
`participant { designated, label }`; absent means the ordinary GitHub-download
posture. When accounts are configured, `/api/auth/me` derives designation from
the authenticated participant role; otherwise local mode reads the install
flag. The designation controls whether researcher-only study surfaces render
and seeds the local sharing default. It is not a claim that the local install
can upload data.

The session-level research identifier is optional `studyTag { studyId, batch? }`.
Absent means ordinary daily use. When present, it identifies the session for
the current researcher workbench and record/review surfaces; it does not itself
grant access or change privacy.

Code: `alt-theory-app/web-server/auth-accounts.ts`,
`alt-theory-app/web-server/auth-session.ts`, `alt-theory-app/web-server/app-settings.ts`,
`alt-theory-app/web-server/server.ts` (`/api/auth/me` and designation/default
helpers), and `alt-theory-app/web-server/session-records.ts` (`StudyTag`).

## Ownership and content access

On hosted participant creation, `ownerAccountId`, role condition, visibility,
consent snapshot, and activity/retention fields are written to
`records/session.json`. Participant session summaries are filtered to the
authenticated owner. A researcher or admin can inspect ownerless researcher
sessions and participant-owned sessions when content is not private.

Participant drafts inherit the account's `defaultRoleCondition` when it
resolves; researcher, admin, anonymous, and ordinary local drafts start without
a role preset unless one is selected explicitly.

Hosted private content is owner-only: normal researcher/admin detail,
transcript, change, and file routes reject it. A participant can access only
their own session content. Local mode intentionally short-circuits these hosted
account/content gates because the data is on the user's machine and is not
served as a multi-user research deployment. When no account store is configured,
anonymous local/workbench compatibility remains available.

Frontend hiding is only a presentation gate. Backend REST and WebSocket checks
remain the authority for session summaries, detail, content, and visibility
changes.

Code: `alt-theory-app/web-server/server.ts`
(`canAccessSessionSummary`, `canAccessSessionContent`,
`requireSessionRestContentAccess`, and `sessionCreationMetadataForAuth`),
`alt-theory-app/web-server/session-store.ts`, and
`alt-theory-app/web-server/session-records.ts` (`V4SessionHeader`).

## Visibility and consent changes

The first draft receives a deployment-appropriate visibility default. A
participant's account consent defaults are copied into the session's
`consentSnapshot`; selecting a withheld value forces researcher readability and
quoting consent off and sets `privateOverride`.

Before materialization, visibility is draft state. After materialization,
`switch_visibility` validates the deployment vocabulary and updates the session
record through the session service. The same session-level switch therefore
does not change account designation or the meaning of the deployment mode.

The hosted/local distinction is a privacy promise, not encryption or
end-to-end secrecy. Local mode has no automatic upload path in this contract;
the marker becomes relevant only if a later export flow consumes it.

## Hosted private retention

Only hosted sessions with `visibility: private` receive retention. Their due
time is `lastActivityAt + 7 days`. A meaningful prompt and reopening refresh
activity; catalog/detail reads do not. The hosted server runs the sweep at boot
and daily, and does not delete a currently open session.

Expiry hard-deletes the session's history, workspace, branches, and records,
then leaves `records/deleted.json` as a tombstone. Local sessions never receive
`retentionDueAt` and never run this sweep. Changing the visibility away from
hosted `private` clears retention metadata.

Code: `alt-theory-app/web-server/session-retention.ts`,
`alt-theory-app/web-server/server.ts` (hosted-only sweep), and
`alt-theory-app/web-server/session-service.ts` (activity/visibility updates).
Tests: `alt-theory-app/web-server/session-retention.test.ts` and the relevant
session-service/session-store access tests.

## Researcher-facing boundary

The researcher console consumes this contract; it does not redefine it. Its
currently implemented workbench can show setup and study-tagged sessions, and
its Review route reads persisted comparison records. The product meaning of
study setup, cross-study review, A/B protocol, export, and any future participant
journey remains provisional and is not architecture fact here.

Changes to account roles, designation defaults, visibility meaning, ownership
access, or retention are product/data and ethical changes. They require owner
discussion before implementation. Mechanical updates that merely follow the
existing contract may update this document with verified code evidence.

## Verification anchors

- `alt-theory-app/web-server/auth-accounts.test.ts`
- `alt-theory-app/web-server/session-records.test.ts`
- `alt-theory-app/web-server/session-retention.test.ts`
- `alt-theory-app/web-server/backend-server.integration.ts`
- [`researcher-console.md`](researcher-console.md) for current researcher-facing surfaces
