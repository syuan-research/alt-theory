# Agent Session History Research

This directory records reusable upstream knowledge about how coding-agent
harnesses persist, reconstruct, list, and display conversations. It is
research, not Alt Theory's product contract.

The current product behavior is documented in
`development/architecture/session-import-adapters.md`. Product choices are
recorded separately in dated decision documents.

## Evidence rules

Each factsheet states its evidence date and source:

1. upstream source code or official documentation, pinned to a commit/version;
2. bounded local structural inspection when no public storage contract exists;
3. another open-source reader only as comparative implementation evidence.

Empirical observations are labelled as such. Private transcript text, user
identifiers, machine paths, and raw evidence are not published. A current
factsheet is not a promise that future upstream versions keep the same format.

When an upstream format materially changes, add a dated correction or new
factsheet and link it here rather than silently rewriting the older evidence.
Do not create empty pages for unresearched harnesses.

## Current factsheets

- `2026-07-24-explore-opencode-session-storage.md`
- `2026-07-24-explore-codex-session-storage.md`
- `2026-07-24-explore-grok-build-session-storage.md`
- `2026-07-24-explore-claude-code-session-storage.md`
- `2026-07-24-explore-cc-switch-session-reader.md`

## Questions to answer for a researched harness

- What is the source-of-truth store, and which files/rows are indexes or
  caches?
- How are conversation roots distinguished from child/subagent activity?
- How does the harness choose its current leaf or current continuation state?
- How are messages, thinking, tools, images, attachments, errors, and
  provider/runtime metadata represented?
- What does compaction replace, preserve, or hide?
- How does the harness's own UI derive title, workspace, ordering, filtering,
  and visible transcript?
- Which facts are documented upstream, source-derived, or only empirically
  observed?
- What small part of this knowledge matters to Alt Theory import?
