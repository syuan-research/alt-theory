# Conversations and History

## The conversation list

The left panel lists your conversations, grouped by working folder, most
recent activity first. From it you can:

- search across conversation titles
- open a conversation to continue it
- rename, delete, or duplicate from the row menu. Duplicate is branching
  from the end: an independent copy that shares the full history and then
  goes its own way
- see each conversation's state when agents are active: running, finished
  with unread results, failed, or waiting for your approval

New conversations name themselves after the first exchange. A manual name
is never overwritten.

## Continuing and revising

Opening a conversation resumes it fully: history, mode, working folder,
knowledge base, and model choices persist.

- Edit or revise an earlier message of yours. The conversation continues
  from that point with your new wording; later turns leave the active
  line. The first time, the app explains this before doing it.
- Branch from any message to pursue an alternative in a related
  conversation while the original stays intact.

What each option preserves is compared in
[Responses and Controls](responses-and-controls.md).

## Compaction

When a conversation approaches the model's context limit, the app
compacts: earlier turns are condensed into a summary the model carries
forward, and the conversation continues.

- Compaction is visible. A divider marks the boundary and the summary is
  expandable.
- It shows status while running and can be stopped; the conversation stays
  usable.
- Trigger it deliberately with `/compact` at a resting point.

A summary is lossy. Put load-bearing facts in a
[plan record](bundled-skills.md#adaptive-plan-record) or a file, which
never compact.

## Deleting a conversation

Deleting a conversation hides it from the list. The data is not erased
immediately: it stays on disk as a tombstone record and is recoverable
until cleanup. If you delete by mistake, the conversation can be recovered
from the data directory before cleanup removes it. (On a hosted study
deployment, conversations marked private are the exception: they are
hard-deleted after seven inactive days.)

## Exporting

- For reading and sharing with people: a
  [summary or handoff note](bundled-skills.md#conversation-summary) as
  markdown, or an HTML export of the transcript.
- For continuing elsewhere: the conversation's Pi-compatible file, which
  another harness can pick up. See
  [Cross-Harness Work](../advanced/cross-harness-work.md).

## Recovery

- A turn was interrupted (stop, crash, network): the conversation stays
  usable; completed actions are recorded in the transcript.
- A conversation looks wrong after reopening: refresh once. If it
  persists, see [Common Questions](../help/common-questions.md), and note
  the conversation's age and whether it was imported or compacted.
