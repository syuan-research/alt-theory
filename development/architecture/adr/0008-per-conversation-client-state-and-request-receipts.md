---
doc_type: architecture-decision
status: current
date: 2026-09-24
architecture: [session-lifecycle-and-turn-continuity, information-architecture]
source:
  - "Owner Decision 2026-09-24: state-architecture decision brief, review, and plan (P1/P2 revoked)"
---

# Per-conversation client state and request receipts

A conversation's client state has one owner and one transition function:
`reduce(state, input)` in `frontend/src/lib/conversation.ts`, behind
`useReducer` in `hooks/useConversation.ts`. Every place that shows a
conversation — the center today, the right pane, later tabs or side-by-side
views — uses the same module; the module does not know where it is drawn.

The state keeps the latest server snapshot whole. Run state, recovery
(Continue), Pi's queue and switches pending until the turn ends are read
from that snapshot only; `run_phase` feeds the detail label and nothing
else. The rows and the streaming turn are replaced in the same transition
when the turn ends, from rows the terminal event carries. Busy is derived
from this client's requests that have not been answered.

Any client message may carry a `requestId`. The server answers it exactly
once: `request_done` when accepted, or an `error` that carries the id. A run
request is accepted when its run has begun or its text entered Pi's queue;
a navigation when its attach messages were sent; a switch when its snapshot
was sent. A send whose answer was lost with the socket is settled by the
re-opened conversation's rows: found, it was sent; missing, its text goes
back to the editor.

On the server, subscriptions follow the logical conversation id rather than
the managed instance, so replacing an instance is internal and every window
keeps receiving. Every state-relevant transition publishes a snapshot to
every window.

## Decision history

Two earlier constraints are formally revoked by the Owner (2026-09-24):
"no new state machine, event bus, or status service" (an agent non-rule
from a 2026-09-05 refactor ticket that later reviews treated as binding) and
"no global state machine or generic ack/outbox" (an agent proposal adopted by
the 2026-09-17 plan). They are replaced by: one pure transition per
conversation, and a minimal request echo. Still not added: a state-management
library, a generic outbox, a second queue, or a retry framework.

## Considered alternatives

- Keeping the structure and adding DOM tests around it was rejected as the
  end state: callers would still compose setters, recognize instance swaps,
  and clear busy flags by hand; the tests would not take that knowledge back.
- A reducer that only reorganized the old setters, with the setters, refs,
  and sync effects kept beside it, was rejected: the old orchestration had to
  be deleted, not wrapped.
- An outbox with automatic resend was rejected: a send whose fate is unknown
  is settled once by the re-opened rows and otherwise returned to the user.
- Keying display rows by `entryId` was rejected: one assistant entry projects
  to several rows sharing it, and compaction rows have none; the projection
  assigns a stable row id instead.

## Consequences

- Adding a run phase or outcome is a change to the snapshot and phase unions,
  the reducer's exhaustive switch, and the label table; the compiler points at
  each.
- Adding a request that holds the conversation busy is one entry in
  `REQUEST_BUSY` (and a label, if it has one); nothing clears it by hand.
- Pure transition tests and replay tests (real `SessionService` events through
  the client transition) do not cover the real socket, mounting, or render
  identity; a desktop smoke and the Owner walkthrough do.
- The client can no longer show a setting change before the server confirms
  it; locally the round trip is a few milliseconds.
