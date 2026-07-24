---
doc_type: explore
category: upstream-research
date: 2026-07-24
subject: Grok Build session persistence and current-history semantics
evidence: official package/source snapshot plus bounded local structural inspection
---

# Grok Build Session Storage

## Evidence boundary

The verified evidence is Grok Build `0.2.106` from the official
`@xai-official/grok` distribution, its bundled documentation/source snapshot,
and bounded local session directories. Relevant source locations in that
snapshot include:

- `session/storage/jsonl/mod.rs`
- `session/acp_session.rs`
- `xai-grok-sampling-types/src/conversation.rs`

The complete private probe remains outside the public repository because it
contains real source-conversation artifacts. This page publishes only
structural findings.

No stable public storage-schema contract was located. Treat these facts as a
versioned empirical/source snapshot, not a permanent API.

## Directory shape

Grok uses a two-level session layout below its sessions root:

```text
sessions/
  <encoded-working-directory>/
    <session-id>/
      summary.json
      chat_history.jsonl
      updates.jsonl
      events.jsonl
      signals.json
      compaction_requests/
      compaction_checkpoints/
      compaction/
      ...
```

Not every directory contains every optional file. `summary.json` carries
listing metadata such as session identity, title/summary, cwd, and activity.
The encoded cwd is part of physical grouping; it is not itself the canonical
conversation ID.

## Current conversation and event streams

`chat_history.jsonl` contains the current effective conversation used by the
session persistence layer. Grok replaces it atomically for operations such as
compaction or rewind. It carries conversation items but does not provide a
reliable per-record display timestamp.

`updates.jsonl` is an incremental ACP/UI update stream. It is useful for live
rendering and timestamps but is not interchangeable with current effective
model history. `events.jsonl` records runtime/infrastructure events rather
than serving as the sole transcript.

A history reader therefore needs to say which product it is reconstructing:
the current continuation state, a live UI event timeline, or both. Concatenating
all three files creates duplicates and lifecycle noise.

## Conversation item shape

Observed current-history types include:

- system, user, assistant, and reasoning;
- assistant tool-call arrays and separate tool-result records joined by call
  ID;
- user images and tool-result image references;
- provider/backend activity;
- synthetic user-role rows with `synthetic_reason`.

Known synthetic reasons in the verified sample were:

- `system_reminder`
- `project_instructions`
- `compaction_meta`
- `task_completed`

They are not all human messages. The role field alone is insufficient for a
faithful UI.

Visible reasoning text or summaries are portable. Encrypted provider reasoning
is opaque. Legacy assistant `reasoning`/`raw_output` fields have different
upgrade semantics from the current sibling reasoning-item shape.

## Compaction evidence

The source directory may retain several compaction requests, checkpoints, and
other compact artifacts. In the inspected version:

- current `compaction_meta` rows did not identify one request snapshot;
- multiple request snapshots could exist;
- checkpoint keys did not supply a deterministic current-head-to-prior-chain
  link.

Those files are valuable evidence, but they do not by themselves prove one
display order for all earlier visible turns. Current `chat_history.jsonl`
remains the deterministic continuation state.

## Relevance to Alt Theory

Alt Theory imports the current effective history, classifies synthetic rows by
meaning rather than role, copies the complete session directory, and reports
the unresolved earlier-chain limitation instead of guessing. Current mappings
are documented in `development/architecture/session-import-adapters.md`.
