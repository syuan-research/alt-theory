# Alt Theory RAG — Build Plan

> Date: 2026-03-31
> Status: Draft (from Opus 4.6 review, adapted by GLM)
> Spec reference: [alt-theory-rag-design.md](alt-theory-rag-design.md) v0.4
> Roadmap stage: Stage 1 (Build RAG MCP Server)

---

## Overview

8 steps to build a working RAG server. Each step = one logical unit of work with clear "done" criteria.

Steps 4 merges what Opus split into Steps 4+5+6+7 (all parsers.py work). Step 3 merges what Opus split into Steps 3+7 (config to YAML + model swap).

**For the builder (GLM)**: Read the spec first (alt-theory-rag-design.md), especially Sections 3.1-3.3. This plan tells you WHAT to change. The spec tells you WHY and what the result should look like.

---

## Step 1: Fork

- **Action**: Copy `tmp/knowledge-rag/` → `alt-theory-rag/`
- **Files**: Entire directory
- **No code changes**: Pure file operation
- **Done when**: `alt-theory-rag/` exists with all knowledge-rag files

---

## Step 2: Provider Abstraction

- **Files to create**: `mcp_server/providers.py`
- **Files to modify**: `mcp_server/server.py`
- **Current state**: `FastEmbedEmbeddings` class directly instantiated in server.py (~line 133-183)
- **Target state**:
  - `providers.py` contains `EmbeddingProvider` Protocol + `FastEmbedProvider` class
  - `providers.py` contains `create_embedding_provider(config)` factory function
  - server.py `KnowledgeOrchestrator.__init__` calls factory instead of direct instantiation
- **Key interface**: `__call__(input: List[str]) -> List[List[float]]` + `name() -> str`
- **Error handling**: Wrap model loading in try-except. Clear error message if download fails.
- **Dim validation**: After first embedding, verify `len(embedding) == config.dimension`
- **Data flow**: `config dict → create_embedding_provider() → EmbeddingProvider instance`
- **Done when**: Server starts and uses FastEmbedProvider via factory function

---

## Step 3: Config to YAML + Model Swap

- **Files to create**: `config.yaml`
- **Files to modify**: `mcp_server/config.py`
- **Current state**:
  - config.py has hardcoded Python dataclass (lines 34-294)
  - embedding_model = "BAAI/bge-small-en-v1.5", embedding_dim = 384
