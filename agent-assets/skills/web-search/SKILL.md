---
name: web-search
description: Live web and literature search. Use when the user needs current information, references, or anything checkable outside the workspace — general queries via DuckDuckGo CLI, academic queries via OpenAlex/Crossref APIs.
category: lookup
subtypes: [search.general, search.academic]
---

# Web search

Follow the search-policy skill (when to search, provenance, anti-overfit).

## General web (`search.general`)

```bash
ddgs text -q "your query" -m 10     # web results
ddgs news -q "your query" -m 10     # news vertical
```

Free, no key. Results give title/href/body — cite the href for anything you
use.

## Academic (`search.academic`)

Prefer these over general search for literature — they return verifiable
metadata (DOI, year, citation counts), which is what makes a reference
safe to hand to a researcher:

```bash
curl -s "https://api.openalex.org/works?search=QUERY&per-page=10"
curl -s "https://api.crossref.org/works?query=QUERY&rows=10"
```

Both free, no key. Give the user title, year, DOI, and citation count; the
DOI is the citation's identity — never emit a reference without one unless
you clearly mark it unverified. These endpoints return metadata and
abstracts, not full text — for full text see the page-fetch skill
(`fetch.readable` / `fetch.protected`).

## Setup

Requires the `ddgs` CLI: `uv tool install ddgs` (helper flow confirms with
the user before installing). The academic endpoints need only `curl`,
which is always present.

If the user has installed their own search skill, defer to it.
