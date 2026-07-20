# Grok Build session import — living record

Updated: 2026-07-21

## Outcome and current boundary

- v2 stage: Stage 3.
- Product state: passed; Grok Build is product-supported for sessions that pass
  the documented complete-session preflight.
- A user can select a Grok Build session in Alt Theory, inspect declared
  transformations, import its current effective conversation into a managed Pi
  session, reopen it, and continue from its history with current Work tools.
- Explicit non-goal: restoring source-side old tips or branches.

## Evidence and decisions

This section is the audit trail. Add only findings tied to an official source
location, a bounded real sample, or an executed test. For each source construct,
record: what Grok persists, what Pi can represent, the exact mapping or refusal,
and the consequence for continuation. Unknowns remain unknown until probed.

The official clone was read from `<reference-repo>\grok-build`. The product
acceptance used one recent bounded local session (52 current-history records,
114,911-byte `chat_history.jsonl`) without copying private transcript text into
this record. Raw acceptance evidence remains under the ignored private-evidence
archive for this workstream.

| Source construct | Source evidence | Product decision | Verification |
| --- | --- | --- | --- |
| Current effective conversation | `session/storage/jsonl/mod.rs` and `session/acp_session.rs` load/replace `chat_history.jsonl` as the current conversation | Project the selected current file directly; no source runtime or replay | Real sample: 52/52 records preflighted and opened |
| System content | `ConversationItem::System` in `xai-grok-sampling-types/src/conversation.rs` | Hidden labelled Pi custom message; disclosed as model-visible at Pi user priority | Present in imported context; regression marker retained |
| User and assistant content | Current `UserItem`/`AssistantItem` structs | Text maps in source order; source-only metadata remains in raw records | 20 user and 19 assistant records in real sample |
| Reasoning summary/content | Current sibling `Reasoning` item; encrypted content is provider-specific | Visible text/summary maps to Pi thinking; encrypted payload remains raw-only | Six reasoning items mapped; raw payloads retained |
| Tool call and result | Current assistant calls plus `ToolResultItem` keyed by call ID | Map only after one earlier call and exactly one result; orphan, duplicate, dangling, images, and backend-only calls refuse | Six exact pairs in real sample; unmatched fixture refused atomically |
| Legacy assistant reasoning/raw output | Official source upgrades these legacy fields before current use | Refuse instead of silently dropping their semantics | Regression fixture returns `legacy_assistant_context` |
| Compaction/current state | Grok atomically replaces current `chat_history.jsonl`; older replaced history is not the selected current store | Import current effective conversation only | No old tip/branch reconstruction |
| Raw source preservation | Session directory is the persistence/provenance unit | Copy the complete directory into managed `records/source-snapshot`; verify a post-copy content fingerprint | Real sample: 58 files, no missing/extra/changed content hashes |

## Implementation and acceptance log

Record changes and test results here as they happen. A result is complete only
when it names the command or UI path, selected bounded sample, observable result,
and any retained failure boundary.

- Discovery and preflight: passed against the official two-level Grok session
  layout and the bounded real sample. Unsupported semantics refuse before any
  managed session is written.
- Deterministic projection and managed registration: passed. Source-derived
  entry IDs/timestamps are stable; parsed Pi JSONL and complete raw snapshot
  enter the ordinary registry path atomically.
- UI import/open: passed through **Import conversation → Grok Build → Check full
  conversation → Import and open** in Work mode.
- History-dependent live tool continuation: passed. A first prompt proved the
  imported history identified the file but did not call a tool, so it did not
  count. A second prompt required current disk state: the model recovered the
  absolute path from imported tool arguments, made exactly one current `read`
  call, received its paired result, and answered without modifying the file.
- Same-source repeat import: passed as `unchanged`; **Open imported
  conversation** reopened the same continued session without overwrite.
- Restart and reopen: passed after restarting the local server with the same
  isolated data directory and reopening the catalog entry in the UI.
- Regression: `npm run test:backend` passed 105/105. Frontend v6 build passed.
  `npm run compile:bundle` produced `server.js`; its listed TypeScript
  diagnostics predate this adapter and contain no Grok adapter diagnostic.

## Exit rule

Stage 3 completed on 2026-07-21. The next product step is v2 Stage 4: reconcile
the UI/status support matrix with the three implemented external adapters and
close the first-version boundary without expanding into reverse export or
source-side branch restoration.
