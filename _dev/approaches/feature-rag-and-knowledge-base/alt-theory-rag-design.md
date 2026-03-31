# Alt Theory RAG System — Technical Design Document

> Status: Draft v0.5 | Date: 2026-04-01
> v0.4 → v0.5 changes: post-implementation review fixes — Provider Protocol expanded to 4 methods, chunk ID format specified, parent_chunk_id replaces parent_id, parent embedding behavior corrected, metadata passthrough with blacklist, result format redefined, search logging formalized, ChromaDB constraints documented
> Implementation status: v0.3-integration (all 8 tasks done, 64/64 tests pass, parent-child search verified)
> Companion docs: [build-plan.md](build-plan.md) (detailed implementation steps), [roadmap.md](roadmap.md) (project stages)
> Previous: see git history for v0.1, v0.2, v0.3, v0.4

---

## 1. Background & Goals

### Why a Custom RAG

Alt Theory is an AI cognitive mentor for environmental psychology. It needs to:
- **Retrieve theoretical knowledge** (definitions, mechanisms, boundary conditions)
- **Support innovation** (theory critique, modification, novel application)
- **Work across AI tools** (Claude Code, OpenCode, future SDK agent)

Current state: Knowledge is in Dify's proprietary dataset with parent-child slice architecture. Migrating to a self-contained system.

### Constraints

- **Scale**: <200 documents per knowledge domain, ~5 domains max
- **Content**: Chinese-English mixed academic text (environmental psychology)
- **Deployment**: 100% local, no cloud API required (online API optional for future)
- **Users**: Single user (the developer)
- **Time budget**: Very limited — design must be minimal, build incrementally

### Fork Decision: knowledge-rag

Based on comparative analysis of agent-brain (~5000+ lines, over-engineered) vs knowledge-rag (~700 lines, 3 files, MCP-native):

**Fork knowledge-rag** and customize. Reasons:
- Already uses FastEmbed (ONNX in-process, no Ollama)
- Already MCP-native (FastMCP, works with Claude Code + OpenCode + Cursor)
- Already has hybrid search + cross-encoder reranking
- Only 3 files to modify: config.py, ingestion.py, server.py
- agent-brain's GraphRAG not needed (confirmed by user)

### Design Scope: Unified Search, Not Just RAG

> Key insight from session 001: We are not designing an "embedding RAG" alone.
> We are designing a **unified knowledge retrieval system** that includes:
> 1. **Claude Code / OpenCode native search** (grep, glob, read) — for precise keyword lookup
> 2. **MCP RAG server** — for semantic similarity + hybrid ranking
> 3. **Agent prompt design** — search strategy hints in agent.md (e.g., "read section titles first")
>
> This reduces external dependency complexity because Claude Code native search is already available.
> The RAG server adds value specifically for semantic similarity, BM25+vector hybrid ranking, and parent-child retrieval.
> For simple keyword lookups, grep may be sufficient.

**RAG vs Grep division** (confirmed by review):
- **Grep wins**: exact keyword lookup, known-item search ("find ART document"), browsing section titles
- **RAG wins**: semantic similarity ("theories about mental fatigue" → finds ART), hybrid ranking, automatic parent context attachment
- **Verdict**: RAG is worth it, but ONLY with parent-child chunking. Without parent-child, grep + Read is simpler and nearly as good.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    MCP Client                        │
│   (Claude Code / OpenCode / Cursor / SDK Agent)      │
└───────────┬─────────────────────────┬───────────────┘
            │                         │
            │ MCP (stdio)             │ Native tools
            │                         │ (grep/glob/read)
