---
doc_type: explore
category: upstream-research
date: 2026-07-24
subject: Claude Code local session persistence and lineage
evidence: bounded local Claude Code 2.1.206 inspection plus comparative reader source
---

# Claude Code Session Storage

## Evidence boundary

Claude Code's local transcript schema is not a documented public compatibility
API. These findings come from bounded structural inspection of local Claude
Code `2.1.206` sessions and regression fixtures derived from those shapes. No
private transcript content is published.

For comparison, CC Switch's open-source Claude reader was checked at commit
`878c26f31e012ba32b9772bd080bd4fa9e7d495e`:
[`claude.rs`](https://github.com/farion1231/cc-switch/blob/878c26f31e012ba32b9772bd080bd4fa9e7d495e/src-tauri/src/session_manager/providers/claude.rs).
CC Switch is evidence about a practical reader, not an official Claude schema.

## Directory and file roles

Claude Code stores project-scoped JSONL below its configured
`projects/` directory. A direct project-root JSONL is a candidate main
conversation. Related sidecar directories/files can contain subagent logs and
tool-result artifacts.

`sessions-index.json` may contain discovery metadata, but the observed index
can be absent or stale. Direct root files remain recoverable even when the
index omits them. A reliable reader verifies indexed paths and scans the
bounded project root rather than treating the index as canonical.

Control-only or empty fragments can exist. Filename presence alone does not
mean a useful conversation should appear in the session list.

## Lineage and turns

Conversation rows use `uuid` and `parentUuid`. Raw file order is not enough to
select the current visible branch.

Observed `last-prompt` metadata identifies a `leafUuid`. Following
`parentUuid` from the selected leaf reconstructs the current lineage. Other
rows may represent abandoned branches or sidechains and should not be inserted
into the selected main transcript merely because they share a file.

One logical assistant turn can be persisted as consecutive fragments sharing
the same Claude `message.id`. Thinking, text, tool use, and later fragments
must be consolidated at that identity boundary to avoid a UI full of partial
assistant bubbles.

## Compaction and content

Observed compact histories contain plaintext compact-summary rows and lineage
metadata. The summary is portable active context; earlier recoverable rows can
remain visible evidence.

Relevant content blocks include:

- text and thinking;
- tool use and user-role tool results paired by ID;
- images and attachment/document metadata;
- source error/interruption information;
- model-visible metadata/injected context.

User-role is not sufficient to classify a human turn: tool results and
model-visible injected context can also use user-shaped envelopes.

Subagent JSONL is separate source evidence. CC Switch's reader filters files
whose names begin with `agent-` from its main session list and deletes the
matching sidecar directory when explicitly deleting a session. Its display
reader also reclassifies a user message made entirely of `tool_result` blocks
as a tool row.

## Titles and listing

CC Switch demonstrates a useful title priority:

1. latest `custom-title`;
2. first real user message, excluding injected caveats and slash commands;
3. project-directory basename.

It reads a small head/tail window for list metadata, then reads the full JSONL
only for the selected transcript. This is an efficient session-browser
pattern, but it does not reconstruct Claude's `parentUuid` current lineage or
compaction semantics and is therefore not a full continuation oracle.

## Relevance to Alt Theory

Alt Theory verifies indexes, scans direct roots, selects `leafUuid` lineage,
consolidates assistant fragments, maps plaintext compaction, and copies
subagent sidecars as searchable context. Current mappings and strict refusal
rules are documented in
`development/architecture/session-import-adapters.md`.
