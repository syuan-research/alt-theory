---
doc_type: explore
category: upstream-research
date: 2026-07-24
subject: Codex thread, rollout, compaction, and listing persistence
evidence: upstream source plus bounded local structural inspection
---

# Codex Session Storage

## Evidence boundary

Upstream source was checked at `openai/codex` commit
`6c729ef1c1dcfbcbe1bd9d0c2dddde24377ae899`.

Primary references:

- [`thread-store/README.md`](https://github.com/openai/codex/blob/6c729ef1c1dcfbcbe1bd9d0c2dddde24377ae899/codex-rs/thread-store/README.md)
- [`rollout_reconstruction.rs`](https://github.com/openai/codex/blob/6c729ef1c1dcfbcbe1bd9d0c2dddde24377ae899/codex-rs/core/src/session/rollout_reconstruction.rs)
- [`thread_rollout_truncation.rs`](https://github.com/openai/codex/blob/6c729ef1c1dcfbcbe1bd9d0c2dddde24377ae899/codex-rs/core/src/thread_rollout_truncation.rs)
- [`compacted_item.rs`](https://github.com/openai/codex/blob/6c729ef1c1dcfbcbe1bd9d0c2dddde24377ae899/codex-rs/protocol/src/compacted_item.rs)

Alt Theory additionally inspected recent local rollouts and `state_5.sqlite`
without publishing transcript content.

## Two persistence roles

Codex deliberately separates:

- canonical append-only thread history in rollout JSONL; and
- queryable thread metadata in the SQLite state database when available.

`LocalThreadStore` persists history through rollout files and metadata through
SQLite. Compatibility paths also retain JSONL/name-index behavior for older or
SQLite-less storage.

Normal rollout files live below date-partitioned `sessions/`; archived rollouts
live under `archived_sessions/`. `state_5.sqlite.threads` supplies queryable
fields such as thread ID, rollout path, cwd, title, archive status, source, and
provider classification. `session_index.jsonl` is another compatibility/title
index, not the canonical message history.

This separation explains why a file scan, SQLite list, and product UI can show
different sets when an index is stale, a path is missing, or a thread has been
archived.

## Rollout record families

A rollout begins with `session_meta` and then appends typed records. Relevant
families observed in source and current local data include:

- `response_item`: user/assistant/system/developer messages, reasoning,
  function/custom tools and outputs, images, and provider-specific items;
- `turn_context`: model/runtime settings for a turn;
- `event_msg`: task/turn lifecycle, abort, rollback, and UI events;
- `compacted`: summary/replacement-history checkpoints;
- `world_state` and inter-agent communication metadata.

`session_meta.source` distinguishes ordinary roots from subagent-derived
threads. A robust root list cannot rely only on filenames or titles.

## Reconstruction is replay, not concatenation

Codex reconstructs effective history by replaying the rollout. Current source
scans newest-to-oldest to find the newest surviving compaction base and the
metadata needed to resume, then replays the surviving suffix forward.

A compacted item can carry:

- a summary/message;
- optional `replacement_history`;
- window lineage metadata.

`replacement_history` is a complete active-history base. It is not guaranteed
to be a human-readable transcript and may contain provider-private or
user-heavy context shapes.

`thread_rolled_back {num_turns}` means drop the newest N surviving user turns.
The reconstruction code applies those markers to turn segments and uses real
user-turn boundaries rather than deleting the last N arbitrary records.
Abort, rollback, compaction, and response records can appear in shapes that
cross naive task/file boundaries.

## Titles and conversation lists

Titles may come from SQLite thread metadata, `session_index.jsonl`, or a first
real user message fallback. Context wrappers such as injected IDE state and
`AGENTS.md` content are poor title candidates and need filtering.

CC Switch's Codex reader demonstrates a practical list strategy:

- scan both `sessions/` and `archived_sessions/`;
- use `session_index.jsonl` and read-only SQLite for titles;
- filter subagent sources from root lists;
- derive a fallback title from the first real user request;
- read `response_item` messages and function-call/output rows for its display.

That reader is intentionally simpler than Codex's own reconstruction and is
useful for list/title behavior, not a complete continuation oracle.

## Relevance to Alt Theory

Alt Theory's implemented adapter uses SQLite metadata when present, retains
raw rollout records, builds the visible transcript from top-level response
items, reconstructs active context across compaction/rollback, and keeps
subagent rollouts as searchable source context. Current mappings and refusal
boundaries are documented in
`development/architecture/session-import-adapters.md`.