┌───────────▼──────────┐  ┌──────────▼────────────────┐
│  Alt Theory RAG       │  │  Claude Code Native Search │
│  MCP Server           │  │  - ripgrep for keywords    │
│                       │  │  - Read for PDF/content    │
│  ┌────────────────┐   │  │  - Glob for file finding   │
│  │ Ingestion      │   │  └───────────────────────────┘
│  │ (Chunking)     │   │
│  │ - Parent       │   │  ┌───────────────────────────┐
│  │ - Child        │   │  │  Agent.md Search Strategy  │
│  │ - Configurable │   │  │  - Level 0: theory list    │
│  │   parser       │   │  │  - Level 1: section titles │
│  └───────┬────────┘   │  │  - Level 2: RAG retrieval  │
│          │             │  │  - Level 3: PDF full text  │
│  ┌───────▼────────┐   │  └───────────────────────────┘
│  │ Hybrid Search  │   │
│  │ - Semantic     │   │
│  │ - BM25         │   │
│  │ - RRF Fusion   │   │
│  │ - Reranker     │   │
│  └───────┬────────┘   │
│          │             │
│  ┌───────▼─────────────────────────────────┐
│  │          Storage Layer                    │
│  │  ChromaDB (single collection per domain)  │
│  │  - chunk_type metadata: "parent" | "child"│
│  │  - parent_chunk_id: full ID for lookup    │
│  │  BM25 Index (in-memory, rebuilt on start) │
│  │  Metadata JSON (per domain)               │
│  └──────────────────────────────────────────┘
│          │
│  ┌───────▼──────────────────────────────────┐
│  │         Model Layer (Pluggable)           │
│  │                                           │
│  │  Default: FastEmbed (ONNX in-process)     │
│  │  - paraphrase-multilingual-MiniLM (384D)  │
│  │                                           │
│  │  Upgrade path:                            │
│  │  - multilingual-e5-large (1024D, FastEmbed)│
│  │  - BGE-M3 (FlagEmbedding, future)         │
│  │  - Online API (OpenAI, SiliconFlow)       │
│  │                                           │
│  │  Reranker: bge-reranker-base (MIT)        │
│  │  Note: Chinese support needs validation   │
│  └──────────────────────────────────────────┘
└──────────────────────────────────────────────┘
```

---

## 3. Core Modifications from knowledge-rag

### 3.1 Embedding Model: Pluggable Provider Architecture

**Problem**: No single model is clearly best. Requirements will evolve.
**Solution**: Abstract the embedding provider so models can be swapped via config.

**Provider abstraction** (interface aligned with ChromaDB v1.4.0+):

```python
class EmbeddingProvider(Protocol):
    """Pluggable embedding provider interface.
    ChromaDB v1.4.0+ requires all four methods.
    embed_query and embed_documents are aliases for __call__.
    """
    def __call__(self, input: List[str]) -> List[List[float]]: ...
    def name(self) -> str: ...
    def embed_query(self, input=None, **kwargs) -> List[List[float]]: ...
    def embed_documents(self, documents: List[str]) -> List[List[float]]: ...

class FastEmbedProvider:
    """Default: FastEmbed ONNX in-process."""
    def __init__(self, model_name: str, dim: int):
        self.model = TextEmbedding(model_name=model_name)
        self._dim = dim

    def __call__(self, input: List[str]) -> List[List[float]]:
        embeddings = list(self.model.embed(input))
        return [emb.tolist() for emb in embeddings]

    def name(self) -> str:
        return f"fastembed-{self.model_name}"

    def embed_query(self, input=None, **kwargs) -> List[List[float]]:
        """ChromaDB calls this for query_texts. Alias for __call__."""
        if isinstance(input, list): texts = input
        elif input is not None: texts = [input]
        else: texts = [kwargs.get("query", "")]
        return self(texts)

    def embed_documents(self, documents: List[str]) -> List[List[float]]:
        """ChromaDB calls this for document embedding. Alias for __call__."""
        return self(documents)

class FlagEmbeddingProvider:
    """Future: BGE-M3 via FlagEmbedding (PyTorch)."""
    def __init__(self, model_name: str):
        from FlagEmbedding import BGEM3FlagModel
        self.model = BGEM3FlagModel(model_name, use_fp16=True)

class OnlineAPIProvider:
    """Future: OpenAI / SiliconFlow / other embedding API."""
    def __init__(self, api_url: str, api_key: str, model_name: str): ...
```

**Why four methods**: ChromaDB v1.4.0+ internally calls `embed_query()` when processing `query_texts` and `embed_documents()` when indexing. The `__call__()` + `name()` interface is the documented public API, but without the aliases, ChromaDB raises `AttributeError` at runtime (confirmed during integration testing). `embed_query` and `embed_documents` can delegate to `__call__` — no duplicate logic needed.

**Provider instantiation** (factory function):

```python
# In providers.py:
def create_embedding_provider(config: dict) -> EmbeddingProvider:
    """Factory: maps config string → provider class. Single location for all provider logic."""
    provider_type = config['embedding']['provider']
    if provider_type == 'fastembed':
        return FastEmbedProvider(
            model_name=config['embedding']['model'],
            dim=config['embedding']['dimension']
        )
    elif provider_type == 'flag_embedding':
        return FlagEmbeddingProvider(...)
    elif provider_type == 'online_api':
        return OnlineAPIProvider(...)
    else:
        raise ValueError(f"Unknown embedding provider: {provider_type}")
