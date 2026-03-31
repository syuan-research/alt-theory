# Alt Theory RAG — Post-Implementation Review Prompt v0.4

> For: Claude Opus 4.6 | Date: 2026-04-01
> Purpose: Spec update + design issue resolution after first implementation pass

---

## Context

We implemented the Alt Theory RAG server based on spec v0.4. All 8 plan tasks are committed, 64 unit tests pass. Two blocking runtime issues were found and partially fixed. The code is **functional but has design inconsistencies** that need review before we proceed.

**Your role:** Review the spec against the actual implementation. Propose spec updates where the implementation revealed gaps or wrong assumptions. Answer the two specific design questions below.

**Who built this:** A non-flagship model (GLM-5.1) following the superpowers plan. Code quality is functional but may have edge cases and maintainability issues. Your review helps us decide what to fix vs. accept.

---

## Files to Read

**Spec and plans:**
- `_dev/approaches/feature-rag-and-knowledge-base/alt-theory-rag-design.md` (spec v0.4)
- `_dev/approaches/feature-rag-and-knowledge-base/build-plan.md`
- `_dev/approaches/feature-rag-and-knowledge-base/docs/superpowers/plans/2026-03-31-alt-theory-rag.md` (execution plan)

**Post-implementation reports:**
- `_dev/approaches/feature-rag-and-knowledge-base/docs/known-issues_20260331.md`
- `_dev/approaches/feature-rag-and-knowledge-base/docs/integration-notes_20260331.md`

**Actual implementation (what was built):**
- `alt-theory-rag/mcp_server/providers.py` — Embedding provider
- `alt-theory-rag/mcp_server/parsers.py` — Dual-format parser + parent-child chunker
- `alt-theory-rag/mcp_server/ingestion.py` — Document ingestion pipeline
- `alt-theory-rag/mcp_server/server.py` — Main server (search, MCP tools, parent lookup)
- `alt-theory-rag/config.yaml` — YAML config

**Fork base (for comparison):**
- `tmp/knowledge-rag/mcp_server/server.py` — Original code

---

## What Happened: Timeline

1. Spec v0.4 reviewed and approved (you reviewed it earlier)
2. Implementation plan created with superpowers format
3. GLM executed all 8 tasks
4. Runtime testing revealed:
   - `embed_query` missing → fixed (added alias methods)
   - Metadata not forwarded to results → fixed (added fields to formatter)
   - Parent content not attaching → **still broken** (key mismatch, explained below)
5. Additional design issues discovered during debugging

---

## Design Question 1: Chunk ID Naming Inconsistency

**The problem:** Two different ID schemes coexist:

| Where | Parent chunk ID | Child chunk ID |
|-------|----------------|----------------|
| parsers.py (ParsedChunk.chunk_id) | `{doc_id}_parent` | `{doc_id}_child_{i}` |
| server.py (_index_document, line 667) | `{doc_id}_0` | `{doc_id}_{i+1}` |

The parsers.py naming (`_parent`, `_child_0`) is **completely ignored** — server.py uses `chunk.index` (position in list) to generate IDs. Parent is always `_0` because it's first.

This caused the parent content attachment bug:
- `metadata.parent_id` = `{doc_id}` (bare, no suffix)
- server.py line 1020 does `f"{pid}_0"` → correct lookup key
- server.py line 1031 compares bare `pid` against keys with `_0` suffix → mismatch

**Options I see:**

A. **Keep index-based IDs, fix the matching** — Change line 1031 to `f"{pid}_0"`. Minimal change, but the `_0` convention is fragile and undocumented.

B. **Use parsers.py naming** — Pass `ParsedChunk.chunk_id` through ingestion.py to server.py instead of generating from index. More explicit (`_parent`, `_child_0`), self-documenting, but requires changes to `_index_document`.

C. **Store full parent chunk ID in metadata** — Add `parent_chunk_id: "{doc_id}_0"` to child chunk metadata at index time. Eliminates the suffix derivation at query time entirely.

**Your task:** Recommend one approach (or propose a better one). Consider: clarity, maintainability, and blast radius of the change.

---

## Design Question 2: Metadata Passthrough Strategy

**The problem:** The result formatter in `server.py` extracts specific keys from ChromaDB metadata into the result dict. When we added new metadata fields (parent-child, theory), we had to manually add them to the formatter. This is a recurring bug pattern — every new metadata field requires a formatter update.

**Current approach (whitelist):**
```python
result = {
    "content": doc_content,
    "source": metadata.get("source", ""),
    "chunk_type": metadata.get("chunk_type", "child"),
    "parent_id": metadata.get("parent_id", ""),
    "theory": metadata.get("theory", "unknown"),
    # ... each field listed explicitly
}
```

**Alternative (passthrough with blacklist):**
```python
INTERNAL_KEYS = {"_distance", "_chunk_hash", ...}
result = {k: v for k, v in metadata.items() if k not in INTERNAL_KEYS}
result["content"] = doc_content
result["score"] = score
```

**Your task:** Which approach should the spec recommend? Consider: what the MCP consumer (Claude Code / Dify) actually needs, forward compatibility, and whether unstructured metadata leakage could cause issues.

---

## General Review Request

Beyond the two specific questions, please review:

1. **Spec-to-code gaps:** Are there sections of spec v0.4 that the implementation doesn't cover, or covers differently than specified?
2. **Spec accuracy:** Are there statements in the spec that proved wrong during implementation? (e.g., the ChromaDB interface assumption — we needed `embed_query` beyond `__call__`)
3. **Missing from spec:** Are there behaviors the code implements that the spec doesn't mention?

**Output format:**
- For each finding: section reference, what spec says, what code does, recommended action
- Then answer Q1 and Q2
- Then: does spec need a v0.5 update? If so, list specific sections to change

---

## Constraints

- Do NOT rewrite the spec. Only identify changes needed.
- If you reference a specific code location, verify it by reading the file. If you're uncertain, say so.
- Keep recommendations actionable — the builder is GLM-5.1, not you.
