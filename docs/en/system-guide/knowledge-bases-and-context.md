# Knowledge Bases and Context

A knowledge base (KB) is curated reference material the agent can consult
during a conversation: domain sources chosen and organized in advance,
distinct from any one project's working files.

- A working folder is your project: the files you are working on,
  attached so the agent can act.
- A knowledge base is reference: stable material the agent draws on to
  ground a discussion.

A conversation can have both, either, or neither.

## Enabling

The KB picker near the composer selects the knowledge base for this
conversation. The app ships domain knowledge bases (environmental
psychology core is the first); you can add your own
([Customization](../advanced/customization-without-changing.md)). Choosing
none means no KB is available; working folders and attachments are
unaffected. Change the KB mid-conversation; it applies from the next
turn.

## How the agent uses a KB

Enabling a KB does not force a lookup on every turn. The agent knows the
KB is available and what it covers, and consults it by judgment when the
discussion calls for grounding, the same way it decides to read a project
file.

## Recovery

- Answers ignore the KB: check the picker shows a selection rather than
  none, and consider whether the question genuinely touches the KB's
  domain. The agent does not force irrelevant material in.
- Changed the KB mid-conversation and things look stale: the change
  applies to new turns; earlier answers were grounded in what was active
  then. Re-ask the question that matters.
