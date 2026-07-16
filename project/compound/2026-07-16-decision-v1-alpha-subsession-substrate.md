# Decision 2026-07-16 — v1-alpha M5: sub-session substrate (not "subagents")

## Decision

M5's deliverable is an **in-process sub-session substrate** at the
`SessionService` level, not a narrow "subagent" feature. Subagents, A/B arms
(M6), `/btw`, and the helper are all thin configs over one primitive: a
**mediated in-process child session**, differing only in seed (fresh vs cloned)
and framing.

Build it by extending `SessionService` to spawn a child session that routes
through the existing `createManaged` chokepoint (→ security extension +
approval bridge, so the child is mediated AND has a real approval UI, i.e. not
headless), registers in the `sessions` map with a parent link, and is
independently promptable.

- **Fresh seed** → adapt `createSession`/`createManagedFromDirs` (new child,
  chosen role/skill/context).
- **Cloned seed** → `forkSession` (already exists; copies context + workspace).

Two trigger surfaces, one substrate:
- **Agent-initiated** (subagents): a custom tool the agent calls, whose
  `execute` spawns a child via `SessionService` and returns its result. This
  replaces the out-of-process `pi-subagents` package route.
- **User-initiated** (`/btw`, helper): frontend → `SessionService` spawn/fork.

## Why (carried from the post-M4 review, 2026-07-16)

- The entire Full security posture (policy checks + approval bridge) is bound
  **in-process, per `AgentSession`**, via `createManaged`. Any child that goes
  through `createManaged` inherits it for free.
- The selected-in-the-Codex-era out-of-process route (`pi --mode json -p
  --no-session` subprocesses) inherits **none** of it: no security extension,
  no guarded write, no writable-roots boundary, no audit — and `hasUI` is false,
  so escalations hard-fail. It punches a hole through §5.1/§5.3 for every
  multi-agent run. Rejected.
- The in-process substrate is already half-built: `forkSession` creates
  mediated in-process children today; the `sessions` map already holds
  concurrent sessions.
- Fresh context for subagents is the convention (confirmed across harnesses);
  cloning is only for `/btw`. In-process transport is orthogonal to fresh-vs-
  clone seed, so the substrate supports both — subagents stay fresh.

## Code truth verified (do not re-derive)

- `SessionService.sessions` is a `Map` of concurrent, independently-promptable
  sessions. `createManaged` (session-service.ts) binds the security extension
  (`extensionFactories`) + approval bridge (`bindExtensions({ uiContext })`)
  for **every** managed session. `forkSession` → `openManagedRuntime` →
  `createManaged`, so forks are fully mediated + non-headless.
- Pi's `ExtensionCommandContext.newSession/fork/switchSession` (types.d.ts:252+)
  are the **TUI single-active-session** model: they *replace* the active
  session / navigate the tree, with a `withSession(ctx)` callback on the
  replacement. They are the reference/analog, **not** the mechanism for
  concurrent subagents — the concurrent substrate is the app-level `sessions`
  map. Pi's reusable primitives underneath are per-session `AgentSession` +
  `SessionManager` branch/fork.

## Scope

- **In M5 (backend):** `SessionService.spawnChildSession({ parentSessionId,
  seed: "fresh" | "fork", selectors/skill/seedContext, mode })`; parent-child
  linkage; the agent-facing spawn tool; result collection; a concurrency cap.
- **Deliberately not in M5:**
  - The multi-conversation frontend (list/switch/independent input for child
    conversations) — that is the M7 design object (see round-2 observations B1).
  - Helper content — helper = fresh/fork seed + a helper skill **asset**; the
    asset content is authored later and stays out of hardcoded logic. The
    substrate is content-agnostic.
  - A/B execution — M6, but it is a thin config over this substrate: N children,
    **Pure-pinned** (real Pure = read/search + guarded workspace write, no
    bash/edit), same task, results into the existing `ab-records` schema.

## Open items for the implementing session

- Concurrency: cap and queue; provider rate limits; whether child turns run
  truly parallel or serialized.
- Result hand-back: how a subagent's final output returns to the parent turn
  (tool result) vs a user-visible child conversation.
- Addressing: stable child IDs + parent link in records for reopen/fork.
- Handoff note: context in this planning session is degraded (multiple
  compactions); M5 **implementation should start in a fresh session** using this
  doc + `20260716-v1-alpha-round2-observations.md` as the brief.
