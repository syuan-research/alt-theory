---
name: workspace-conventions
description: Default conventions for files an agent creates in a workspace — where things go, how they are named, and why. Consult before creating any file or folder in the workspace, when organizing outputs, or when unsure where something belongs.
category: conventions
subtypes: [workspace]
---

# Workspace conventions

Defaults, not law. They exist because consistent naming and placement is
what keeps a project readable — for the user, and for every future agent
session that must reconstruct context from files. The user's stated
preference always wins, and an existing project's own structure wins over
these defaults: **read how the project is organized before writing into
it.**

## Placement

- **Volatile goes to `output/`**: anything produced by one session that
  may be superseded — drafts of analyses, reports, extractions — goes in
  `output/YYYYMMDD-<short-slug>/`. One folder per session or per piece of
  work, whichever the user prefers. **A session output folder gets a short
  `README.md`** saying what the folder contains and why — contents inside
  are mixed, and the README is what makes them findable months later.
- **Durable plans go to `plans/`**: plan-records and similar living
  documents, named `YYYYMMDD-<short-slug>-plan.md`.
- **Converted files sit next to their original** with `_converted`
  appended (e.g. `interview-3_converted.md`), so the pairing is visible.
- Folder names above are defaults — adapt them to what already exists
  rather than creating a parallel structure.

## Hybrid structure, not pure taxonomy

Do not organize a workspace purely by file type, nor purely by
session/chronology. The shape that survives real projects is a hybrid
that EVOLVES:

- **Early**: only a few fixed categories — upstream/source materials,
  settled decisions, and the working area. Don't pre-build a taxonomy.
- **Middle**: dated session folders carry the moving work.
- **Later**: when something stabilizes, promote it into an emerging fixed
  category (e.g. a `stable/` area for results that graduated out of
  session outputs) — categories are earned by stability, not declared in
  advance.

Do not hard-split what works together: exploratory analysis scripts and
their results belong in the same folder — a folder of scripts separated
from their outputs is useless. Do not split data into raw/processed at
the start — group by data batch, and only reorganize by content category
or processing step once the processing approach and the full data set
have stabilized.

**One project's materials stay together.** Do not pull two projects'
source materials out into a shared "originals" pool — each project holds
its own sources, even at the cost of a copy.

A reference shape (category words, all optional):

```
project/
  source-materials/      upstream inputs this project owns
  decisions/             settled choices worth not re-deriving
  plans/                 living plan-records
  output/YYYYMMDD-…/     dated session work, each with a README
  stable/                results promoted out of output when they settle
```

## Naming

- Date-prefix agent-created documents: `YYYYMMDD-...`. Add `-vN.M` only
  when a document genuinely iterates.
- One concept, one word, per project: if a document is called a "plan"
  today, do not call its sibling a "roadmap" tomorrow without reason.
- Content format inside files stays free — these conventions govern names
  and places, never what you write.

## Never

- Never rename, move, or reorganize the user's own files or folders on
  your own initiative — suggest, and let them decide.
- Never scatter session products in the workspace root when an `output/`
  folder would keep them findable.