```

Builder should NOT scatter `if provider == "fastembed"` across multiple files. All mapping logic lives in this one factory function.

**Error handling**: Provider `__init__()` should wrap model loading in try-except. If model download/initialization fails, raise a clear error message with troubleshooting hints (check network, disk space, model name). Don't let cryptic errors bubble up.

**Dimension validation**: After model loads, verify `len(first_embedding) == config.dimension`. If mismatch, raise error immediately rather than producing silently wrong vectors.

**Config-based selection** (no code changes to swap):

```yaml
# config.yaml (user-editable)
embedding:
  provider: fastembed
  model: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
  dimension: 384

  # Upgrade path (provider abstraction allows swap without code changes):
  # model: intfloat/multilingual-e5-large
  # dimension: 1024

  # Future BGE-M3:
  # provider: flag_embedding
  # model: BAAI/bge-m3
  # dimension: 1024

  # Future online:
  # provider: online_api
  # api_url: https://api.siliconflow.cn/v1/embeddings
  # model: netease-youdao/bce-embedding-base_v1

reranker:
  provider: fastembed
  model: BAAI/bge-reranker-base    # MIT license
  enabled: true
  # Note: bge-reranker-base Chinese support needs validation.
  # If poor: disable reranker for Phase 1, or evaluate alternatives.
```

**Initial model**: `paraphrase-multilingual-MiniLM-L12-v2` (384D, ~420MB, FastEmbed).
Reason: Sufficient for <200 docs, low disk/memory footprint. Provider abstraction allows upgrade to e5-large (1024D) or BGE-M3 later if retrieval quality is insufficient.

**Reranker**: `BAAI/bge-reranker-base` (1.04GB, MIT license).
NOT `jina-reranker-v2` (CC-BY-NC-4.0). Chinese support unvalidated — if poor, disable for Phase 1.

### 3.2 Parent-Child Chunking (Day 1 Requirement)

**This is the core reason for building a custom RAG** — without it, Claude Code grep is better.

**Two-level hierarchy**:

```
Document (Parent)
├── Metadata: from YAML frontmatter
├── Section 1 (Child chunk) — ## Summary
├── Section 2 (Child chunk) — ## Key Concept: X
├── Section 3 (Child chunk) — ## Core Proposition: Y
└── Section N (Child chunk) — ## Theoretical Relationship: Z
```

**Data model**:

```python
@dataclass
class Chunk:
    content: str
    index: int
    parent_id: str          # Link to parent document
    start_char: int
    end_char: int
    metadata: Dict[str, Any]
    chunk_type: str         # "parent" | "child"
    section_header: str     # e.g., "## Key Concept: Directed Attention"
```

**ChromaDB storage model** (single collection, metadata filtering):

```
Single ChromaDB collection per domain:
├── Parent chunks (chunk_type="parent", full document content)
├── Child chunks  (chunk_type="child", section-level content)
│   └── Each child has parent_id in metadata
└── Search: filter by chunk_type="child", then attach parent context
```

**Parent/child chunk content boundaries** (MUST be explicit):

```
Parent chunk:
  chunk_id = "{doc_id}_0"
  content = full document body AFTER frontmatter removal (no JSON/YAML header)
  metadata = all normalized frontmatter fields + {chunk_type: "parent", parent_id: doc_id}
  → Embedded and stored in ChromaDB (required by ChromaDB — cannot store without embedding)
  → Filtered out during search via where={"chunk_type": "child"}
  → Only retrieved for context attachment, never returned as search results

Child chunk:
  chunk_id = "{doc_id}_{index}"  where index starts at 1 (parent is 0)
  content = section text INCLUDING the section header
    e.g. "## Key Concept: Directed Attention\n\nNatural language explanation..."
  metadata = all normalized frontmatter fields + {
      chunk_type: "child",
      parent_id: doc_id,
      parent_chunk_id: "{doc_id}_0",  ← FULL ChromaDB chunk ID, set at index time
      section_header: "## Key Concept: Directed Attention"
  }
  → Embedded for search
