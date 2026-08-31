# Bundled Skills

The bundled skills are Alt Theory's methods, written down. Each is a
readable file you can inspect. Your own skills can take precedence
([Add and Manage Skills](add-and-manage-skills.md)).

## Looking things up

- search-policy governs every search: when live lookup is worth it, the
  three-way provenance rule (found now, memory, inferred), handling of
  thin results, and the fallback when verification is impossible. Applies
  in both modes; in Understand it governs the no-lookup fallback.
- web-search (Work) does live general and academic search. Academic
  queries return DOIs, years, and citation counts; general queries use
  keyless web search. First use may propose a small tool install.
- page-fetch (Work) retrieves a URL as readable text for quoting with
  sources. Two tiers: a fast default, and a heavier browser tier for
  journal sites behind anti-bot walls. Does not bypass paywalls.

## Working on documents and text

- doc-convert (Work) converts documents (docx, pptx, xlsx, pdf to
  markdown) and produces new document files. Converted copies get a
  `_converted` suffix; originals are untouched.
- precise-edit does restrained editing for near-final text: accuracy
  without restructuring, your choices preserved, placeholders never filled
  uninvited.
- workspace-conventions governs where agent-created files go: read the
  project structure first, keep plan-records with established durable status
  records, group working outputs by plan or coherent work, leave originals
  untouched, and do not reorganize without invitation.

## Running the collaboration

- adaptive-aligning is the alignment interview for direction-setting work:
  batched questions, each carrying the agent's own best guess, so
  high-confidence points become confirmations. Triggers when you ask to
  align, or when acting on guesses would be expensive.
- adaptive-planning works with a provisional goal map for ongoing work:
  each Stage is a complete action-and-checking arc, and every Stage ends with
  user alignment before the next begins. Its plan-record persists across
  conversations and records what action changed, including future branches.
- conversation-summary turns the current conversation into a saved
  markdown summary or handoff note, provenance preserved, open questions
  kept open.
- imported-session-context governs
  [imported](imports-and-continuity.md) conversations: read current files,
  never invent what the import did not carry, answer what-was-lost
  questions from the import's records.

## The app itself

- alt-theory-help is the Helper's skill: answers from current
  documentation, uses runtime state, and says what it could not verify. Its
  internal procedures also cover consent-based setup and checking a model's
  image support. Those are not separate user-facing skills.

## Delegation

The agent-team tool surface (spawn_agent, send_to_agent, check_agent,
wait_for_agents, interrupt_agent, list_agents; subagents get
message_parent) is the substrate for subagent delegation, not a skill. See
[Agent Team and Subagent Sessions](agent-team-and-subagents.md).
