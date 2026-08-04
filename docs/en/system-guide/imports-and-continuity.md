# Imports, Handoffs, and Cross-Harness Continuity

Import conversations from other harnesses and continue them; hand work
outward when you leave.

## Importing

Sources: Claude Code, Codex, OpenCode, Grok Build (and Pi-format sessions
come in directly, see
[Cross-Harness Work](../advanced/cross-harness-work.md)). The import entry
lives where conversation creation lives.

The flow:

1. Discovery finds the source's conversations on this computer and lists
   them, searchable, recent first.
2. Preview fully checks the selected conversation before anything is
   created; you see what the import will carry.
3. Import turns it into a normal Alt Theory conversation: readable
   history, continuable, named for its source.

Nothing in the source is modified. Import reads, never writes back.

## What the import carries

- Carried: your messages and the assistant's, tool activity, images and
  attachments where recoverable, compaction summaries where the source
  stored them readably.
- Labelled, not faked: content the source recorded but the import cannot
  replay (an unexportable attachment, provider-private state) appears as a
  labelled placeholder saying exactly what was there. Full source records
  are kept alongside as searchable evidence.
- Refused, not invented: a source the importer cannot represent
  truthfully is refused with a stated reason.

The transformation list is stored with the conversation; the agent
answers "what was lost?" from that record.

## Continuing an imported conversation

The first turn picks up the thread. The agent treats imported context as
usable, and because the world may have moved, its first move on real work
is to read your current files, then ask about specific things that look
moved. Re-importing a changed source creates a new copy; it never merges
into your continuation.

## Handing work outward

- Conversation summaries and handoff notes (a
  [bundled skill](bundled-skills.md#conversation-summary)) land as
  markdown with provenance, readable by a collaborator or another tool.
- Conversations are stored in Pi's format; a conversation can be continued
  in Pi and back. See
  [Cross-Harness Work](../advanced/cross-harness-work.md).

## Verify and recovery

- What did this import carry? Ask the agent, or check the conversation's
  import record.
- Not listed for import: the source's data must be on this computer, and
  the source must be supported. See
  [Common Questions](../help/common-questions.md).
- Import refused: the reason shown is real, usually incomplete or
  ambiguous source records. The source conversation stays intact.