```

**Chunk ID format** (applied in `_index_document()`, not in parsers.py):
- Parent: `{doc_id}_0` (always index 0, since parent chunk is first in list)
- Children: `{doc_id}_1`, `{doc_id}_2`, ... (sequential index)
- `parent_chunk_id` is injected at index time by `_index_document()`, not by the parser. This is because the chunk ID is generated in `_index_document()` using `f"{doc.id}_{chunk.index}"`, and the parser does not know the final ID format.

**Parent context attachment** (Method A: secondary query using `parent_chunk_id`):

```python
# In search_knowledge():
# 1. Query ChromaDB: where={"chunk_type": "child"} → get matching child chunks
# 2. Extract unique parent_chunk_id values from child metadata (full ID, e.g. "doc123_0")
# 3. Batch fetch parents: collection.get(ids=unique_parent_chunk_ids)
# 4. Build parent_chunk_id → parent_content lookup dict
# 5. For each child result: attach parent_content using parent_chunk_id as key
# Note: No suffix derivation needed — parent_chunk_id is the exact ChromaDB chunk ID
# Note: batch fetch (step 3) avoids N+1 queries
```

**Configurable chunk separators** (user can change without code):

```yaml
# config.yaml
chunking:
  separators:
    - "^##\\s+"               # Default: markdown ## headers
  # For legacy Dify format (v0.1 KB docs):
  # separators:
  #   - "^===SECTION===\\s*$"  # Note: \s* allows trailing whitespace
  child_max_size: 800
  child_overlap: 100
```

**Regex note**: Use `\\s*$` not `$` alone to tolerate trailing whitespace in v0.1 files (confirmed by review). In config.yaml, write `"^===SECTION===\\\\s*$"` (YAML double-escaping). In Python code, load via YAML parser which handles unescaping automatically — do NOT add extra escaping in code.

**Search behavior**:
- Search hits **child chunks** (fine-grained matching, filter `chunk_type="child"`)
- Return **child + parent metadata** (theory_name, author, year, etc.)
- Parent context always attached to results via `parent_chunk_id` lookup

### 3.3 Configurable Metadata Extraction (Dual Format: v0.1 + v0.2)

**Problem**: KB format will iterate. Must support both current (v0.1) and future (v0.2) formats.
**Solution**: Parser auto-detects format, config defines which fields to extract.

**Dual frontmatter parser**:

```python
def parse_frontmatter(content: str) -> Tuple[dict, str]:
    """Auto-detect and parse JSON (v0.1) or YAML (v0.2) frontmatter."""

    # Try JSON frontmatter first (v0.1 format: { ... } at file start)
    json_match = re.match(r"^\s*\{(.*?)\}\s*\n", content, re.DOTALL)
    if json_match:
        try:
            metadata = json.loads("{" + json_match.group(1) + "}")
            return metadata, content[json_match.end():]
        except json.JSONDecodeError:
            print(f"[WARN] Malformed JSON frontmatter, treating as no frontmatter")

    # Then try YAML frontmatter (v0.2 format: --- delimiters)
    yaml_match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    if yaml_match:
        try:
            metadata = yaml.safe_load(yaml_match.group(1))
            return metadata, content[yaml_match.end():]
        except yaml.YAMLError:
            print(f"[WARN] Malformed YAML frontmatter, treating as no frontmatter")

    # No frontmatter — use filename as fallback
    return {}, content
```

**Metadata alias lookup** (normalizes v0.1/v0.2 field name differences):

```python
def extract_metadata(frontmatter: dict, field_config: list) -> dict:
    """Normalize metadata: try canonical name first, then aliases.
    Missing required fields log warnings but don't crash — allows ingestion to continue.
    Falls back to filename parsing if all frontmatter metadata is missing.
    """
    result = {}
    for field in field_config:
        canonical = field['name']
        aliases = field.get('aliases', [])
        for key in [canonical] + aliases:
            if key in frontmatter:
                result[canonical] = frontmatter[key]
                break
        if field.get('required') and canonical not in result:
            print(f"[WARN] Required field '{canonical}' missing from frontmatter")
    return result
