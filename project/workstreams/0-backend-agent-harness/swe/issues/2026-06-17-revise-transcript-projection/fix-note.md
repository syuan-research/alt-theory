---
doc_type: fix-note
slug: revise-transcript-projection
status: completed
created: 2026-06-17
workstream: 0-backend-agent-harness
tags: [v0-5, backend, session-store, revise, transcript]
related_observation: project/workstreams/0-backend-agent-harness/notes-and-status/2026-06-17-revise-transcript-projection-observation.md
---

# Revise Transcript Projection Fix Note

## Issue

After `revise_latest`, the active Pi context was correct, but REST transcript
projection could show both the original and revised latest user turn. The UI
then looked like edit sent a duplicate prompt.

Root cause: `session-store.ts` projected transcript from
`SessionManager.getEntries()`, which includes superseded JSONL evidence entries.

## Fix

`readSessionDetail()` now projects transcript from the active Pi branch:

- resolve the active Alt Theory branch from `records/branch-index.json`;
- if it has an `activeLeafEntryId`, align the opened `SessionManager` to that
  leaf before building transcript;
- build transcript from `sessionManager.getBranch()`, not all entries;
- filter transcript entries whose latest run snapshot is `deleted` or
  `superseded`.

Compatibility note: when `activeLeafEntryId` is missing/null, the reader keeps
Pi's default opened leaf instead of forcing `resetLeaf()`. This preserves older
or manually assembled histories that do not have a branch head recorded.

## Verification

Added regression assertions to the existing revise test:

- after revise, `readSessionDetail(...).transcript` has exactly one user
  message;
- that user message is the revised text;
- the superseded original text is absent from transcript while remaining in Pi
  JSONL evidence.

Validation:

```text
npm run test:backend
61 pass / 0 fail
```

