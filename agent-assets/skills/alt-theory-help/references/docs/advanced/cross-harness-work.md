# Cross-Harness Work and Continuity

Alt Theory treats your conversations as portable work, not captive data.
This page covers moving work between the app and other agent harnesses,
in both directions and in depth.

## The session body is Pi-compatible

Alt Theory conversations are stored in Pi's JSONL session format — the
app deliberately did not invent a second transcript format. Consequences:

- a local Alt Theory conversation can be exported in a form Pi can
  continue, and a compatible Pi session can come in;
- the transcript outlives the product: your conversation history is in a
  documented, widely-implemented format on your own disk, not a
  proprietary store;
- app-level things that are *not* conversation — display state, research
  records, app metadata — live beside the session body, not inside it,
  so the body stays clean for interchange.

## Import, at the depth power users want

The [user-level page](../system-guide/imports-and-continuity.md) covers
the flow; here is the machinery underneath, which is worth knowing when
you push edge cases:

- **Three representations are kept distinct** in every import: the
  *visible transcript* (what a person should see), the *active context*
  (what the model actually carries forward), and *raw source evidence*
  (everything else, retained and searchable, never replayed). Conflating
  these is how tools fabricate history; the separation is why Alt Theory
  does not.
- **Full preflight before anything exists**: the entire source is parsed
  and validated first; only a projection that passed becomes a session.
  Failures are structured refusals naming the record and reason.
- **Declared transformations**: every lossy step is recorded with the
  session, and placeholders in the transcript say exactly what was not
  replayed.
- **Per-source honesty**: e.g. an encrypted source compaction summary is
  not decrypted or paraphrased — continuation starts from the readable
  suffix with a labelled limitation; a source whose lineage cannot be
  determined is refused rather than guessed. Child/subagent transcripts
  are archived and indexed as searchable evidence, not replayed as main
  history.
- **Repeat imports classify** as unchanged (reopen the existing import)
  or changed (a new managed copy) — a changed source never merges into
  your continuation.

## Continuing app conversations elsewhere

The reverse direction: an Alt Theory conversation continued in Pi keeps
the conversation body but leaves the app's layer behind — Understand/Work
enforcement, approvals UI, and app assets are app things. The agent
identity travels only if you bring it (see
[Plugins](plugins-and-capability-differences.md)). For handing work to
humans or non-harness tools, markdown summaries and HTML export are the
right vehicle — readable, but not a continuation format.

## What carries and what stays, in one table

| Thing | Carries across surfaces? |
|---|---|
| Conversation body (turns, tools, images) | Yes — Pi-compatible JSONL |
| Compaction summaries | Yes, where readable in the source |
| Skills | Yes, via shared skill locations ([details](shared-configuration-and-assets.md)) |
| Model/provider configuration | No — each tool owns its own; migrate once via guided setup |
| Mode, approvals, app settings | No — application layer |
| App-level records (display state, provenance) | Stay with the app's copy |

## A realistic multi-harness workflow

Think in one place, produce in another: import the Claude Code session
where an analysis took shape, examine it in Understand with your
knowledge base, develop the design in a plan record in the working
folder, then continue implementation back in your coding harness — the
plan record and any files are in the project folder, visible to both. The
working folder, not the conversation, is the natural shared ground
between harnesses; put durable state in files and either side can pick it
up.
