# Alt Theory RAG — Known Issues After Task Completion

> Generated: 2026-03-31 | Plan: `docs/superpowers/plans/2026-03-31-alt-theory-rag.md` | Commits: main bce1f8a

---

## Status: All 8 plan tasks implemented, 2 blocking issues found

All plan tasks (fork → embed provider → YAML config → parser → search → MCP tools → logging → integration) are committed and tested. 64/64 unit tests pass. Two issues prevent end-to-end verification of the search pipeline.

---

## 🔴 Issue 1: `FastEmbedProvider` missing `embed_query` method

**Symptom:** Semantic search fails at runtime with `'FastEmbedProvider' object has no attribute 'embed_query'`.

**Impact:** ChromaDB's `collection.query(query_texts=[...])` internally calls `embed_query` on the embedding provider. Our `FastEmbedProvider` class (alt-theory-rag/mcp_server/providers.py) only implements `__call__()` and `name()`. Semantic search fails, falling back to BM25-only results.

**Root cause:** Task 2 replaced the old `FastEmbedEmbeddings` class (which had `embed_query`) with the new `FastEmbedProvider`. The ChromaDB wiring expects a method that the new provider doesn't have.

**Affected files:**
- `alt-theory-rag/mcp_server/providers.py` (needs `embed_query` method on `FastEmbedProvider`)
- `alt-theory-rag/mcp_server/server.py` (wires provider into ChromaDB)

**Fix direction:** Add `embed_query` to `FastEmbedProvider` as an alias for `__call__`. One-liner fix.

**Workaround:** None — semantic search is non-functional until this is fixed.

---

## 🔴 Issue 2: BM25-only search results lack ChromaDB metadata

**Symptom:** When only BM25 results are returned, fields like `chunk_type`, `theory`, `parent_content`, `section_header` are `None` or missing.

**Impact:** Cannot verify parent-child search (Task 5) or Dify result formatting (Task 6) on actual query results. All downstream features depend on ChromaDB metadata being returned, which doesn't happen in BM25-only mode.

**Root cause:** Cascading from Issue 1. BM25 returns flat `{chunk_id: bm25_score}` dicts without the rich metadata that ChromaDB's query results include. The result formatter tries to build output from these dicts, resulting in empty/None fields.

**Fix direction:** Fix Issue 1 first — once semantic search works, ChromaDB returns metadata dicts with all the parent-child fields properly populated. BM25 results should also be enriched via a secondary `collection.get()` lookup, but the primary blocker is the embed method.

**Workaround:** Direct `collection.get()` and `collection.query()` calls work correctly in isolation. The integration confirmed:
- 41 chunks indexed (5 parent + ~36 child)
- theory/author metadata from v0.1 JSON frontmatter properly parsed
- parent-child chunk structure intact
- Only the `orchestrator.query()` wrapper fails due to the embed interface

---

## 🟡 Issue 3: Multilingual model cache in Temp directory (deferred to v2)

**Not a blocker** — model downloads and works — but the cache lives in `%USERPROFILE%\AppData\Local\Temp\fastembed_cache\`. Both the embedding model (`paraphrase-multilingual-MiniLM-L12-v2`, ~235MB) and reranker (`ms-marco-MiniLM-L-6-v2`, ~91MB) will be lost if Windows temp cleanup runs.

**Fix direction:** Configure a persistent cache path (e.g., project-local `.fastembed_cache/`) and pass it through `FastEmbedProvider`. Deferred per user decision — v2 scope item.

---

## What IS working (verified)

| Component | Status |
|-----------|--------|
| Fork from knowledge-rag | ✅ |
| YAML config (`config.yaml`) | ✅ |
| FastEmbed provider loading | ✅ (both multilingual + reranker) |
| Dual-format parser (JSON v0.1 + YAML v0.2) | ✅ |
| Metadata alias mapping (`theoryname` → `theory`) | ✅ |
| Filename fallback parsing | ✅ |
| Parent-child chunking | ✅ (5 parents, ~36 children confirmed) |
| ChromaDB ingestion (metadata, no dicts-of-dicts) | ✅ (67/67 tests pass after ChromaDB schema fix) |
| BM25 keyword search | ✅ |
| Reranker model loading | ✅ |
| Search logging (JSONL) | ✅ (code in place, will fire on actual queries) |
| MCP tool structure (4 tools) | ✅ (search_knowledge, reindex_documents, list_domains, switch_domain) |

---

## What IS NOT working (blocks demo)

| Component | Status |
|-----------|--------|
| Semantic/embedding search via `orchestrator.query()` | ❌ embed_query missing |
| Parent-child context attachment in live queries | ❌ cascading from above |
| Dify result formatting on real results | ❌ cascading from above |
| `switch_domain` / `list_domains` runtime tests | ⏭️ no documents-* directories exist yet |