```

**ChromaDB metadata constraint**: All metadata values must be primitives (str, int, float, bool) or flat lists of primitives. No nested dicts, no lists of dicts. If frontmatter contains nested structures (e.g., `topics: [{"name": "ART", "weight": 0.8}]`), the parser must flatten or serialize them before storing in ChromaDB. Simple string lists (e.g., `topics: ["ART", "SRT"]`) are supported directly.

**Filename fallback** (when frontmatter is missing/malformed):
- Split filename stem by `-`, expect 4 parts: `{theory}-{author}-{year}-{type}`
- If parsing fails: use filename stem as theory name + log warning. Don't crash.

**KB v0.1 format** (current, auto-detected):
```json
{
  "title": "The Restorative Benefits of Nature...",
  "theoryname": "attention_restoration_theory",
  "author": "Stephen Kaplan",
  "year": 1995,
  "type": "core",
  "topics": ["Environmental Psychology", "ART"],
  "environment": ["Natural Environments", "Urban"],
  "population": ["General Public", "Students"]
}
```

**KB v0.2 format** (target direction, auto-detected):

```markdown
---
title: Attention Restoration Theory
theory: attention_restoration_theory
author: Stephen Kaplan
year: 1995
type: core
topics: [Environmental Psychology, Attention Restoration, Cognitive Fatigue]
---

# Attention Restoration Theory

> Kaplan, 1995 | Core Theory Paper

## Summary

One-paragraph summary of the theory...

## Key Concept: Directed Attention

Natural language explanation...

## Core Proposition: Four Components of Restoration

1. **Being Away** — freed from directed attention demands
2. **Extent** — rich enough to engage the mind
3. **Fascination** — holds attention effortlessly
4. **Compatibility** — resonance between environment and purposes

## See Also

- [[SRT-Ulrich-1991-core]] — Stress Recovery Theory
- [[biophilia-kellert-1993-core]] — Biophilia Hypothesis
```

**Metadata config** (which frontmatter fields become chunk metadata):

```yaml
# config.yaml
metadata:
  # Fields extracted from frontmatter → chunk metadata
  # Works with both v0.1 (JSON) and v0.2 (YAML) formats
  fields:
    - name: theory          # v0.1 uses "theoryname", v0.2 uses "theory"
      required: true
      aliases: [theoryname] # Map v0.1 field name to canonical name
    - name: author
      required: true
    - name: year
      type: int
    - name: type            # "core" | "details"
    - name: title
    - name: topics
      type: list
    - name: environment
      type: list
    - name: population
      type: list
  # Auto-derived fields (not in frontmatter)
  auto:
    - section_header        # From ## heading text
    - section_type          # Derived: "summary" | "concept" | "proposition" | "relationship"
    - doc_pair              # Links core ↔ details by filename convention
  # Fallback if frontmatter missing
  fallback:
    - source: filename      # Parse theory-author-year-type from filename
```

**Note on KB format**: The RAG system should NOT be tightly coupled to a specific KB format. The ingestion parser auto-detects format:
- Both JSON and YAML frontmatter are supported without config changes
- Separator patterns (regex) are config parameters
- Metadata fields are defined in config with alias support for format differences
- If KB format changes, only config.yaml may need updating, not code

### 3.4 PDF Source Linking

**Constraint**: PDFs will be in project directory, but links can't be embedded in shared docs (copyright). When others use the system, they may not have PDFs or need to download themselves.

**Solution**: Separate source mapping file, not inline in docs.

```yaml
# sources.yaml (separate from KB notes, not shared)
env-psychology:
  ART-Kaplan-1995:
    pdf: papers/Kaplan-1995-Restorative-Benefits.pdf
    doi: "10.1016/0272-4944(95)90001-2"
  SRT-Ulrich-1991:
    pdf: papers/Ulrich-1991-Stress-Recovery.pdf
    doi: "10.1111/j.1467-8721.1991.tb00322.x"
```

RAG server can optionally use this to:
- Provide PDF path when AI needs to read original
- Provide DOI for reference/citation
- This file is optional — system works without it

### 3.5 Domain-Based Knowledge Base Switching

**Current**: Single documents/ directory, single ChromaDB collection
**New**: Multiple domain collections, config-driven switching

```
data/
├── collections/
│   ├── env-psychology/    # ChromaDB data
│   ├── urban-design/      # Future domain
│   └── ...

documents-env-psychology/  # Domain-specific document folders
documents-urban-design/
```

**Active domain stored in config.yaml** (not a separate file):

```yaml
# config.yaml
domain:
  active: env-psychology   # Current active domain
  # To switch: change this value and reindex