- **Target state**:
  - `config.yaml` with embedding/reranker/chunking/metadata/search/domain sections
  - config.py loads from YAML via `yaml.safe_load()`
  - Model = `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (384D)
  - Reranker = `BAAI/bge-reranker-base`
  - Remove security-specific config (category_mappings, keyword_routes with security terms)
- **Key point**: YAML loading replaces Python dataclass. Don't keep both.
- **Done when**: Server starts, loads config.yaml, uses new multilingual model

---

## Step 4: Parser Pipeline (parent-child + dual-format + aliases + separators)

This is the biggest step. All parsers.py logic in one shot.

- **Files to create**: `mcp_server/parsers.py`
- **Files to modify**: `mcp_server/ingestion.py`, `mcp_server/config.py` (Chunk dataclass)
- **Current state**:
  - ingestion.py `_chunk_markdown()` generates flat chunks (~line 492-604)
  - `_parse_markdown()` only handles YAML frontmatter (~line 197-202)
  - Chunk dataclass has no `chunk_type` or `parent_id` fields (~line 51)
  - Separator hardcoded as `r"^#{2,3}\s+"` (~line 523)
- **Target state**: `parsers.py` contains:

  **a) `parse_frontmatter(content: str) -> Tuple[dict, str]`**
  - Try JSON first: `r"^\s*\{.*?\}\s*\n"` (v0.1 format)
  - Then YAML: `r"^---\n.*?\n---\n"` (v0.2 format)
  - Wrap both in try-except. Malformed → empty dict + warning. Don't crash.

  **b) `extract_metadata(frontmatter: dict, field_config: list) -> dict`**
  - For each field: try canonical name, then aliases
  - Required field missing → warning (not crash)
  - Returns normalized metadata dict

  **c) `parse_filename_fallback(filename: str) -> dict`**
  - Split stem by `-`, expect 4 parts: theory-author-year-type
  - Fails → use filename stem as theory + warning

  **d) `create_parent_child_chunks(doc: Document, config: dict) -> List[Chunk]`**
  - Read separator regex from config (`chunking.separators`)
  - Split document body into sections using separator
  - Create 1 parent chunk: `chunk_type="parent"`, content = full body (after frontmatter removal), metadata = all frontmatter fields
  - Create N child chunks: `chunk_type="child"`, content = section text **including header**, metadata = frontmatter fields + `section_header` + `parent_id`

- **Chunk dataclass changes** (ingestion.py):
  - Add `chunk_type: str` field
  - Add `parent_id: str` field
  - Add `section_header: str` field

- **Config YAML escaping note**: Regex patterns in config.yaml use `\\s*` (double backslash). Python loads via YAML parser which auto-unescapes to `\s*`. Do NOT add extra escaping in Python code.

- **Data flow**: `raw file → parse_frontmatter() → (metadata, body) → extract_metadata() → normalized metadata → create_parent_child_chunks() → 1 parent + N children`
- **Done when**: `reindex_documents` creates parent+child chunks in ChromaDB, v0.1 KB docs parse correctly

---

## Step 5: Search with Parent Context

- **Files to modify**: `mcp_server/server.py`
- **Current state**: `search_knowledge` searches all chunks, no parent context
- **Target state**:
  1. Search with `where={"chunk_type": "child"}` — only match children
  2. Extract unique `parent_id`s from results
  3. Batch fetch parents: `collection.get(ids=unique_parent_ids)`
  4. Build `parent_id → parent_content` lookup
  5. Attach parent content to each child result
  6. Log search to `data/search_log.jsonl`
- **Batch fetch is critical**: Do NOT query parent one-by-one (N+1 problem)
- **Done when**: Search returns child chunks with parent content attached

---

## Step 6: MCP Tools (4 core)

- **Files to modify**: `mcp_server/server.py`
- **Tools to implement**:

  | Tool | Logic |
  |------|-------|
  | `search_knowledge` | Already modified in Step 5. Verify hybrid_alpha=0.7 default. |
  | `reindex_documents` | Add domain support: read `config.domain.active`, index from corresponding documents folder |
  | `list_domains` | List directories under `data/collections/` |
  | `switch_domain` | See spec Section 3.5: validate domain → update config.yaml → trigger reindex |

- **Remove** (or comment out): all other knowledge-rag MCP tools that aren't these 4
- **Done when**: All 4 tools respond correctly via MCP

---

## Step 7: Config Tuning + Search Logging

- **Files to modify**: `config.yaml`, `mcp_server/server.py`
- **Actions**:
  - Set `search.hybrid_alpha: 0.7`
  - Set `search.default_top_k: 3`
  - Add search logging: append JSONL to `data/search_log.jsonl` after each search
  - Format: `{"timestamp": "...", "query": "...", "top_k": 3, "results": [...], "latency_ms": 45}`
- **Done when**: Config values match spec, search log file grows with queries

---

## Step 8: Test with v0.1 KB Docs

- **No code changes**: Pure verification
- **Actions**:
  1. Point documents/ to `resources/Knowledge base docs v0.1/`
  2. Run `reindex_documents`
  3. Verify: JSON frontmatter parsed correctly (check a few documents)
  4. Verify: `===SECTION===` separator works (check section count per doc)
  5. Verify: parent-child chunks created (check ChromaDB: parent count = doc count, child count > parent count)
  6. Run test queries:
     - "什么是注意力恢复理论" (Chinese, semantic)
     - "ART" (English, keyword)
     - "Kaplan directed attention" (mixed, hybrid)
  7. Verify: results include parent context
  8. Check: `data/search_log.jsonl` has entries
- **Done when**: All verifications pass

---

## Future Optimizations (not in Stage 1)

- **Method B for parent context**: Embed parent metadata (theory, author, year) in child chunks to avoid secondary query. Revisit if search latency is problematic.
- **BM25 index serialization**: Skip rebuild on startup (pickle to disk). Only matters if startup time > 5s.
- **Score threshold**: Add `search.score_threshold` config for filtering low-quality results.
- **Expand query expansions**: Build comprehensive theory synonym dictionary based on Stage 2a testing.
- **Additional MCP tools**: get_theory_overview, document management, evaluate_retrieval, search_similar.
