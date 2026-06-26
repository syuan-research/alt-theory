# KB CHANGELOG

## v0.2.1 — 2026-06-23

Migration from v0.2. Backup at ep-core-v0-2-0/.

### Schema changes
- Removed: topics, environment, population
- Added: doi (bare DOI string, may be empty for books/chapters without DOI)
- Relabeled: type=theoretical_framework → type=core

### Field order (new)
title, theory, author, year, type, doi

### Stats
- Files modified: 57
- DOIs populated: 47
- DOIs empty: 10 (books/chapters without DOI)
- type relabeled theoretical_framework → core: 0

### Field spec
KB-v0.2-Field-Spec.md retained as the v0.2 historical spec.