```

**switch_domain behavior** (verified from code — server.py lines 1711-1746):
1. Read `config.yaml`
2. Validate `documents-{domain}` directory exists; if not, return error with available domains
3. Update `config.yaml` → `domain.active` to new domain name
4. Call `reindex_documents(force=True)` to rebuild index from new domain's documents
5. Return JSON: `{status: "success", message: "Switched to domain '{domain}'", reindex: {stats}}`

Builder should NOT implement switch_domain as "only change config file" — this would leave stale data in memory.

### 3.6 Query Expansion & Keyword Routing

**Replace security terms with environmental psychology terms** (config-driven):

```yaml
# config.yaml
query_expansions:
  ART: [Attention Restoration Theory, ART, attention restoration]
  SRT: [Stress Recovery Theory, SRT, stress recovery]
  biophilic: [biophilic design, biophilia, biophilic]
  place attachment: [place attachment, place identity, place dependence]

keyword_routes:
  attention: [attention restoration, directed attention, ART, fascination]
  stress: [stress recovery, SRT, cortisol, psychological stress]
  biophilic: [biophilic, biophilia, nature connectedness]
  spatial: [place attachment, place identity, territoriality, personal space]
  perception: [environmental perception, spatial cognition, wayfinding]
```

**Phase 1 note**: Start with minimal or empty expansions. Add incrementally based on retrieval quality testing. Don't block implementation on building a complete expansion dictionary.

### 3.7 Search Parameters

```yaml
# config.yaml
search:
  default_top_k: 3
  max_top_k: 20
  hybrid_alpha: 0.7            # 0.7 vector, 0.3 keyword
  # score_threshold: 0.5       # Phase 2 feature — not in first version
```

### 3.8 Retrieval Result Format

**Metadata passthrough strategy**: All frontmatter metadata fields flow through to results automatically. Only a small blacklist of internal keys is excluded.

```python
# Internal keys excluded from results (not useful for MCP consumer)
INTERNAL_META_KEYS = {"content_hash", "chunk_index", "doc_id"}

# Build result: passthrough all metadata except internal keys
result = {k: v for k, v in metadata.items() if k not in INTERNAL_META_KEYS}
result["content"] = chunk_document_text
result["score"] = normalized_score
result["search_method"] = "hybrid" | "semantic" | "keyword"
# Optional: semantic_rank, bm25_rank, reranker_score if available
```

**Why passthrough not whitelist**: The previous whitelist approach required updating the formatter every time a new metadata field was added. This caused two bugs during development (parent-child fields missing, then theory fields missing). Passthrough with blacklist is forward-compatible — new KB v0.2 fields automatically appear without code changes.

**Result fields in practice** (verified by integration test):

| Field | Source | Example |
|-------|--------|---------|
| `content` | Chunk document text | "## Key Concept: Directed Attention\n\n..." |
| `theory` | Frontmatter (aliased) | "attention_restoration_theory" |
| `author` | Frontmatter | "Stephen Kaplan" |
| `year` | Frontmatter | 1995 |
| `title` | Frontmatter | "The Restorative Benefits of Nature..." |
| `chunk_type` | Derived | "child" |
| `parent_chunk_id` | Injected at index | "835af7c752b8266b_0" |
| `section_header` | Parsed from content | "## Key Concept: Directed Attention" |
| `parent_content` | Attached post-search | Full parent document text |
| `score` | Normalized RRF | 0.847 |
| `search_method` | Derived | "hybrid" |
| `topics` | Frontmatter | ["Empirical Studies", "Restorative Environments"] |

**Alt Theory result template** (for structured display to LLM consumer):

```python
def format_result(result: dict) -> str:
    """Format a single result for LLM consumption."""
    return f"""### doc: {result.get('title', result.get('filename', 'unknown'))}
### theory name: {result.get('theory', 'unknown')}
quotation: {result.get('content', '')}
---"""
```

This template formats results for readability when consumed by Claude Code or other LLM tools. It is NOT a Dify constraint — it is an Alt Theory design choice for structured theory citation display.

### 3.9 Search Logging

All searches are logged to `data/search_log.jsonl` for retrieval quality analysis during Stage 2a testing.

**Log format** (one JSON object per line):

```json
{
  "timestamp": "2026-03-31T14:30:00.123456+08:00",
  "query": "attention restoration",
  "top_k": 3,
  "hybrid_alpha": 0.7,
  "category_filter": null,
  "result_count": 3,
  "top_results": ["attention_restoration_theory", "stress_reduction_theory", "biophilia_hypothesis"]
}
```

**Fields**:
- `timestamp`: ISO 8601 with timezone
- `query`: original query string
- `top_k`: requested result count
- `hybrid_alpha`: vector/keyword weight ratio
- `category_filter`: applied category filter (null if none)
- `result_count`: number of results returned
- `top_results`: theory names of first 3 results (for quick quality scanning)

---

## 4. MCP Tools

### Phase 1: Core tools only (4 tools)

**Strategy**: Start lean with only essential tools. Reduces testing burden. Add more in Phase 2 after core works.

| Tool | Purpose | Source |
|------|---------|--------|
| `search_knowledge` | Hybrid search with parent-child context | Modified from knowledge-rag (change alpha to 0.7, add parent context) |
| `reindex_documents` | Rebuild index from document files | Modified from knowledge-rag (add domain support) |
| `list_domains` | List available knowledge base domains | Renamed from `list_categories` |
| `switch_domain` | Switch active knowledge base domain | New tool |

### Phase 2+: Add remaining tools after core is stable

Tools to add back after core validation:
- `get_theory_overview` — Get full parent document (all child chunks assembled)
- `add_document`, `update_document`, `remove_document` — Document management
- `search_similar` — Find similar chunks
- `evaluate_retrieval` — Retrieval quality evaluation

Tools safe to remove permanently:
- `add_from_url` — standalone, no internal coupling, not needed for local KB

---

## 5. File Structure

```
alt-theory-rag/
├── mcp_server/
│   ├── __init__.py
│   ├── config.py          # Config loading from YAML
│   ├── ingestion.py       # Document parsing + parent-child chunking
│   ├── server.py          # MCP server + hybrid search + collection management
│   ├── models.py          # Data classes (Chunk, Document, TheoryMetadata)
│   ├── providers.py       # Embedding/reranker provider abstraction
│   └── parsers.py         # Configurable document parsers (dual format, separators, metadata)
├── config.yaml            # User-editable configuration (includes domain.active)
├── sources.yaml           # Optional PDF/DOI source mapping
├── documents/             # Symlink to current active domain
├── documents-env-psychology/
├── data/
│   └── collections/       # ChromaDB data per domain
├── requirements.txt
└── README.md
```

---

## 6. Build Roadmap (High-Level)

> Detailed step-by-step build plan with file/function references: [build-plan.md](build-plan.md)

### Step dependency graph

```
Step 1: Fork ──────────────────────────────────────────────┐
Step 2: Provider abstraction (providers.py) ────────────────┤
Step 3: Config → YAML + model swap (config.py + config.yaml)┤
Step 4: Parser pipeline (parsers.py) ◄── depends on 3 ─────┤
  - dual-format frontmatter (JSON v0.1 + YAML v0.2)        │
  - parent-child chunking with configurable separators      │
  - metadata extraction with aliases + filename fallback    │
