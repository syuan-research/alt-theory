---
doc_type: architecture-decision
status: current
date: 2026-09-13
architecture: [session-lifecycle-and-turn-continuity]
source:
  - "git commits 9c31de8, c77e894, and ce6ca6d"
  - "Owner 2026-09-15 correction: the delivery-signal mechanism was an agent implementation choice, not a separately approved Owner rule"
---

# Keep queued prompts Pi-owned and separate queue state from delivery

While a turn runs, Alt Theory uses Pi's steering and follow-up queues as the
live prompt authority. Alt mirrors those queues for cards, but a card leaving
the queue is not treated as delivery: the visible user bubble is emitted only
when Pi starts that still-tracked queued user message. Edit, Delete, Stop, and
Interrupt & send therefore mutate one Pi-owned queue and preserve Alt's
side-car attachment paths without creating a second browser or transcript
queue.

## Considered alternatives

- A browser-owned or Alt-owned parallel queue was rejected because it would
  compete with Pi's actual delivery order and make reconnect and abort
  reconciliation responsible for two authorities.
- Treating `queue_update` removal as delivery was rejected because Pi removes
  an entry before its queued user turn starts, and Retract or Stop also removes
  entries that were never delivered.
- Queue ids, a client outbox, and an accepted-message acknowledgement were not
  added without evidence that the remaining reconnect gaps require them.

## Consequences

- The client may render queue membership from `queue_update`, but only the
  tracked user's `message_start` may cause `user_steered` and its transcript
  bubble. The selected Interrupt & send text has a separate short-lived
  direct-prompt marker after it leaves Pi's queue; queue removal alone is not
  the confirmation.
- Pi has no per-entry mutation interface, so Edit and Delete clear and rebuild
  the remaining queue. The implementation matches by text; attachment side data
  is also keyed by text, so identical queued texts do not have distinct
  attachment identity.
- Interrupt & send stops and settles the current run, starts the selected entry
  as the next prompt, and attempts to re-queue every other entry as follow-up so
  none enters that selected prompt's first model request. A failed replay warns
  without rolling back the selected run; Pi's resulting queue remains truth.
- This decision does not claim an accepted acknowledgement between browser and
  server, or solve every reconnect/session-switch race. Those require focused
  evidence before expanding the protocol.
