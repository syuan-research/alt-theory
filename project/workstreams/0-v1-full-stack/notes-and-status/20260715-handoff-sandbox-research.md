# Handoff: Full-Mode Security Layer Evaluation (parallel track)

Date: 2026-07-15 (rewritten same day: the earlier OS-sandbox framing is
withdrawn — the owner set the target at average production-harness security,
spec §5.3. No Windows LPAC probe is needed.)

Consumer: v1-alpha M3 (workspaces/approvals/security). Research can start
immediately; it does not depend on M0–M2. Platform-agnostic — fine to run on
the Windows machine.

## Goal

Recommend the policy-security route for local Full mode with hands-on
evidence. Target posture: what OpenCode / Claude Code ship by default —
command/path/network guards plus user approvals. OS/VM isolation is out of
scope (future hardening).

## Read first

- Spec §5 (workspaces, approvals, security layer):
  `project/roadmap/v1.0-alpha-product-spec.md`
- Installed Pi docs: `node_modules/@earendil-works/pi-coding-agent/docs/security.md`,
  `extensions.md` (tool_call interception, ctx.ui), `packages.md`

## Questions to answer with evidence

1. `@vtstech/pi-security` (first candidate, MIT, zero-dep, actively
   maintained): install it against Pi ^0.80 and probe — do its path guards
   accept configurable allowed roots that match our primary + additional
   working-directory model (spec §5.1)? Can roots change mid-session?
2. Which of its modes fits scholar users? `max` blocks package management and
   dev tooling — likely too strict for Full's use cases; check what `basic`
   leaves open and whether per-rule configuration exists.
3. Does anything in it assume a TTY? Alt Theory bridges extension UI into a
   web frontend; confirm its prompts/status surfaces work headless or degrade
   cleanly.
4. Audit log: can the JSONL path be pointed into the session records area?
5. Are there credible catalog alternatives worth preferring? Same probe for
   any serious contender.
6. If gaps exist (e.g. multi-root support), what is the smallest adaptation:
   configuration, upstream PR, or a light fork?

## Deliverable

One compound decision record
(`project/compound/2026-07-XX-decision-v1-security-layer.md`) with probe
evidence, the recommended package + configuration, and the adaptation scope
if any.
