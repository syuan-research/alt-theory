# Test Note: Q1 + Q2 Fixes

> Date: 2026-04-01 | After: spec v0.4 Opus review

## Changes Made

### Fix 1: parent_chunk_id (Q1)

**File:** `alt-theory-rag/mcp_server/server.py`

**What changed in `_index_document()` (~line 692):**
- Already had: `parent_chunk_id = f"{doc.id}_0"` injected for child chunks at ingestion time
- This was correct. No change needed on ingestion side.

**What changed in `query()` result formatter (~line 978):**
- OLD: whitelist formatter — manually listed each metadata field. `parent_id` (bare doc_id) was extracted, but `parent_chunk_id` (full ID) was not.
- NEW: passthrough + blacklist. All metadata passes through except `_INTERNAL_META_KEYS = {"content_hash", "chunk_index", "doc_id"}`.

**What changed in parent lookup (~line 1022):**
- OLD: derived parent ID as `f"{parent_id}_0"`, then matched bare `parent_id` against lookup keys → key mismatch bug
- NEW: reads `parent_chunk_id` directly from result dict. No derivation,, no suffix guessing.

### Fix 2: Metadata passthrough (Q2)

**Same code section as above.** The result formatter changed from:

```python
# OLD: explicit whitelist
formatted.append({
    "content": ...,
    "source": metadata.get("source", ""),
    "chunk_type": metadata.get("chunk_type", "child"),
    "parent_id": metadata.get("parent_id", ""),
    # ... 15+ fields manually listed
})
```

To:

```python
# NEW: passthrough with blacklist
_INTERNAL_META_KEYS = {"content_hash", "chunk_index", "doc_id"}
result = {k: v for k, v in metadata.items() if k not in _INTERNAL_META_KEYS}
result["content"] = data.get("document", "")
result["score"] = round(normalized_score, 4)
# ... 3 explicit computed fields
```

## How to Test

### Test 1: Reindex and verify parent_chunk_id exists

```bash
cd alt-theory-rag && python -c "
from mcp_server.server import KnowledgeOrchestrator
orch = KnowledgeOrchestrator()
# Force reindex
orch.index_all(force=True)

# Check child chunks have parent_chunk_id in metadata
results = orch.collection.get(limit=5, where={'chunk_type': 'child'}, include=['metadatas'])
for meta in results['metadatas'][:3]:
    pcid = meta.get('parent_chunk_id', 'MISSING')
    print(f'parent_chunk_id={pcid}')
"
```

Expected: `parent_chunk_id=xxxxx_0` (full ID, not bare)

### Test 2: Verify parent_content attaches in search results

```bash
cd alt-theory-rag && python -c "
from mcp_server.server import KnowledgeOrchestrator
orch = KnowledgeOrchestrator()
results = orch.query('attention restoration', max_results=3)
for r in results[:3]:
    has_parent = 'parent_content' in r
    print(f'theory={r.get(\"theory\",\"?\")} parent_content={has_parent}')
"
```

Expected: `parent_content=True` for at least some results.

### Test 3: Verify all frontmatter fields appear in results (passthrough)

```bash
cd alt-theory-rag && python -c "
from mcp_server.server import KnowledgeOrchestrator
orch = KnowledgeOrchestrator()
results = orch.query('ART', max_results=2)
r = results[0]
# Check that frontmatter fields are present
for key in ['theory', 'author', 'year', 'title', 'section_header', 'chunk_type']:
    print(f'{key}: {r.get(key, \"MISSING\")}')
"
```

Expected: All fields show values, not "MISSING".

### Test 4: Existing unit tests still pass

```bash
cd alt-theory-rag && python -m pytest tests/ -v
```

Expected: 64/64 pass (or close to it — some tests may need updating if they reference the old whitelist format).

## Known Risks

- Some unit tests may reference the old result dict format (whitelist fields). If tests fail, check if they assert specific keys.
- The `parent_chunk_id` field only exists after reindex. Existing indexed data won't have it. **Must force reindex first.**
