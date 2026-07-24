---
doc_type: explore
category: upstream-research
date: 2026-07-24
subject: OpenCode session persistence and reconstruction
evidence: upstream source plus bounded local structural inspection
---

# OpenCode Session Storage

## Evidence boundary

Upstream source was checked at `anomalyco/opencode` commit
`aaa42fe3bfa89a282c42a8eb3fb4a3665371d0a8` on the `dev` branch. The relevant
current implementation is
[`message-v2.ts`](https://github.com/anomalyco/opencode/blob/aaa42fe3bfa89a282c42a8eb3fb4a3665371d0a8/packages/opencode/src/session/message-v2.ts).
Alt Theory also tested recent local SQLite sessions, including compaction,
images, attachments, errors, and child sessions. No private content is
published here.

OpenCode is actively evolving. Older releases used JSON-backed storage;
current releases use a SQLite database. Readers that support both must
deduplicate the same logical session.

## Persistence shape

The current source stores session metadata, message metadata, and message
parts separately. Message hydration loads `MessageTable` rows and then loads
and orders their `PartTable` rows by message and part ID.

A session is the listing/root unit. A session may have a `parent_id`; root
conversation lists normally exclude child sessions, while child rows remain
useful as subtask/subagent evidence. Archived state belongs to session
metadata rather than message content.

Message metadata distinguishes `user` and `assistant`. Content is represented
by typed parts rather than one transcript string. Current part families
include:

- text and reasoning;
- files/resources;
- tools with pending, running, completed, or error state;
- compaction and subtask markers;
- step boundaries, snapshots, patches, retries, and agent metadata.

Completed tool state can carry text output and file attachments. Assistant
metadata separately stores source model/provider, cwd/root, errors, finish
state, token/cost fields, and whether the message is a compaction summary.

## Visible history versus model context

Stored messages are the recoverable history. They are not identical to the
next model request.

`filterCompacted()` scans the stored message stream for a completed assistant
summary paired with a user compaction marker. It returns the current compacted
model sequence and may reorder the summary, retained overflow tail, and
subsequent messages for model consumption. Therefore array position in the
filtered result is not a reliable visible chronology.

The conversion to model messages treats a compaction part as a synthetic
"What did we do so far?" prompt and retains the associated summary. It also:

- keeps reasoning as reasoning only when the target model/provider matches;
- converts reasoning to text when replaying across a different model;
- closes pending/running tools with an interrupted error;
- represents tool errors separately from successful output;
- carries supported tool-result media, sometimes as a synthetic user
  attachment when the provider cannot accept media inside a tool result;
- ignores text/directory file parts when their model-visible text is already
  represented elsewhere.

These are model-request rules, not necessarily the desired transcript UI
rules.

## Why raw session lists can look chaotic

Reading all session rows exposes child sessions and archived roots that
OpenCode's own conversation list may hide. Reading message rows without their
ordered parts produces fragments rather than turns. Reading compacted model
context as the transcript can omit older visible messages or manufacture a
synthetic compaction prompt as a human message.

A reader needs separate decisions for:

- root listing (`parent_id` and archive state);
- transcript hydration (message plus ordered parts);
- current model context (`filterCompacted`);
- titles/workspaces (session/message metadata).

CC Switch's public Session Manager documentation notes that OpenCode sessions
may come from JSON or SQLite and that duplicates are deduplicated. That is
useful compatibility evidence, but OpenCode source remains the format oracle.

## Relevance to Alt Theory

Alt Theory's implemented adapter reads SQLite read-only, lists unarchived
roots, hydrates full messages/parts, keeps the recoverable transcript separate
from compacted active context, and copies supported child rows as searchable
source context. Current product mappings are documented in
`development/architecture/session-import-adapters.md`.
