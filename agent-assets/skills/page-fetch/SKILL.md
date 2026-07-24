---
name: page-fetch
description: Fetch a web page or online article as readable markdown. Use when the user gives a URL, when a search result needs reading in full, or when a journal article sits behind an anti-bot wall.
category: lookup
subtypes: [fetch.readable, fetch.protected]
---

# Page fetch

Follow the search-policy skill: quote what the page actually says, cite the
URL, and never present memory as fetched content.

Save fetched output inside the current workspace (or the session's writable
folder) — not /tmp; files outside the workspace need approval to read back.

## Readable tier (`fetch.readable`) — default

```bash
scrapling extract get "URL" out.md
```

Fast, no browser involved. Works for most pages. If the output is a
"Just a moment…" / verification stub, the page is behind an anti-bot wall —
use the protected tier.

## Protected tier (`fetch.protected`) — journal walls

```bash
scrapling extract stealthy-fetch "URL" out.md --solve-cloudflare
```

Passes Cloudflare-style walls common on journal sites. Requires the browser
tier to be installed (see Setup). Use it when the readable tier returns a
challenge page, not by default — it is slower and heavier.

Fetching does not bypass paywalls: if the page shows only an abstract to
the public, that is what you will get. Say so rather than padding the gap.

## Setup

Base: `uv tool install "scrapling[fetchers,shell]"`.
Protected tier additionally needs `scrapling install` — a large browser
download; the helper flow must confirm with the user before running it.

If the user has installed their own fetching/scraping skill, defer to it.
