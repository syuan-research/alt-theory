# Alt Theory RAG — Integration Notes After Code Review

> Date: 2026-03-31 | Status: Post-review analysis
> Author: AI development team | Base commit: bce1f8a

---

## Overview

After running the full integration test suite with both multilingual embedding model and reranker model installed, we identified two categories of issues:
1. **Fixed during this session** (embedding provider interface)
2. **Remaining — needs review** (parent-child search, metadata formatting)

---

## Fixed Issues

### Issue 1: `embed_query` missing on FastEmbedProvider ✅ FIXED

**What was wrong:** ChromaDB's `collection.query(query_texts=[...])` internally calls `embed_query()` on the embedding provider. Our `FastEmbedProvider` only had `__call__()` and `name()`.

**Fix applied:** Added `embed_query()` and `embed_documents()` methods to `FastEmbedProvider` in `providers.py`. These delegate to `__call__()` exactly as the original `FastEmbedEmbeddings` class did.

**Result:** Semantic search now works. All 3 results from `orch.query('attention restoration')` return properly, with metadata populated:
```
[query] attention_restoration_theory, attention_restoration_theory, attention_restoration_theory
[BM25]  attention_restoration_theory, attention ...
[hybrid]: attention_restoration_theory ...
```

### Issue 2: Metadata not forwarded to results ✅ FIXED

**What was wrong:** The result formatter in `query()` extracted a specific set of keys from metadata (`content`, `source`, `filename`, etc.) but omitted parent-child fields (`chunk_type`, `parent_id`, `section_header`) and theory metadata (`theory`, `author`, `year`, `title`).

**Fix applied:** Added the missing fields to the result dict. Now results contain:
```
{chunk_type: 'child', theory: 'attention_restoration_theory',
 author: 'Stephen Kaplan', section_header: '## Concept: ...',
 title: 'The Restorative...', parent_id: '187389601d2d9069'}
```

---

## Remaining Issues

### Issue 3: Parent content not attaching 🟡 UNDER INVESTIGATION

**Symptom:** Results include `parent_id` field with value like `187389601d2d9069`, but `parent_content` never appears in results.

**What I tried:**

1. **Direct lookup test:** `collection.get(ids=['835af7c752b8266b_0'])` works fine — returns the parent chunk document.

2. **Code path analysis:** The parent lookup in `server.py` lines 1015-1032:
   - Line 1018: `pid = r.get("parent_id")` → returns chunk's parent ID from metadata (e.g. `835af7c752b8266b`)
   - Line 1020: `parent_ids.add(f"{pid}_0")` → adds `_0` suffix → `835af7c752b8266b_0` ✅ parent lookup key
   - Line 1024: `self.collection.get(ids=list(parent_ids))` → fetches parent documents
   - Line 1031: `if pid and pid in parent_lookup:` → **BUG**: `pid` is `835af7c752b8266b` but `parent_lookup` keys are `835af7c752b8266b_0`. The matching fails.

**Root cause:** I added `_0` suffix at line 1020 but didn't update the matching at line 1031. The lookup succeeds but the attachment loop can't find the key because of the suffix mismatch.

**Correct fix direction:** Two options:
- **A.** Fix the matching at line 1031 to also add `_0`: `if f"{pid}_0" in parent_lookup: r["parent_content"] = parent_lookup[f"{pid}_0"]`
- **B.** Change the chunk ID naming to be consistent (e.g. make `parent_id` in metadata include the `_0` suffix, or make parent chunk IDs match the base doc ID)

**Recommendation:** Option A is the correct fix. Option B would be a better long-term design decision (consistent naming), but A unblocks the integration test immediately.

**Alternative consideration:** The parent ID format is inconsistent between:
- Chunk IDs: `{doc_id}_{index}` (e.g. `835af752b8266b_0`, `_1`)
- metadata `parent_id`: `{doc_id}` (e.g. `835af7c752b8266b`)

A more systematic fix would be to store the full parent chunk ID in metadata (e.g. `parent_chunk_id: "835af7c752b8266b_0"`) instead of deriving it at query time.

---

## Architecture Observations

### Good decisions maintained:
1. **Provider abstraction** — The provider pattern works well. Adding `embed_query()` and `embed_documents()` as aliases for `__call__` is clean and maintainable.

2. **Result formatting** — The metadata forwarding fix is minimal and follows the existing pattern.

### Design questions for review:

1. **Chunk ID naming:** Parent chunks use `{doc_id}_0` format, children use `{doc_id}_1`, `{doc_id}_2`, etc. But `parent_id` in metadata is `{doc_id}` (no suffix). This makes parent lookups fragile. Should we:
   - Store the full parent chunk ID in metadata? (recommended)
   - Keep the current pattern and fix the suffix matching everywhere? (temporary)
   - Use a different ID format that's more explicit? (e.g., `doc:835af7c752b8266b:parent`, `doc:835af7c752b8266b:child:1`)

2. **Metadata enrichment:** The result formatter extracts specific keys from metadata. New fields (parent-child, theory) were added to the formatter directly. Should we have a more systematic approach—e.g., pass through ALL metadata keys except known internal ones (like `_distance`)? This would prevent this class of bug when new metadata fields are added later.

3. **Parent context strategy:** The plan specifies Method A (batch-fetch parents via secondary query via ChromaDB `get(ids=...)`). This works for a few results but at scale (many unique parent IDs), it could be slow. Alternative: cache parents in memory during the RRF ranking phase (when we already have access to the parent document content). This would eliminate the secondary query entirely.

---

## What's Working Now

| Component | Status | Notes |
|-----------|--------|-------|
| ChromaDB query() | ✅ working | Multilingual embedding model loads |
| RRF fusion | ✅ working | Semantic + BM25 scores combine correctly |
| Reranker | ✅ working | 3 results returned properly |
| Metadata fields | ✅ working | theory, author, title, chunk_type in results |
| Parent-child structure | ✅ verified | Chunks indexed correctly in DB |
| 64 unit tests pass | ✅ working | All tests green after fixes |

| Component | Status | Notes |
|-----------|--------|-------|
| Parent content attachment | 🔴 broken | Key mismatch between lookup and attachment loop |

---

## Commit History
- `b88a5a7` feat: fork knowledge-rag as alt-theory-rag base
- `d9ff8f8` chore: remove dead fixtures from test_providers.py
- `d9e90da` feat: YAML config and multilingual model swap + clean config handling
- `e3b9d71` feat: dual-format parser with parent-child chunking and metadata aliases
- `c4480e8` chore: add pyyaml dependency to requirements.txt
- `2c2058e` feat: 4 Core MCP tools (search_knowledge, reindex_documents, list_