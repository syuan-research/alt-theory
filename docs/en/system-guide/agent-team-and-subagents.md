# Agent Team and Subagent Sessions

A lead conversation can delegate bounded tasks to subagents. Subagents
are real sessions, not background jobs: they have their own conversation
history, run lineage, and right-rail visibility, and you can message them
directly.

## Spawning and messaging a subagent

The lead gets a small tool surface for delegation:

- spawn_agent starts a subagent on a bounded task
- send_to_agent sends it a message
- check_agent and wait_for_agents read its progress or block on it
- interrupt_agent cancels it
- list_agents shows the subagents under this lead

A subagent gets message_parent only, to report back. Up to three subagents
run at once; further first-runs queue in order.

## Mode and model

A subagent's mode is clamped to its parent's. An Understand parent spawns
only Understand children; a Work parent defaults new subagents to
Understand. The subagent's model tier can be lower, same, or higher than
the parent's, resolved against your configured models by cost. An
unresolvable tier falls back to same.

## Where subagents appear

A subagent opens in the right rail, like a BTW or Helper side conversation,
not in the comparison pane (that is for branch, edit, and same-prompt
retry). Its streaming output renders as markdown as it types. Switch
between children from the row of buttons above the side conversation.

## Adding a subagent to the conversation list

A subagent can be added to the conversation list as its own conversation.
Its origin is kept as a label (From subagent) rather than renamed. This is
the same "add to conversation list" action as for branches and side
conversations.

## Recovery

- A subagent seems stuck: check_agent, then interrupt_agent if needed. The
  subagent's partial work stays in its own session.
- A subagent finished but you missed it: its result is a message in its
  session, readable from the rail or the conversation list.
