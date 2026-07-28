# Search, Sources, and Web Content

Live lookup exists in Alt Theory for one reason: so that what the agent
tells you about the world can be checked against the world. This page
covers what lookup is available, the provenance discipline behind it, and
what happens when lookup is not available.

## What lookup exists (Work mode)

- **Academic search** — scholarly indexes (OpenAlex and Crossref) queried
  directly, returning verifiable metadata: title, year, DOI, citation
  counts, and abstracts. No account or key needed. This is the first
  choice for literature, because a DOI-bearing result is a reference you
  can actually hand to a colleague.
- **General web search** — for everything else: current events, software
  documentation, institutional pages. Also keyless.
- **Page fetching** — retrieve a specific page as readable text, so
  claims can be quoted with their source. Two tiers: the fast default,
  and a heavier browser-based tier for journal sites behind anti-bot
  walls (a separate, larger install offered through
  [guided setup](helper-and-guidance.md) when first needed).

The Toolbox's "Look something up online" entry invokes this; so does
simply asking. Search tools that need installation propose it once,
through the approval flow.

## The provenance rule

Every factual statement the agent hands you belongs to exactly one of
three categories, and it is required to keep them distinct:

- **Found now** — a tool returned it in this conversation. It comes with
  its link or DOI.
- **Model memory** — recalled but not verified now. It is marked
  unverified (citations explicitly so, e.g. "[Author, year?] —
  unverified"), or withheld.
- **Inferred** — reasoned from other things. Said in so many words.

Memory never wears the costume of a search result. This single rule is
most of what makes the product's literature work trustworthy. (Honesty
about the rule itself: it is enforced through the product's instructions
and methods, and it holds up well in testing — but no system makes
fabrication impossible. If you catch an unlabelled claim, that is a bug
worth [reporting](../help/releases-and-further-help.md), not a nitpick.)

Two corollaries you will notice in practice:

- **Sample-size honesty.** A handful of results is a biased sample: one
  snippet supports "one source says", never "the field agrees". When
  results conflict, you get the spread, not a silent pick.
- **Coverage honesty.** A synthesis names which sources it actually
  read. "Read all 40 PDFs" means 40, or it is not said.

## Paywalls and access limits

Fetching does not bypass paywalls. If a page shows the public an abstract
only, that is what the agent gets — and it will say "abstract only" and
work within it rather than padding the gap. Anti-bot walls on journal
sites are often passable with the protected fetch tier; genuine paywalls
are not, and pretending otherwise would be exactly the kind of fabrication
this product exists to avoid.

## Understand mode: no live lookup, honestly handled

Understand has no live lookup by design — its bounded reach is the point
of the mode. For checkable facts, the agent's default there is calibrated
honesty: it gives its best current understanding labelled by solidity
(established / plausible-but-unverified / unknown), flags what would need
verification, and never invents the citation it cannot check. When
verification becomes the task, switch the conversation to Work — the
Toolbox lookup entry in Understand says exactly this instead of showing a
disabled button.

## Verify

- Whether a claim was found or recalled: it is labelled; if a label is
  ever missing, ask — "was that found now or from memory?" is a normal
  question with a required honest answer.
- What a search actually did: tool lines show each query and fetch.

## Recovery

- **Search returned nothing useful**: try the other vertical (academic vs
  general), reformulate, or fetch a known-good starting page and follow
  its references. A vague question benefits from a cheap partial search
  first — search and question sharpen each other.
- **A fetch failed or returned a challenge page**: the agent escalates to
  the protected tier where that is the diagnosis; if the tier is not
  installed, it proposes the install rather than failing silently.
- **A needed tool is not installed**: the guided setup flow handles it,
  with your confirmation, in the conversation.
