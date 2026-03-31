# Sample Document — Knowledge RAG

This is an example document showing the expected format for the Knowledge RAG system.

## How Documents Are Organized

Place your documents in the `documents/` directory, organized by category:

- `security/` — Security research, pentest notes, exploit techniques
- `ctf/` — CTF writeups, challenge solutions
- `logscale/` — LogScale/LQL queries and documentation
- `development/` — Code documentation, API references
- `general/` — Everything else

## Supported Formats

- **Markdown** (`.md`) — Best format. Chunks align to `##` sections.
- **PDF** (`.pdf`) — Extracted page-by-page via PyMuPDF.
- **Text** (`.txt`) — Plain text, paragraph-based chunking.
- **Python** (`.py`) — Code with function/class extraction.
- **JSON** (`.json`) — Structured data, pretty-printed.

## Tips for Best Results

1. Use `##` and `###` headers in Markdown files — the system chunks by sections
2. Keep sections focused on a single topic for better retrieval precision
3. Include relevant keywords naturally in your text
4. After adding new documents, the system auto-indexes on next startup

## Example Search Queries

```
search_knowledge("sql injection bypass", hybrid_alpha=0.3)
search_knowledge("privilege escalation linux", category="security")
search_knowledge("formatTime logscale", hybrid_alpha=0)
```
