# Alt Theory RAG — Spec v0.5 Review Prompt

> For: Claude Opus 4.6 | Date: 2026-04-01
> Purpose: Review spec v0.5 changes for correctness and completeness

---

## Context

Spec was updated from v0.4 to v0.5 based on your post-implementation review (parts 1-11). All 8 gaps and 2 design decisions you identified have been addressed. The implementation is at v0.3-integration (all 8 tasks done, 64/64 tests pass, parent-child search verified after fixes).

**What changed in v0.5:**

1. **Section 3.1** — Provider Protocol expanded from 2 methods to 4 methods (`__call__`, `name`, `embed_query`, `embed_documents`). Added dimension validation. Updated explanation of why 4 methods are needed.

2. **Section 3.2** — Added chunk ID format specification (`{doc_id}_0` for parent, `{doc_id}_1+` for children). Added `parent_chunk_id` (full ChromaDB chunk ID) to child metadata. Corrected parent embedding behavior: parents ARE embedded (ChromaDB requirement) but filtered out during search. Updated parent context attachment pseudocode to use `parent_chunk_id` directly (no suffix derivation).

3. **Section 3.3** — Updated error handling: missing required fields log warnings, don't crash. Added ChromaDB metadata constraint documentation (no nested dicts, only primitives + flat string lists).

4. **Section 3.5** — `switch_domain` behavior updated to reflect verified code: validate directory → update config.yaml → call reindex_documents(force=True) → return JSON.

5. **Section 3.8** — Replaced "Dify-compatible" template with full result format specification. Documented passthrough + blacklist strategy. Added result field table with all fields. Retained template as Alt Theory design choice (not Dify constraint).

6. **Section 3.9 (new)** — Search logging formalized. JSONL format, field definitions.

7. **Section 6 builder constraints** — Updated to reflect all v0.5 changes (4-method Protocol, parent_chunk_id, passthrough, ChromaDB constraints).

8. **Architecture diagram** — Updated `parent_id` reference to `parent_chunk_id`.

9. **Appendix C** — Added v0.4 review entry.

10. **Open Questions Q7** — Updated to reference Section 3.9. Q8 updated to reference `parent_chunk_id`.

---

## Files to Read

- **Spec v0.5**: `_dev/approaches/feature-rag-and-knowledge-base/alt-theory-rag-design.md`
- **Implementation code**: `alt-theory-rag/mcp_server/server.py` (for verification of spec claims)
- **Your previous review**: `design-iterations/20260331-review-v0.4.2-ful-Post-Implementation Review-by-claude-opus-4-6.txt`

---

## Review Questions

1. **Completeness**: Did we address all 8 gaps and both design decisions from your v0.4 review? Anything missed?

2. **Correctness**: Are the v0.5 changes technically accurate? Do they match the actual implementation?

3. **Consistency**: Are there any contradictions within the spec? (e.g., old references to `parent_id` that should be `parent_chunk_id`, references to "NOT embedded" that should say "embedded but filtered")

4. **Anything new**: Based on reading v0.5, are there additional issues you see that weren't in your v0.4 review?

5. **Implementation readiness**: If a builder reads v0.5 from scratch, can they implement correctly? Or are there still ambiguous areas?

---

## Constraints

- Focus on correctness and completeness. Do NOT rewrite the spec.
- If you reference a specific spec section, verify it by reading the file.
- If you're uncertain about something, say so rather than guessing.
- Keep output structured: numbered findings, then verdict.