Step 5: Search with parent context (server.py) ◄── 2,3,4 ──┤
Step 6: 4 MCP tools (server.py) ◄── 5 ────────────────────┤
Step 7: Config tuning + search logging ────────────────────┤
Step 8: Test with v0.1 KB docs ◄── all above ──────────────┘
```

### Key constraints for builder

- **Parent-child chunking is NOT optional** — it's the core value. Without it, grep is better.
- **Provider Protocol requires 4 methods** — `__call__()`, `name()`, `embed_query()`, `embed_documents()`. The last two can alias `__call__`. Without them, ChromaDB raises `AttributeError` at runtime.
- **Dimension validation** — after first embedding, verify `len(embedding) == config.dimension`. Raise error on mismatch.
- **Single collection** — use `chunk_type` metadata filter, not two collections.
- **parent_chunk_id, not parent_id** — child metadata stores full ChromaDB chunk ID (e.g., `"doc123_0"`), not bare doc ID. Set in `_index_document()`, not in parsers.py.
- **Metadata passthrough** — result formatter uses passthrough + blacklist, not whitelist. New metadata fields must appear automatically.
- **ChromaDB metadata constraints** — all metadata values must be str/int/float/bool or flat list of str. No nested dicts. Parser must flatten.
- **Config YAML escaping** — regex patterns in config.yaml use `\\s*` (double backslash). Python loads via YAML parser which handles unescaping automatically. Do NOT add extra escaping in code.
- **Error handling** — wrap model loading, JSON/YAML parsing, and file I/O in try-except with clear messages. Don't crash silently. Missing required metadata fields log warnings but don't block ingestion.

---

## 7. Open Questions

### Resolved in v0.4

| Question | Resolution |
|----------|-----------|
| Q1: Unified search / agent.md strategy | Deferred to Stage 3 of roadmap. Test RAG and native separately first (Stages 2a/2b), then design hybrid strategy. |
| Q2: RAG vs Grep boundary | Staged testing approach: 2a (RAG only), 2b (native only), then compare. Prepare question sets with recall completeness, false positives, speed metrics. |
| Q3: PDF source mapping | sources.yaml confirmed (separate from KB docs) |
| Q4: Initial embedding model | paraphrase-multilingual-MiniLM (384D, ~420MB) — start small, upgrade later |
| Q5: KB format transition | Parser handles both v0.1 and v0.2 formats — no batch conversion needed |
| Q6: bge-reranker-base Chinese support | Unvalidated. If poor: disable reranker for Phase 1. |
| Q7: Search logging | Moved to spec Section 3.9. Format: `{timestamp, query, top_k, hybrid_alpha, category_filter, result_count, top_results}` |
| Q8: Parent context attachment | Method A: secondary ChromaDB query by `parent_chunk_id` (full chunk ID stored in child metadata). Future optimization: embed parent metadata in child chunks (documented in [build-plan.md](build-plan.md) "Future optimizations"). |

### No remaining open questions

All architectural decisions are resolved. Spec is implementation-ready.

---

## Appendix A: Dify v0.4 Reference

| Aspect | Dify v0.4 | Alt Theory RAG (v0.3 design) |
|--------|-----------|------------------------------|
| Embedding | bce-embedding-base_v1 (SiliconFlow API) | paraphrase-multilingual-MiniLM (local, FastEmbed) |
| Reranker | Qwen3-Reranker-4B (disabled) | bge-reranker-base (MIT, enabled — Chinese TBD) |
| Search | Hybrid (0.7/0.3) | Hybrid (0.7/0.3, configurable) |
| Top K | 3 | 3 (configurable) |
| Chunking | Parent-child (Dify native) | Parent-child (single collection, chunk_type metadata) |
| Metadata | document_name, theory_name | Full frontmatter + derived fields (dual format parser) |
| KB storage | Dify cloud | Local ChromaDB |
| Access | Dify workflow only | MCP (any tool) + native grep |
| MCP Tools | N/A | 4 core tools (Phase 1), expand later |

## Appendix B: KB Content Analysis

Source: `resources/Knowledge base docs v0.1/`

**v0.1 format** (current, auto-detected by parser):
- JSON frontmatter (no `---` delimiters, wrapped in `{ }`)
- `===SECTION===` as section separator (Dify-specific)
- core + details document pairs per theory
- ~30+ theory documents, 3-15KB each
- Filename convention: `{theory}-{author}-{year}-{type}.md`

**v0.2 format** (target direction, auto-detected by parser):
- YAML frontmatter (`---` delimited, standard)
- `##` headers as natural section/chunk boundaries
- core + details pairing preserved
- Natural markdown — better for grep, embedding, and human editing
- `[[wikilinks]]` and JSON frontmatter: future optional, NOT in this version

