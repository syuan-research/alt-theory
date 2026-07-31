# Search, Sources, and Web Content

Live lookup lets what the agent tells you be checked against the world.

## What lookup exists (Work mode)

- Academic search queries scholarly indexes (OpenAlex and Crossref)
  directly, returning verifiable metadata: title, year, DOI, citation
  counts, and abstracts. No account or key needed. It is the first choice
  for literature, because a DOI-bearing result is a reference you can hand
  to a colleague.
- General web search covers current events, software documentation, and
  institutional pages. Also keyless.
- Page fetching retrieves a specific page as readable text, so claims can
  be quoted with their source. Two tiers: a fast default, and a heavier
  browser-based tier for journal sites behind anti-bot walls (a separate,
  larger install offered through [guided setup](helper-and-guidance.md)
  when first needed).

The Toolbox "Look something up online" entry invokes this; so does
asking. Search tools that need installation propose it once, through the
approval flow.

## The provenance rule

Every factual statement the agent gives you belongs to exactly one of
three categories, kept distinct:

- Found now: a tool returned it in this conversation. It comes with its
  link or DOI.
- Model memory: recalled but not verified now. Marked unverified
  (citations explicitly, for example "[Author, year?] - unverified"), or
  withheld.
- Inferred: reasoned from other things. Said in so many words.

Two corollaries you will notice:

- A handful of results is a biased sample. One snippet supports "one
  source says", never "the field agrees". When results conflict, you get
  the spread, not a silent pick.
- A synthesis names which sources it actually read. "Read all 40 PDFs"
  means 40, or it is not said.

No system makes fabrication impossible. An unlabelled claim is a bug worth
[reporting](../README.md#releases-bug-reports-and-the-research-program).

## Paywalls and access limits

Fetching does not bypass paywalls. If a page shows the public an abstract
only, that is what the agent gets, and it says "abstract only". Anti-bot
walls on journal sites are often passable with the protected fetch tier;
genuine paywalls are not.

## Understand mode: no live lookup

Understand has no live lookup; its bounded reach is the point of the mode.
For checkable facts, the agent gives its best current understanding
labelled by solidity (established, plausible but unverified, or unknown),
flags what would need verification, and never invents a citation it
cannot check. When verification becomes the task, switch to Work. The
Toolbox lookup entry in Understand says this instead of showing a disabled
button.

## Recovery

- Search returned nothing useful: try the other vertical (academic versus
  general), reformulate, or fetch a known-good starting page and follow
  its references.
- A fetch failed or returned a challenge page: the agent escalates to the
  protected tier where that is the diagnosis. If the tier is not
  installed, it proposes the install.
- A needed tool is not installed: the guided setup flow handles it, with
  your confirmation.
