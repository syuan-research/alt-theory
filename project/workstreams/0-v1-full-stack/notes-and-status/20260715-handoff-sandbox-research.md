# Handoff: Sandbox Research (parallel track, Windows-capable agent)

Date: 2026-07-15
Consumer: v1-alpha M3 (workspaces/approvals/sandbox). Research can start
immediately; it does not depend on M0–M2.

## Goal

Recommend the sandbox route for local Full mode with probe evidence, not
catalog reading. Design already assumes an enforceable sandbox is achievable
on all target platforms — by forking/modifying an existing Pi package if
necessary. The question is *which* base and *what* adaptation, not *whether*.

## Read first

- Spec §5 (workspaces, approval UI, sandbox): `project/roadmap/v1.0-alpha-product-spec.md`
- `project/compound/2026-07-03-decision-v0-6-ab-fallback-agent-boundary.md`
  (for the Pi-ecosystem-first decision style this research should follow)
- Installed Pi docs: `node_modules/@earendil-works/pi-coding-agent/docs/security.md`,
  `extensions.md`, `packages.md` (repo now on `@earendil-works/pi-*` ^0.80.3)

## Questions to answer with evidence

1. `pi-landstrip`: does its Windows LPAC AppContainer enforcement actually
   work in a packaged Electron/Node app (not just the pi CLI)? Probe: file
   read/write outside allowed roots, child processes, network reach.
2. What credible Pi-native alternatives exist in the current package catalog?
   Same probe for the top candidate(s).
3. Extension surface: what approval scopes (once/session/persistent) does the
   candidate expose through Pi's `confirm`/`select`/`input` UI context? Alt
   Theory must bridge these into a web UI — note anything that assumes a TTY.
4. If no candidate passes cleanly: which is the best *fork base*, what
   specifically must be modified, and roughly how large is that adaptation?
5. Interaction with additional working directories (spec §5.1): can allowed
   roots change mid-session, and at what cost?

## Deliverable

One compound decision record (`project/compound/2026-07-XX-decision-v1-sandbox-route.md`)
with probe transcripts/evidence paths, a recommendation, and the fork/adapt
scope if applicable. macOS-side validation will be done in the Mac dev
session; focus Windows evidence here.
