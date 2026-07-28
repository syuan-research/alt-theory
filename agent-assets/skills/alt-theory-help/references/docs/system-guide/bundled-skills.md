# Bundled Skills

The bundled skills are Alt Theory's methods, written down. Each is a
readable file you can inspect; together they cover how the product looks
things up, works on text and documents, runs the collaboration itself,
and helps with the app. Every entry below says what the skill does for
you, how it shows up in use, and where it applies.

Your own skills can take precedence over any of these — see
[Add and Manage Skills](add-and-manage-skills.md).

## Looking things up

### search-policy

The discipline behind every search: when live lookup is worth it, the
three-way provenance rule (found now / memory / inferred), honest
handling of thin results, and the calibrated fallback when verification
is impossible. You see it as the labelling on claims and citations in
every answer. Applies in both modes — in Understand it governs the
no-lookup honesty.

### web-search *(Work)*

Live general and academic search. Academic queries go to scholarly
indexes returning DOIs, years, and citation counts; general queries to
keyless web search. Shows up as search tool lines and as references you
can actually verify. First use may propose a small tool install.

### page-fetch *(Work)*

Retrieves a URL as readable text for quoting with sources. Two tiers:
fast default; heavier browser tier for journal sites behind anti-bot
walls (larger install, offered when first needed). Does not bypass
paywalls, and says so.

## Working on documents and text

### doc-convert *(Work)*

Converts documents (docx, pptx, xlsx, pdf → markdown) for reading, and
produces new document files on request. Converted copies appear next to
originals with `_converted`; your original is never touched.

### precise-edit

Restrained editing for near-final text: language accuracy without
restructuring, your deliberate choices preserved, placeholders never
filled uninvited, options offered as genuinely different alternatives
rather than synonym swaps. Shows up whenever you hand over mostly
finished prose.

### workspace-conventions

Where agent-created files go and how they are named: read the project's
own structure first, dated output folders, plans in `plans/`, originals
untouched, no uninvited reorganization. You see it as a working folder
that stays comprehensible after weeks of agent work.

## Running the collaboration

### adaptive-aligning

The alignment interview for direction-setting work: batched questions,
each carrying the agent's own best guesses so you can see how far apart
you are; high-confidence points become confirmations instead of
questions. Triggers when you ask to align (in several phrasings and
languages) or when acting on guesses would be expensive.

### adaptive-plan-record

A living plan document for multi-step work that outlives one conversation: goals first,
stages held loosely, what each action revealed, decided vs assumed vs
open. Lives in your working folder, so it survives conversation
compaction and hands off cleanly to later conversations or collaborators.

### conversation-summary

Turns the current conversation into a saved markdown summary or handoff
note — with provenance preserved (what you confirmed, what was developed
together, what is the agent's inference) and open questions kept open
rather than converted into conclusions.

### imported-session-context

Governs conversations [imported from another harness](imports-and-continuity.md):
continuity over suspicion — read the current files rather than hedge
about history, never invent what the import did not carry, answer
what-was-lost questions from the import's own records.

## The app itself

### alt-theory-help

The Helper's own skill: answers questions about Alt Theory from current
documentation, uses visible runtime state, and says what it could not
verify instead of inventing steps.

### setup-helper *(Work)*

Plain-language environment setup: installing what a skill needs,
provider and key configuration guidance, the optional browser tier. Its
rules are the ones you experience — explain before asking, never install
silently, verify afterward, report honestly.

### model-image-support

Checks whether a specific model can read images (against current provider
documentation, not name-guessing) and records the answer in your model
configuration so image attachments work.
