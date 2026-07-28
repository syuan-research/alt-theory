# Knowledge Bases and Context

A **knowledge base** (KB) is curated reference material the agent can
consult during a conversation — a body of domain sources chosen and
organized in advance, distinct from the working files of any one project.

## Knowledge base vs working folder

The two are easy to conflate and worth keeping apart:

- A **working folder** is *your project*: the files you are currently
  working on, attached so the agent can act there.
- A **knowledge base** is *reference*: stable material the agent may draw
  on to ground a discussion — like the difference between your desk and
  the shelf behind it.

A conversation can have both, either, or neither.

## Enabling and disabling

The KB picker near the composer selects the knowledge base for this
conversation. The app ships with domain knowledge bases (the current
catalog shows what is installed — environmental psychology core is the
first); you can add your own
([Customization](../advanced/customization-without-changing.md)).

Choosing **none** means no knowledge base is available to consult —
nothing else changes; working folders and attachments are unaffected. You can change the KB
selection mid-conversation; it applies from the next turn.

## How the agent actually uses a KB

Honest expectations matter here. Enabling a KB does not force a lookup on
every turn, and it does not turn the agent into a search engine over
those files. What actually happens: the agent knows the knowledge base is
available and what it covers, and consults it by judgment when the
discussion calls for grounding — the same way it decides to read a
project file. You can always direct it explicitly: "check this against
the KB", "what does the knowledge base say about X" — explicit requests
are the reliable path when a specific source matters.

## Verify

- **Is a KB active?** The KB picker shows the current selection at a
  glance.
- **Was it actually used?** Consultations are visible as tool lines
  (reads within the KB) in the response. If you need certainty for a
  specific claim, ask directly: "did that come from the knowledge base,
  and from which file?" — the provenance discipline applies to KB
  material like everything else.

## Recovery

- **Answers ignore the KB**: ask explicitly (see above); check the KB
  picker actually shows a selection rather than none; and consider
  whether the question genuinely touches the KB's domain — the agent
  does not force irrelevant material in.
- **Changed the KB mid-conversation and things look stale**: the change
  applies to new turns; earlier answers were grounded in what was active
  then. Re-ask the question that matters.
