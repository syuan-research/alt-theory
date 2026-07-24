---
doc_type: explore
category: comparative-implementation
date: 2026-07-24
subject: CC Switch multi-harness session discovery and display
evidence: upstream source and official user manual
---

# CC Switch Session Reader

## Evidence boundary

CC Switch was checked at `farion1231/cc-switch` commit
`878c26f31e012ba32b9772bd080bd4fa9e7d495e`.

Primary references:

- [Session Manager manual](https://github.com/farion1231/cc-switch/blob/878c26f31e012ba32b9772bd080bd4fa9e7d495e/docs/user-manual/en/3-extensions/3.4-sessions.md)
- [Claude reader](https://github.com/farion1231/cc-switch/blob/878c26f31e012ba32b9772bd080bd4fa9e7d495e/src-tauri/src/session_manager/providers/claude.rs)
- [Codex reader](https://github.com/farion1231/cc-switch/blob/878c26f31e012ba32b9772bd080bd4fa9e7d495e/src-tauri/src/session_manager/providers/codex.rs)

CC Switch is not itself a source harness in this research. It is a useful
open-source comparison for turning several harness stores into a coherent
session browser.

## Shared Session Manager model

The Session Manager presents provider-specific stores through one common
metadata/display shape:

- provider and session ID;
- title and summary;
- project directory;
- created/last-active timestamps;
- source file path;
- resume command;
- selected conversation messages.

The UI sorts recent activity first, searches ID/title/summary/project/source
path, filters by provider, and loads the selected transcript into a common
role-coloured view. Long conversations use user-message previews as a table of
contents. This separation between list metadata and selected transcript avoids
fully parsing every history file for the initial list.

## Claude reader

The Claude reader recursively finds project JSONL, excludes `agent-*` files
from the main list, and derives list metadata from bounded head/tail reads.

Its title priority is:

1. last custom title;
2. first real user message;
3. project-directory basename.

It ignores metadata rows, extracts content blocks, renders tool-use markers,
and reclassifies an all-`tool_result` user envelope as a tool message. Mixed
user text plus tool result remains user. The reader is intentionally display
oriented: it does not follow full `parentUuid` lineage or reproduce active
compaction context.

## Codex reader

The Codex reader scans both active and archived rollout roots. It combines:

- rollout `session_meta` for identity/cwd/source;
- `session_index.jsonl` for compatibility titles;
- read-only SQLite thread metadata for current titles;
- first real user text as fallback.

It excludes subagent sources. It also filters common wrappers such as
`AGENTS.md`/IDE context when deriving titles and can extract the actual final
"request for Codex" section from an IDE envelope.

For transcript display it reads `response_item` records and maps message,
function-call, and function-call-output rows. Other response/control types are
skipped. This is adequate for a clean browser but is deliberately less faithful
than Codex's own compaction/rollback reconstruction.

## Other useful behavior

The official manual says OpenCode can be discovered from JSON or SQLite and
duplicates are automatically deduplicated. It also keeps provider filtering
separate from free-text search and exposes the exact source path and resume
command rather than hiding provenance.

These are reusable UI/listing lessons:

- identify roots before presenting sessions;
- derive titles from semantic user content, not wrappers;
- keep provider filter, text search, and time ordering independent;
- load full transcript on selection;
- display source path/workspace and resume capability explicitly;
- deduplicate logical sessions when supporting old and new storage backends.

## Limits as an import oracle

CC Switch optimizes browsing and resuming the original harness. Its selected
message view can skip reasoning, compaction, lineage, attachments, and
provider-specific control records that a cross-harness continuation adapter
must account for.

Alt Theory can reuse its listing/title/filter insights, but import fidelity
must continue to follow each source harness's own persistence/reconstruction
semantics. Alt Theory's implemented behavior is documented in
`development/architecture/session-import-adapters.md`.
