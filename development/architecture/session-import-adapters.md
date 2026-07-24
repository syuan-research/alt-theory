# Session Import Adapters

This document describes the session-import behavior implemented in the product.
Upstream harness storage research lives under
`development/compound/research-agent-session-history/`. Historical decisions
and feature records are not the current behavior contract.

## Boundary

Session import is a local-only adapter layer in front of the existing session
engine. It does not introduce another runtime or managed-session type.

The implemented boundary is:

1. discover source roots;
2. classify an earlier import as `new`, `unchanged`, or `changed`;
3. preflight the complete selected root;
4. project verified source semantics to Pi JSONL;
5. register that JSONL through the normal managed-session path;
6. open and continue it as an ordinary Alt Theory session.

`session-import.ts` owns shared discovery dispatch, repeat classification,
managed registration, provenance, aliases, workspace validation, and atomic
cleanup. Each external harness has one parser/projector module:

- `opencode-session-import.ts`
- `codex-session-import.ts`
- `grok-session-import.ts`
- `claude-code-session-import.ts`

The local API exposes the ready harnesses through
`GET /api/session-import/harnesses`, discovery through
`GET /api/session-import/:harness/sessions`, and preflight/import through
`POST /api/session-import/:harness`. Hosted mode does not expose these routes.

## Three representations

An import keeps three concepts separate.

### Recoverable visible transcript

This is the conversation a person should see: recoverable user and assistant
messages, thinking, tool activity, images, attachments, errors, and compact
boundaries. Source model-context snapshots are not automatically a UI
transcript; doing so can create fake user-only histories.

### Portable active context

This is the verified context that Pi should use when the conversation
continues. A plaintext source summary may become native Pi compaction.
Encrypted or provider-private state cannot. When an exact compact summary is
unavailable, the adapter retains the recoverable transcript and inserts a
labelled limitation rather than inventing a replacement summary.

### Raw source evidence

Every selected root record is retained as raw Pi custom data or in a managed
source snapshot. Available child/subagent material is copied as indexed
`records/source-context/` evidence. Raw retention is searchable recovery
material; it is not a claim that Pi replayed the same semantics.

## Preflight and refusal

External-session `preflightOnly` parses the complete selected root before
managed storage exists. The result contains either:

- prepared Pi JSONL and declared transformations; or
- a structured refusal with source record type, count, and reason.

Known transformations use native Pi/transcript forms where available.
Historical system/project/reminder text becomes labelled collapsed context,
not a human message. Lifecycle/provider activity becomes an existing marker,
labelled provenance, or raw-only evidence.

Unknown active semantics, malformed content, ambiguous lineage, and unmatched
tool pairs refuse the selected session. An explicit source interruption may
close a missing tool result with a labelled error; a call with no output and no
interruption evidence still refuses.

After successful preflight, registration parses the prepared Pi JSONL again,
creates the managed session, opens the Pi file, writes foundation/provenance
records, and removes the newly allocated session root if any step fails.

## Managed records and repeat import

`records/session-import-source.json` stores:

- harness and source store;
- source IDs and fingerprint/version;
- declared transformations;
- source snapshot/context pointers;
- import ordinal and timestamp.

Discovery compares the current source version or fingerprint with prior
records:

- `new`: no earlier import;
- `unchanged`: open the latest matching managed session;
- `changed`: create a new managed session.

A changed source never merges into or overwrites an Alt Theory continuation.
The alias is
`{source name} · {harness} import {date} #{ordinal}`.

The imported cwd uses the normal `workspace.primaryDir`. It must exist unless
the caller supplies an existing replacement. Mode, role, soul, tools,
permissions, model, and system prompt are normal Alt Theory runtime choices;
source runtime configuration is historical evidence, not active
configuration.

On reopen, Pi's loaded final entry remains active until persisted Alt Theory
run state selects another leaf. Transcript reads rebuild from persisted Pi
history. The first Alt Theory run invokes `imported-session-context`; that
skill can search one bounded child artifact when source context is relevant.
Later runs are ordinary prompts.

## Implemented harness behavior

### Pi

Pi discovery uses `SessionManager.listAll()`. The source Pi JSONL is parsed,
copied into the managed history directory, and registered through the same
shared path. Pi import does not need external-session preflight conversion.

### OpenCode

The adapter opens the SQLite store read-only and lists unarchived root sessions
only. Stored messages and parts form the recoverable transcript; OpenCode's
compaction selection separately determines portable active context.

Implemented mappings include text, collapsible reasoning, distinct historical
system snapshots, assistant errors, paired tools, images, tool-result image
attachments, and plaintext compaction. Text/directory file parts already
represented by source-visible text remain raw; other non-replayable files use
labelled placeholders. Unknown parts or tool states refuse.

### Codex

Discovery prefers `state_5.sqlite.threads` for root metadata and rollout paths,
excluding archived and subagent threads; bounded rollout scanning is the
fallback.

Top-level response items form the recoverable transcript.
`replacement_history` is active context rather than a display transcript.
The adapter uses the real compaction boundary, maps plaintext reasoning
summaries to thinking, and keeps encrypted reasoning/summary state raw. When
the compact summary is encrypted, continuation starts from the post-compaction
suffix with a labelled limitation while earlier transcript remains searchable.

Implemented mappings include historical system/developer context, paired
function/custom tools, provider-search provenance, embedded/generated images,
and readable local PNG/JPEG/GIF/WebP attachments. Runtime/event state, dynamic
tool definitions, tool-search definitions, and inter-agent control metadata
are not reactivated.

Explicit bounded `thread_rolled_back {num_turns}` controls remove those turns
from active history. Retained interrupted calls without output receive a
labelled error result. Ambiguous rollback, incomplete lineage, unknown response
items, and unmatched calls without interruption evidence refuse.

### Grok Build

Discovery follows Grok's two-level session directory and reads current
`chat_history.jsonl`. Text, visible reasoning, exact local tool pairs, user
images, and known provider-search provenance map to Pi. Tool-result images use
labelled retained-source placeholders.

Known synthetic user-role records do not become human bubbles:

- `system_reminder` and `project_instructions`: collapsed imported context;
- `compaction_meta`: compaction context;
- `task_completed`: lifecycle/raw-only.

Unknown synthetic reasons refuse. Prior compaction requests/checkpoints are
retained, but the observed source data does not deterministically link the
current head to one earlier visible chain, so the adapter does not invent one.
The complete source directory is copied to `records/source-snapshot/` and its
content fingerprint is verified after copy.

### Claude Code

Discovery scans direct project-root JSONL. `sessions-index.json` is optional
metadata: indexed paths are verified, stale indexes cannot hide direct root
files, and empty control-only or subagent files are not listed as
conversations.

`last-prompt.leafUuid` and `parentUuid` select current lineage segments across
plaintext compaction. Abandoned branches remain raw. Consecutive assistant
fragments sharing one Claude `message.id` are consolidated into one turn.
Implemented mappings include thinking, text, paired tools, images,
model-visible attachments, source errors, metadata context, and plaintext
compact summaries. Unknown row, system, attachment, or active content-block
semantics refuse.

Subagent JSONL is copied into indexed source context, participates in repeat
detection, and is not replayed as an independent main conversation.

## Current product surface

The shared React dialog offers OpenCode, Codex, Grok Build, and Claude Code.
The backend registry also supports Pi import. The dialog searches source
title/folder/conversation, keeps recent activity first, requires dry preflight,
folds technical details, and opens the resulting normal catalog session.