## Appendix C: Review History

| Date | Reviewer | Document | Key outcomes |
|------|----------|----------|-------------|
| 2026-03-31 | Claude Opus 4.6 | v0.2 → review prompt v0.2 | 4 critical issues, 4 concerns. Led to v0.3: ChromaDB storage model, interface fix, dual-format parser, lean MCP tools, model change. See `design-iterations/20260331-review-response-by-claude-opus-4-6.txt` |
| 2026-03-31 | Claude Opus 4.6 | v0.3 → review prompt v0.3 | Spec gap analysis + build plan. 5 sections need clarification (3.1, 3.2, 3.3, 3.5, 3.8), 3 sections ready. Led to v0.4: factory function, chunk content boundaries, parent context Method A, alias lookup, domain switching behavior, result template fields, search logging, separated build plan. See `design-iterations/20260331-review-v0.3.3-updated-full-response-by-claude-opus-4-6.txt` |
| 2026-04-01 | Claude Opus 4.6 | v0.4 → post-implementation review | 8 spec-to-code gaps, 2 design decisions. Provider Protocol missing embed_query (Gap 1), parent chunks incorrectly documented as "NOT embedded" (Gap 2), chunk ID format unspecified (Gap 3), metadata error handling wrong (Gap 4), result template never implemented (Gap 6). Led to v0.5: 4-method Protocol, parent_chunk_id, passthrough with blacklist, search logging formalized. See `design-iterations/20260331-review-v0.4.2-ful-Post-Implementation Review-by-claude-opus-4-6.txt` |
