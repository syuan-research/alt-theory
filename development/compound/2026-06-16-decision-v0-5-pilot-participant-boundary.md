---
doc_type: decision
category: architecture
date: 2026-06-16
slug: v0-5-pilot-participant-boundary
status: active
area: research-console participant pilot
tags: [v0-5, participant, auth, privacy, pilot]
---

# v0.5 Pilot Participant Boundary

## Background

Research Console v0.4 built the local researcher workbench: draft-first session
creation, same-session config changes, lineage, soft delete, Markdown
rendering, and provenance inspection. After deployment to the VPS mobile test
environment, the next product boundary changed. The immediate need is no longer
only local researcher testing; it is a deployed pilot system that can support
friends, colleagues, and later face-to-face study participants.

Private deployment evidence exists under the local ignored archive:

```text
%LLM_THEO_DEV_ROOT%/_archives/private-evidence/2-deployment-and-operations/2026-06-15-contabo-mobile-deploy/
```

The deployed environment currently uses Cloudflare Tunnel and nginx Basic Auth
as an outer gate. That does not provide app-level participant identity, session
ownership, role-condition tracking, or privacy semantics.

## Decision

The next product line is **v0.5.0**, not v0.4.1. v0.5.0 is a deployed pilot
participant system on top of the v0.4 workbench foundation.

Settled boundaries:

- Add app-level identity and session ownership. The backend must not hard-code
  who can use the system; accounts/participants are data-driven and manageable
  through a thin API or script first.
- Keep nginx Basic Auth or similar outer deployment protection as optional
  defense in depth. It is not the participant system.
- Support hand-created accounts/codes for the first pilot. Do not build
  self-registration or a full study-admin product in v0.5.0.
- Track role condition directly on account/session metadata. Do not rely on
  `project` as the participant condition mechanism.
- Keep the project feature intact for researcher workbench use, but hide it
  from participant flow.
- Use one frontend shell with view-mode gating, not separate participant and
  researcher apps.
- Participant view hides developer/researcher controls by default. A temporary
  facilitator debug unlock can show debug/researcher panels in the current
  browser for troubleshooting.
- Do not build global admin UI in v0.5.0. A minimal backend/script management
  surface is enough; disposable frontend admin polish can come later.
- Support session-level private mode in addition to account-level consent.
  Private sessions are excluded from researcher review/export and are hard
  deleted after seven inactive days.
- Private session retention uses `lastActivityAt + 7 days`. Opening a page
  without a new conversation/file action does not extend the timer.
- Workspace files in private sessions share the same seven inactive day
  retention. The participant should be able to download or delete them before
  expiry.
- Privacy copy must be honest: this is not end-to-end encryption. It is
  app-level exclusion from researcher UI/API/export plus automatic deletion.
- Default role slug for the user-led conceptual/theory mode is
  `role-conceptual-theory-companion`. Role-preset content is authored by the
  researcher/user, not by the SWE agent.
- Visual style polish and the designer mockup are deferred from the v0.5.0
  critical path. The mockup may later serve as a style reference, not a DOM
  replacement.

## Rationale

The v0.5.0 boundary is larger than a v0.4 patch because app-level identity,
participant isolation, privacy retention, and deployed pilot operation have
downstream consequences for data analysis, ethics, and future UI/admin work.

The design intentionally stays small:

- file-backed/data-dir backed records fit the current local/VPS architecture;
- hand-created accounts fit the first pilot better than a public registration
  flow;
- direct `roleCondition` metadata is more analysis-stable than inferring
  conditions through `project`;
- a single frontend shell avoids maintaining two app surfaces while the UI is
  still moving quickly;
- facilitator debug unlock handles face-to-face and remote troubleshooting
  without turning into a full support-access system.

## Alternatives Considered

- **Treat this as v0.4.1**: rejected because auth, participant identity, privacy
  retention, and deployed pilot use are product-boundary changes.
- **Use project defaults as participant conditions**: rejected for the pilot
  because `project` is still not a clear user-facing concept and would make
  analysis indirect.
- **Build full global admin UI now**: rejected because account management needs
  are still changing quickly. Backend contracts should stabilize first.
- **Keep all private workspace files after transcript deletion**: rejected for
  v0.5.0 because workspace files can also contain private content. A single
  seven inactive day retention is simpler and more honest.
- **Separate participant and researcher frontend apps**: rejected because the
  current frontend is a static single shell and duplicate DOM would create
  unnecessary maintenance cost.

## Consequences

Future v0.5.0 feature designs must treat participant identity, role condition,
session ownership, privacy/retention, and view-mode authorization as shared
contracts. Frontend hiding is not sufficient by itself; backend APIs must avoid
returning private or cross-participant data to unauthorized views.

The researcher can still iterate role-preset content independently. The SWE
work only records and routes role slugs/conditions.

## Related Documents

- `project/workstreams/0-frontend-and-research-console/notes-and-status/2026-06-16-research-console-v0-5-stage0-plan-record-v1.md`
- `project/workstreams/0-frontend-and-research-console/notes-and-status/2026-06-16-research-console-v0-5-swe-plan.md`
- `project/brainstorms/2026-06-14-brainstorm-participant-entry-study-config.md`
