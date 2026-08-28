---
doc_type: architecture
slug: researcher-console
scope: Current researcher-facing frontend surfaces and their provisional study/review surfaces
summary: Implemented researcher-mode surfaces in the shared React shell; study workflow meaning remains provisional.
status: current
last_reviewed: 2026-08-28
tags: [frontend, researcher-console, research, view-modes, ia]
depends_on:
  - information-architecture
  - research-identity-visibility-privacy-and-retention
implements: []
---

# Current Researcher-Facing Surfaces

This is a current-fact document for researcher-facing frontend surfaces. It is
not a high-level product module and does not define the unfinished researcher
workflow. The identity, ownership, visibility, privacy, and retention contract
lives in
[`research-identity-visibility-privacy-and-retention.md`](research-identity-visibility-privacy-and-retention.md).
Surface placement remains governed by
[`information-architecture.md`](information-architecture.md).

The React frontend is under `alt-theory-app/frontend/` and is built to
`web-server/public-v6/`. Backend authorization remains authoritative even when
the frontend hides a surface.

## Current maturity

The shared shell has implemented researcher-facing surfaces, but the product
story around study setup, comparison protocol, and review is not settled. The
current code is therefore documented as surface fact, not as a complete
researcher product model. A partially implemented surface may remain here while
its user story is unresolved; unresolved goals and pause reasons do not belong
in this file.

The private development workstream retains the unresolved study object and
lifecycle, study/batch meaning, A/B protocol, Review scope, export assumptions,
and the reason a feature is paused. Do not expose that private workspace layout
here or turn those proposals into current public Architecture.

## Two presentation modes

Only **user** and **researcher** presentation modes exist. The old
three-state debug model is not a current mode. The researcher door changes the
shared shell's presentation mode; it does not create a second frontend app.

Current designation/auth facts and the backend gate are documented in the
research identity module. The frontend applies the researcher shell class from
the current view mode (`frontend/src/components/shell/Shell.tsx`); this is a
presentation fact, not an authorization claim.

## Researcher workbench

The researcher mode replaces the ordinary left navigation with the current
workbench. It has two tabs:

- **Setup** shows the current role, knowledge selection, effective model, and
  optional study tag. It also exposes the implemented researcher actions
  `Compare responses`, `View as participant`, and `Open review`.
- **Sessions** lists the currently loaded catalog sessions that carry a study
  tag. Selecting one returns to the app surface and opens that session.

Code: `frontend/src/components/shell/Workbench.tsx`.

## Researcher-only detail and review

The shared right inspector contains researcher-only detail tabs for Records,
Provenance, Paths, and Runtime. The exact global pane placement is owned by the
IA document; this file only records that these surfaces exist in the current
shell.

The current Review route reads comparison records from the selected session
detail and renders them without mutating live conversations. It currently shows
comparison id, creation time, arms, selected arm, and decision time. It is a
per-session records view, not a settled cross-study review or export product.

Code: `frontend/src/components/shell/InspectorPanel.tsx` and
`frontend/src/components/shell/ReviewPage.tsx`.

## Current comparison facts and limits

The researcher workbench exposes the current comparison action. Comparison
records are persisted and the Review route reads the records layer. The
comparison, choice, continuation, and export semantics are not established by
this document. Do not infer an unfinished protocol from the presence of the
buttons or records.

## Verification anchors

- `alt-theory-app/frontend/src/components/shell/Shell.tsx`
- `alt-theory-app/frontend/src/components/shell/Workbench.tsx`
- `alt-theory-app/frontend/src/components/shell/ReviewPage.tsx`
- `alt-theory-app/frontend/src/context/AppProvider.tsx`
- `development/architecture/information-architecture.md`
- `development/architecture/research-identity-visibility-privacy-and-retention.md`
