# Permissions, Approvals, and Agent Activity

This page is the canonical description of Alt Theory's trust model: what
the agent may do, what always asks first, how you see what is happening,
and what your choices mean.

## The model in plain language

You decide how much reach a conversation has, in layers:

1. **Understand mode** — no command execution, no live network, no
   project folders. The conversation, your attachments, and the selected
   knowledge base are the whole surface. Reads beyond that boundary
   surface an approval request.
2. **Work mode, inside your attached folders** — the agent works without
   asking turn by turn: reading project files, writing new ones, running
   the commands its skills describe. This is the boundary you set by
   attaching folders; within it, flow is the point.
3. **Work mode, at the boundary** — some things always ask, whatever
   folder they touch:
   - reading files or folders you have not attached;
   - network access beyond the built-in search and fetch tools;
   - installing anything;
   - operations the security policy flags (dangerous command patterns,
     paths escaping the workspace, suspicious network destinations).

## An approval request

When something crosses the boundary, the conversation pauses and shows
you: **the operation** (what exactly is being attempted) and **the
scope** (what saying yes grants). Your options are at minimum allow-once
and deny; where the underlying policy supports it, broader scopes (for
the rest of this conversation) are offered explicitly — never assumed.

Two properties worth trusting:

- **Deny is safe.** The agent absorbs a refusal and continues — it finds
  another path or tells you plainly what it cannot do without the access.
  Denying never corrupts the conversation.
- **No answer means no.** If a request times out or the conversation is
  closed, it resolves as rejection. Silence never becomes consent.

## Honest framing of what this is

These are consent and guard rails, not physical isolation: a policy
layer checks operations against rules, and approvals put you in the loop
at the boundary — the same posture as other production agent tools. It is
not an operating-system sandbox, and the docs will not call it one. Two
consequences:

- The protection is designed for **oversight of an honest agent doing
  real work**, not for containing actively malicious software.
- Extensions and tools you install run with your user's permissions —
  treat them as **trusted software**: install what you trust, from
  sources you trust, exactly as you would any program. (Skills are
  instructions rather than code, but the same install-what-you-trust
  rule applies.)

## Seeing what the agent is doing

Visibility is continuous, not just at boundaries:

- **In the conversation**: every action is a
  [tool line](responses-and-controls.md) as it happens — reads, writes,
  commands, searches, skill use — expandable for detail. A turn that
  changed files ends with the changed-files card.
- **Across conversations**: the conversation list marks each row's live
  state — running, finished-unread, failed, or **waiting for approval** —
  and a global indicator shows how many conversations are active. If the
  app window is in the background, finishing, failing, or blocking on an
  approval raises a system notification, so a conversation never waits
  silently for you all afternoon.

## Verify

- What is the agent doing right now? The status area shows the current
  phase; tool lines accumulate in real time.
- What did it actually change? The turn-end card and the file panel's
  change view, per turn and per file.
- What is waiting on me? The list states and the global indicator.

## Recovery

- **Denied something and the work stalled**: say what you would rather
  it do — a denial is a steer, not a dead end. If the access was
  genuinely needed, attach the folder or approve on re-request.
- **Approved something you regret**: an allow-once is spent when used;
  conversation-scoped approvals end with the conversation. Say so, and the
  agent will not repeat the operation.
- **An action was interrupted mid-flight** (stop, crash): completed
  steps are recorded in the transcript; nothing partial is hidden. Ask
  "where did that get to?" and continue from the honest answer.
