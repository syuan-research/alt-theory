# Imports, Handoffs, and Cross-Harness Continuity

Work you have already done in another AI tool does not have to stay
there. Alt Theory can import conversations from other agent harnesses and
continue them as its own — and hand work outward when you leave.

## Importing a conversation

Supported sources: **Claude Code, Codex, OpenCode, and Grok Build**.
(Pi-format sessions are Alt Theory's own native format and can be brought
in directly — see [Cross-Harness Work](../advanced/cross-harness-work.md).)
The import entry lives where its product appears: on the empty state when
creating a conversation, and in the navigation menu.

The flow:

1. **Discovery** — the app finds the source tool's conversations on this
   computer and lists them, searchable, recent first.
2. **Preview** — before anything is created, the selected conversation is
   fully checked and you see what the import will carry.
3. **Import** — the conversation becomes a normal Alt Theory
   conversation: readable history, continuable, listed with a name that
   says where it came from.

Nothing in the source tool is modified. Import reads; it never writes
back.

## What imports faithfully — and what does not pretend to

An imported conversation is a faithful but honest projection:

- **Carried**: your messages and the assistant's, tool activity, images
  and attachments where recoverable, and the conversation's own
  compaction summaries where the source stored them readably.
- **Labelled, not faked**: content the source recorded but the import
  cannot replay (an unexportable attachment, provider-private state)
  appears as a labelled placeholder saying exactly what was there. The
  full source records are kept alongside the conversation as searchable
  evidence.
- **Refused, not invented**: a source conversation the importer cannot
  represent truthfully — ambiguous history, unrecognized content — is
  refused with a stated reason. No plausible reconstruction, ever.

The complete list of what a given import transformed is stored with the
conversation, and the agent answers "what was lost in the import?" from
that record, not from guesswork.

## Continuing an imported conversation

The first turn behaves the way you would want a colleague to: pick up
the thread. The agent treats imported context as usable context — and
because the world may have moved since the import, its first move on real
work is to **read your current files**, then ask about the specific
things that look moved (a plan step now done, a file dated after the
import) rather than greeting you with disclaimers or "tell me what
changed".

Re-importing a source conversation that has since changed creates a
**new copy** — it never merges into or overwrites the Alt Theory
continuation you already have.

## Handing work outward

Continuity runs both directions:

- **Conversation summaries and handoff notes** — ask for one
  ([bundled skill](bundled-skills.md#conversation-summary)); it lands as
  a markdown file with provenance kept straight, readable by a
  collaborator, a supervisor, or another tool.
- **Pi-compatible sessions** — conversations are stored in Pi's format;
  a conversation can be continued in Pi and come back. The deep story:
  [Cross-Harness Work](../advanced/cross-harness-work.md).

## Verify / Recovery

- **What did this import carry?** Ask the agent, or check the
  conversation's import record — both answer from the same stored list.
- **My conversation isn't listed for import**: the source tool must have
  its data on this computer; check the source is supported (list above)
  and see [Troubleshooting](../help/troubleshooting.md) for per-source
  notes.
- **The import was refused**: the reason shown is the real one — usually
  the source's own records were incomplete or ambiguous at some point.
  What the importer cannot do is guess; the source conversation remains
  intact where it was.
