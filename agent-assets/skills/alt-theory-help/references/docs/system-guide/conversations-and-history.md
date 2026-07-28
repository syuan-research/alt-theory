# Conversations and History

## The conversation list

The left panel lists your conversations, grouped by working folder, with
the most recent activity first. From the list you can:

- **Search** across conversation titles.
- **Open** a conversation to continue it.
- **Rename, delete, or duplicate** a conversation from its row menu —
  without opening it. Duplicate is branching from the end of the
  conversation, available from the list: an independent copy that shares
  the full history and then goes its own way.
- See each conversation's **state at a glance** when agents are active:
  running, finished with unread results, failed, or waiting for your
  approval.

New conversations name themselves after the first exchange — a short
generated title replaces the first-words placeholder. Renaming is always
yours; a manual name is never overwritten.

## Continuing and revising

Opening a conversation resumes it fully: history, mode, working folder,
knowledge base, and model choices persist. You can also reshape the line
itself:

- **Edit or revise an earlier message of yours.** The conversation
  continues from that point with your new wording; the turns after it are
  removed from the active line. The first time, the app explains this
  before doing it. Revising is how you fix a framing that sent the
  discussion somewhere unhelpful — cheaper than a new conversation,
  cleaner than arguing with the tangent.
- **Branch from any message** to pursue an alternative in a related
  conversation while the original stays intact.

What each option preserves is compared in
[Responses and Controls](responses-and-controls.md).

## Compaction: how long conversations continue

Models have a finite context window. When a conversation approaches it,
the app **compacts**: earlier turns are condensed into a summary the model
carries forward, and the conversation continues.

What you see and control:

- Compaction is **visible**: a divider marks the boundary, and the summary
  itself is right there, expandable — you can read exactly what the model
  now carries.
- It shows a **status while running**, and you can stop it; the
  conversation stays usable.
- You can trigger it deliberately with `/compact` at a natural resting
  point, rather than waiting for the limit.

What compaction means for your work: a summary is faithful but lossy. The
app's own posture is that load-bearing facts should not live only in the
transcript — decisions belong in a
[plan record](bundled-skills.md#adaptive-plan-record) or a file in your
working folder, which never compact. If a fact you stated long ago
matters and post-compaction responses seem to have lost it, restate it or
point the agent at the file that holds it; see also the honesty rules in
[Search, Sources, and Web Content](search-sources-web.md) — the agent is
instructed to flag rather than reconstruct what it no longer has.

## Exporting and sharing a conversation

Getting a conversation out is a first-class operation, in two forms for
two purposes:

- **For reading and sharing with people** — a
  [conversation summary or handoff note](bundled-skills.md#conversation-summary)
  as markdown, or an HTML export of the transcript: readable by a
  supervisor or collaborator with no special tools.
- **For continuing elsewhere** — the conversation's underlying
  Pi-compatible file, which another harness in the ecosystem can pick up
  and continue. Details:
  [Cross-Harness Work](../advanced/cross-harness-work.md).

## Verify

- **Which conversation am I in, and what is attached?** The composer area
  shows the active working folder, knowledge base, model, and mode.
- **Where does a conversation live?** Conversations are grouped by
  working folder in the list; conversation data itself is stored locally —
  see [Your Data and Privacy](data-and-privacy.md).

## Recovery

- **A turn was interrupted** (stop, crash, network): the conversation
  remains usable; already-completed actions are recorded in the transcript.
  Continue, or revise the interrupted request.
- **A conversation looks wrong after reopening** (missing tail, odd
  state): refresh once; if the problem persists, see
  [Troubleshooting](../help/troubleshooting.md) and include the
  conversation's approximate age and whether it was imported or compacted.
- **Deleted a conversation by mistake?** Deletion from the list is meant
  as removal — treat it as final. If it mattered, contact support channels
  in [Releases and Further Help](../help/releases-and-further-help.md)
  before doing anything else locally.
