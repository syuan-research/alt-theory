# Cross-Harness Work and Continuity

Moving work between the app and other agent harnesses, in both directions.

## The session body is Pi-compatible

Alt Theory conversations are stored in Pi's JSONL session format; the app
did not invent a second transcript format. A local conversation can be
exported for Pi to continue, and a compatible Pi session can come in. The
transcript is a documented format on your own disk, and app-level things
that are not conversation (display state, research records, app metadata)
live beside the session body, keeping it clean for interchange.

## Import, at the depth power users want

The [user-level page](../system-guide/imports-and-continuity.md) covers the
flow. The machinery underneath, worth knowing for edge cases:

- Three representations are kept distinct: the visible transcript (what a
  person sees), the active context (what the model carries forward), and
  raw source evidence (retained, searchable, never replayed). Conflating
  these is how tools fabricate history.
- Full preflight before anything exists: the entire source is parsed and
  validated first; only a passing projection becomes a session.
- Declared transformations: every lossy step is recorded; placeholders say
  exactly what was not replayed.
- Per-source handling: an encrypted compaction summary is not decrypted;
  continuation starts from the readable suffix with a labelled limitation;
  a source of undetermined lineage is refused. Child or subagent
  transcripts are archived as evidence, not replayed.
- Repeat imports classify as unchanged (reopen) or changed (new copy); a
  changed source never merges into your continuation.

## Continuing app conversations elsewhere

An Alt Theory conversation continued in Pi keeps the body but leaves the
app's layer behind (Understand/Work enforcement, approvals, app assets).
The agent identity travels only if you bring it
([Plugins](plugins-and-capability-differences.md)). For humans or
non-harness tools, markdown summaries and HTML export are the right
vehicle: readable, not a continuation format.

## What carries and what stays

| Thing | Carries? |
|---|---|
| Conversation body (turns, tools, images) | Yes, Pi-compatible JSONL |
| Compaction summaries | Yes, where readable in the source |
| Skills | Yes, via shared locations ([details](shared-configuration-and-assets.md)) |
| Model/provider configuration | No, each tool owns its own; migrate once |
| Mode, approvals, app settings | No, application layer |
| App-level records (display state, provenance) | Stay with the app's copy |

## A realistic workflow

Import a Claude Code session, examine it in Understand with your knowledge
base, develop the design in a plan record in the working folder, then
continue implementation back in your coding harness. The plan record and
files are in the project folder, visible to both. The working folder, not
the conversation, is the natural shared ground between harnesses.
