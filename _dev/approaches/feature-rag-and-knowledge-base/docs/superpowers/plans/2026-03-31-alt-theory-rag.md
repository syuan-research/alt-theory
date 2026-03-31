# Alt Theory RAG Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working MCP RAG server with parent-child chunking that can index and search Alt Theory KB documents.

**Architecture:** Fork knowledge-rag, replace config/embedding/chunking layers, add parent-child chunking with dual-format parser, implement 4 core MCP tools.

**Tech Stack:** Python 3.11-3.12, FastEmbed (ONNX), ChromaDB, FastMCP, BM25Okapi, PyYAML

**Not in scope:** sources.yaml (PDF/DOI source mapping) deferred to Phase 2.

**Spec:** [alt-theory-rag-design.md](alt-theory-rag-design.md) v0.4 | **Build ref:** [build-plan.md](build-plan.md)

---

## File Structure Map

Files the builder will create or modify:

| File | Action | Responsibility |
|------|--------|----------------|
| `alt-theory-rag/` | Create (fork) | Project root |
| `alt-theory-rag/config.yaml` | Create | All user-editable config |
| `alt-theory-rag/mcp_server/providers.py` | Create | Embedding provider Protocol + FastEmbedProvider + factory |
| `alt-theory-rag/mcp_server/parsers.py` | Create | Dual-format frontmatter parser, metadata extractor, parent-child chunker |
| `alt-theory-rag/mcp_server/config.py` | Modify | Replace hardcoded dataclass with YAML loader |
| `alt-theory-rag/mcp_server/ingestion.py` | Modify | Add chunk_type/parent_id/section_header to Chunk dataclass, wire parsers.py |
| `alt-theory-rag/mcp_server/server.py` | Modify | Use factory for embeddings, parent-child search, 4 MCP tools, search logging |
| `alt-theory-rag/tests/test_providers.py` | Create | Provider + factory tests |
| `alt-theory-rag/tests/test_parsers.py` | Create | Frontmatter + metadata + chunking tests |
| `alt-theory-rag/tests/test_search.py` | Modify | Parent-child search tests |

---

## Task 1: Fork knowledge-rag

**Files:**
- Create: `alt-theory-rag/` (copy of `tmp/knowledge-rag/`)

- [ ] **Step 1: Copy the project**

```bash
cp -r tmp/knowledge-rag/ alt-theory-rag/
```

- [ ] **Step 2: Verify fork works**

```bash
cd alt-theory-rag && python -c "from mcp_server import config; print(config.config.embedding_model)"
```

Expected: `BAAI/bge-small-en-v1.5`

- [ ] **Step 3: Commit**

```bash
git add alt-theory-rag/
git commit -m "feat: fork knowledge-rag as alt-theory-rag base"
```

---

## Task 2: Embedding Provider Abstraction

**Files:**
- Create: `alt-theory-rag/mcp_server/providers.py`
- Create: `alt-theory-rag/tests/test_providers.py`
- Modify: `alt-theory-rag/mcp_server/server.py`

**Spec ref:** Section 3.1

- [ ] **Step 1: Write failing test for FastEmbedProvider**

Create `alt-theory-rag/tests/test_providers.py`:

```python
"""Tests for embedding provider abstraction."""
import pytest
from mcp_server.providers import FastEmbedProvider, create_embedding_provider


def test_fastembed_provider_call_interface():
    """Provider must implement __call__(input: List[str]) -> List[List[float]]."""
    provider = FastEmbedProvider(
        model_name="BAAI/bge-small-en-v1.5",  # Use original model for test speed
        dim=384
    )
    result = provider(["hello world"])
    assert isinstance(result, list)
    assert len(result) == 1
    assert isinstance(result[0], list)
    assert len(result[0]) == 384


def test_fastembed_provider_name():
    """Provider must implement name() -> str."""
    provider = FastEmbedProvider(model_name="BAAI/bge-small-en-v1.5", dim=384)
    assert "bge-small" in provider.name()


def test_create_provider_factory():
    """Factory maps config string to provider class."""
    cfg = {"embedding": {"provider": "fastembed", "model": "BAAI/bge-small-en-v1.5", "dimension": 384}}
    provider = create_embedding_provider(cfg)
    assert callable(provider)
    assert "bge-small" in provider.name()


def test_create_provider_unknown_raises():
    """Factory raises ValueError for unknown provider."""
    cfg = {"embedding": {"provider": "nonexistent", "model": "x", "dimension": 1}}
    with pytest.raises(ValueError, match="Unknown embedding provider"):
        create_embedding_provider(cfg)


def test_dim_validation():
    """Provider validates embedding dimension matches config."""
    provider = FastEmbedProvider(model_name="BAAI/bge-small-en-v1.5", dim=999)
    with pytest.raises(ValueError, match="dimension"):
        provider(["test"])
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd alt-theory-rag && python -m pytest tests/test_providers.py -v
```

Expected: FAIL (ModuleNotFoundError: No module named 'mcp_server.providers')

- [ ] **Step 3: Implement providers.py**

Create `alt-theory-rag/mcp_server/providers.py`:

```python
"""Embedding provider abstraction with factory function.

Interface aligned with ChromaDB v1.4.0+ embedding_function:
  __call__(input: List[str]) -> List[List[float]]
  name() -> str
"""
from typing import List, Protocol, runtime_checkable


@runtime_checkable
class EmbeddingProvider(Protocol):
    """Pluggable embedding provider interface."""
    def __call__(self, input: List[str]) -> List[List[float]]: ...
    def name(self) -> str: ...


class FastEmbedProvider:
    """FastEmbed ONNX in-process embedding provider."""

    def __init__(self, model_name: str, dim: int):
        try:
            from fastembed import TextEmbedding
            self._model = TextEmbedding(model_name=model_name)
        except Exception as e:
            raise RuntimeError(
                f"Failed to load embedding model '{model_name}'. "
                f"Check: 1) network connection for first download, "
                f"2) disk space, 3) model name spelling. Error: {e}"
            ) from e
        self.model_name = model_name
        self._dim = dim
        self._validated = False

    def __call__(self, input: List[str]) -> List[List[float]]:
        if not input:
            return []
        embeddings = list(self._model.embed(input))
        result = [emb.tolist() for emb in embeddings]
        if not self._validated and result:
            actual_dim = len(result[0])
            if actual_dim != self._dim:
                raise ValueError(
                    f"Embedding dimension mismatch: config says {self._dim}, "
                    f"model produces {actual_dim}. Update config.yaml dimension."
                )
            self._validated = True
        return result

    def name(self) -> str:
        return f"fastembed-{self.model_name}"


def create_embedding_provider(config: dict) -> EmbeddingProvider:
    """Factory: maps config['embedding']['provider'] string to provider class.
    All provider instantiation logic lives here — don't scatter if/else elsewhere.
    """
    provider_type = config.get("embedding", {}).get("provider", "fastembed")
    model_name = config.get("embedding", {}).get("model", "BAAI/bge-small-en-v1.5")
    dimension = config.get("embedding", {}).get("dimension", 384)

    if provider_type == "fastembed":
        return FastEmbedProvider(model_name=model_name, dim=dimension)
    elif provider_type == "flag_embedding":
        raise NotImplementedError("FlagEmbedding provider not yet implemented")
    elif provider_type == "online_api":
        raise NotImplementedError("Online API provider not yet implemented")
    else:
        raise ValueError(f"Unknown embedding provider: {provider_type}")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd alt-theory-rag && python -m pytest tests/test_providers.py -v
```

Expected: 4 passed, 1 xfail or all 5 passed (dim validation test may take time on first run)

- [ ] **Step 5: Wire factory into server.py**

In `alt-theory-rag/mcp_server/server.py`, find `self.embed_fn = FastEmbedEmbeddings()` in `KnowledgeOrchestrator.__init__` and replace:

```python
# OLD:
self.embed_fn = FastEmbedEmbeddings()

# NEW:
from mcp_server.providers import create_embedding_provider
self.embed_fn = create_embedding_provider(self._load_yaml_config())
```

Note: `_load_yaml_config()` doesn't exist yet — we'll add it in Task 3. For now, use a temporary fallback:

```python
# Temporary until Task 3 adds YAML config:
try:
    cfg = self._load_yaml_config()
except (FileNotFoundError, AttributeError):
    cfg = {"embedding": {"provider": "fastembed", "model": config.embedding_model, "dimension": config.embedding_dim}}
self.embed_fn = create_embedding_provider(cfg)
```

- [ ] **Step 6: Verify server still starts**

```bash
cd alt-theory-rag && python -c "from mcp_server.server import KnowledgeOrchestrator; print('OK')"
```

Expected: `OK` (may take time for model download on first run)

- [ ] **Step 7: Commit**

```bash
git add alt-theory-rag/mcp_server/providers.py alt-theory-rag/tests/test_providers.py alt-theory-rag/mcp_server/server.py
git commit -m "feat: add pluggable embedding provider with factory function"
```

---

## Task 3: Config to YAML + Model Swap

**Files:**
- Create: `alt-theory-rag/config.yaml`
- Modify: `alt-theory-rag/mcp_server/config.py`
- Modify: `alt-theory-rag/mcp_server/server.py` (remove temp fallback from Task 2)

**Spec ref:** Section 3.1 config.yaml, Section 3.5 domain config, Section 3.7 search params

- [ ] **Step 1: Write config.yaml**

Create `alt-theory-rag/config.yaml`:

```yaml
# Alt Theory RAG — User-editable configuration
# See alt-theory-rag-design.md for full documentation

embedding:
  provider: fastembed
  model: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
  dimension: 384

reranker:
  provider: fastembed
  model: BAAI/bge-reranker-base
  enabled: true

chunking:
  separators:
    - "^##\\s+"
  child_max_size: 800
  child_overlap: 100

metadata:
  fields:
    - name: theory
      required: true
      aliases: [theoryname]
    - name: author
      required: true
    - name: year
      type: int
    - name: type
    - name: title
    - name: topics
      type: list
    - name: environment
      type: list
    - name: population
      type: list
  auto:
    - section_header
    - section_type
    - doc_pair
  fallback:
    source: filename

search:
  default_top_k: 3
  max_top_k: 20
  hybrid_alpha: 0.7

domain:
  active: env-psychology
  documents_path: documents

query_expansions: {}

keyword_routes: {}
```

- [ ] **Step 2: Add YAML loader to config.py**

In `alt-theory-rag/mcp_server/config.py`, add a `load_yaml_config` function at the end (before the global `config` line):

```python
import yaml
from pathlib import Path

def load_yaml_config(config_path: str = None) -> dict:
    """Load configuration from YAML file."""
    if config_path is None:
        config_path = Path(__file__).parent.parent / "config.yaml"
    else:
        config_path = Path(config_path)
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)
```

Add `pyyaml` to requirements.txt if not already present.

- [ ] **Step 3: Wire into server.py, remove temp fallback**

In `alt-theory-rag/mcp_server/server.py`, replace the temporary config loading from Task 2 with:

```python
from mcp_server.config import load_yaml_config
from mcp_server.providers import create_embedding_provider

# In KnowledgeOrchestrator.__init__:
self._yaml_config = load_yaml_config()
self.embed_fn = create_embedding_provider(self._yaml_config)
```

- [ ] **Step 4: Verify server starts with new model**

```bash
cd alt-theory-rag && python -c "
from mcp_server.config import load_yaml_config
cfg = load_yaml_config()
print(f'Model: {cfg[\"embedding\"][\"model\"]}')
print(f'Dim: {cfg[\"embedding\"][\"dimension\"]}')
print(f'Alpha: {cfg[\"search\"][\"hybrid_alpha\"]}')
"
```

Expected:
```
Model: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
Dim: 384
Alpha: 0.7
```

- [ ] **Step 5: Commit**

```bash
git add alt-theory-rag/config.yaml alt-theory-rag/mcp_server/config.py alt-theory-rag/mcp_server/server.py
git commit -m "feat: YAML config with multilingual model and theory-specific settings"
```

---

## Task 4: Parser Pipeline

**Files:**
- Create: `alt-theory-rag/mcp_server/parsers.py`
- Create: `alt-theory-rag/tests/test_parsers.py`
- Modify: `alt-theory-rag/mcp_server/ingestion.py` (Chunk dataclass + wire parsers)

**Spec ref:** Sections 3.2, 3.3

This is the largest task. Parser pipeline = frontmatter + metadata + parent-child chunking.

- [ ] **Step 1: Write failing tests for frontmatter parser**

Create `alt-theory-rag/tests/test_parsers.py`:

```python
"""Tests for document parser pipeline."""
import pytest
from mcp_server.parsers import parse_frontmatter, extract_metadata


class TestParseFrontmatter:
    def test_json_frontmatter_v01(self):
        """Parse JSON frontmatter (v0.1 KB format)."""
        content = '{"theoryname": "art", "author": "Kaplan", "year": 1995}\n\nBody text here.'
        meta, body = parse_frontmatter(content)
        assert meta["theoryname"] == "art"
        assert meta["year"] == 1995
        assert body.strip() == "Body text here."

    def test_yaml_frontmatter_v02(self):
        """Parse YAML frontmatter (v0.2 KB format)."""
        content = "---\ntheory: art\nauthor: Kaplan\nyear: 1995\n---\n\nBody text."
        meta, body = parse_frontmatter(content)
        assert meta["theory"] == "art"
        assert meta["year"] == 1995

    def test_no_frontmatter(self):
        """No frontmatter returns empty dict."""
        content = "Just plain text, no frontmatter at all."
        meta, body = parse_frontmatter(content)
        assert meta == {}
        assert body == content

    def test_malformed_json(self):
        """Malformed JSON falls through gracefully."""
        content = '{"broken": json}\n\nBody.'
        meta, body = parse_frontmatter(content)
        # Should not crash, either parses or returns empty
        assert isinstance(meta, dict)


class TestExtractMetadata:
    def test_alias_mapping(self):
        """v0.1 'theoryname' maps to canonical 'theory' via alias."""
        frontmatter = {"theoryname": "attention_restoration_theory", "author": "Kaplan"}
        field_config = [
            {"name": "theory", "required": True, "aliases": ["theoryname"]},
            {"name": "author", "required": True},
        ]
        result = extract_metadata(frontmatter, field_config)
        assert result["theory"] == "attention_restoration_theory"

    def test_canonical_name_preferred(self):
        """v0.2 'theory' used directly, alias not needed."""
        frontmatter = {"theory": "art", "author": "Kaplan"}
        field_config = [
            {"name": "theory", "required": True, "aliases": ["theoryname"]},
            {"name": "author", "required": True},
        ]
        result = extract_metadata(frontmatter, field_config)
        assert result["theory"] == "art"

    def test_missing_required_field_warning(self):
        """Missing required field gets warning, not crash."""
        frontmatter = {"author": "Kaplan"}
        field_config = [
            {"name": "theory", "required": True, "aliases": ["theoryname"]},
            {"name": "author", "required": True},
        ]
        result = extract_metadata(frontmatter, field_config)
        assert "theory" not in result  # missing, no crash
        assert result["author"] == "Kaplan"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd alt-theory-rag && python -m pytest tests/test_parsers.py -v
```

Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Implement parsers.py**

Create `alt-theory-rag/mcp_server/parsers.py`:

```python
"""Configurable document parser pipeline for Alt Theory RAG.

Handles:
- Dual-format frontmatter (JSON v0.1 + YAML v0.2)
- Metadata extraction with field aliases
- Parent-child chunking with configurable separators
- Filename-based metadata fallback
"""
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Tuple

import yaml


@dataclass
class ParsedDocument:
    """Result of parsing a raw document file."""
    doc_id: str
    content: str           # Body text (after frontmatter removal)
    metadata: Dict[str, Any]
    source_path: str
    filename: str


@dataclass
class ParsedChunk:
    """A single chunk (parent or child) ready for indexing."""
    chunk_id: str
    content: str
    chunk_type: str        # "parent" | "child"
    parent_id: str
    section_header: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


def parse_frontmatter(content: str) -> Tuple[dict, str]:
    """Auto-detect and parse JSON (v0.1) or YAML (v0.2) frontmatter.
    Returns (metadata_dict, body_content).
    """
    # Try JSON frontmatter first (v0.1: { ... } at file start)
    json_match = re.match(r"^\s*\{.*?\}\s*\n", content, re.DOTALL)
    if json_match:
        try:
            metadata = json.loads(json_match.group(0).strip())
            return metadata, content[json_match.end():]
        except json.JSONDecodeError:
            print(f"[WARN] Malformed JSON frontmatter, treating as no frontmatter")

    # Try YAML frontmatter (v0.2: --- delimiters)
    yaml_match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    if yaml_match:
        try:
            metadata = yaml.safe_load(yaml_match.group(1))
            if isinstance(metadata, dict):
                return metadata, content[yaml_match.end():]
        except yaml.YAMLError:
            print(f"[WARN] Malformed YAML frontmatter, treating as no frontmatter")

    # No frontmatter found
    return {}, content


def extract_metadata(frontmatter: dict, field_config: list) -> dict:
    """Normalize metadata: try canonical name first, then aliases.
    Missing required fields get a warning but don't crash.
    """
    result = {}
    for field_def in field_config:
        canonical = field_def["name"]
        aliases = field_def.get("aliases", [])
        for key in [canonical] + aliases:
            if key in frontmatter:
                result[canonical] = frontmatter[key]
                break
        if field_def.get("required") and canonical not in result:
            print(f"[WARN] Required field '{canonical}' missing from frontmatter")
    return result


def parse_filename_fallback(filepath: str) -> dict:
    """Extract metadata from filename as fallback.
    Expected pattern: {theory}-{author}-{year}-{type}.md
    """
    stem = Path(filepath).stem
    parts = stem.split("-")
    if len(parts) >= 4:
        return {
            "theory": parts[0],
            "author": "-".join(parts[1:-2]),
            "year": parts[-2],
            "type": parts[-1],
        }
    print(f"[WARN] Filename '{stem}' doesn't match theory-author-year-type pattern, using stem as theory")
    return {"theory": stem}


def create_parent_child_chunks(
    doc: ParsedDocument,
    separator_patterns: List[str],
    child_max_size: int = 800,
    child_overlap: int = 100,
) -> List[ParsedChunk]:
    """Create 1 parent chunk + N child chunks from a parsed document.

    Parent: chunk_type="parent", content = full document body, metadata = all frontmatter.
    Child: chunk_type="child", content = section text INCLUDING header, metadata = frontmatter + section_header.

    Spec ref: Section 3.2 — parent stores full body after frontmatter removal.
    """
    chunks = []

    # Parent chunk: full document body
    parent = ParsedChunk(
        chunk_id=f"{doc.doc_id}_parent",
        content=doc.content,
        chunk_type="parent",
        parent_id=doc.doc_id,
        section_header="",
        metadata={**doc.metadata, "chunk_type": "parent", "parent_id": doc.doc_id},
    )
    chunks.append(parent)

    # Split body into sections using configured separator(s)
    # Combine all separator patterns with OR
    combined_pattern = "|".join(f"({p})" for p in separator_patterns)
    sections = re.split(f"(?={combined_pattern})", doc.content, flags=re.MULTILINE)
    sections = [s for s in sections if s.strip()]

    if not sections:
        # If no sections found, treat entire body as one child
        sections = [doc.content]

    for i, section in enumerate(sections):
        # Extract section header
        header_match = re.match(r"^(#{1,3}\s+.+|===SECTION===\s*)", section)
        header = header_match.group(0).strip() if header_match else f"section_{i}"

        child = ParsedChunk(
            chunk_id=f"{doc.doc_id}_child_{i}",
            content=section,  # INCLUDES header — spec Section 3.2
            chunk_type="child",
            parent_id=doc.doc_id,
            section_header=header,
            metadata={
                **doc.metadata,
                "chunk_type": "child",
                "parent_id": doc.doc_id,
                "section_header": header,
            },
        )
        chunks.append(child)

    return chunks


def parse_document(filepath: str, config: dict) -> Tuple[ParsedDocument, List[ParsedChunk]]:
    """Full parse pipeline: file → frontmatter → metadata → chunks.

    Data flow: raw file → parse_frontmatter() → (metadata, body)
               → extract_metadata() → normalized metadata
               → create_parent_child_chunks() → 1 parent + N children
    """
    path = Path(filepath)
    raw_content = path.read_text(encoding="utf-8", errors="ignore")

    # Step 1: Parse frontmatter
    frontmatter, body = parse_frontmatter(raw_content)

    # Step 2: Extract & normalize metadata
    field_config = config.get("metadata", {}).get("fields", [])
    metadata = extract_metadata(frontmatter, field_config)

    # Step 2b: Filename fallback if metadata empty
    if not metadata:
        metadata = parse_filename_fallback(filepath)

    metadata["source_file"] = path.name

    # Step 3: Create parsed document
    doc_id = path.stem
    doc = ParsedDocument(
        doc_id=doc_id,
        content=body,
        metadata=metadata,
        source_path=str(path),
        filename=path.name,
    )

    # Step 4: Create parent-child chunks
    separators = config.get("chunking", {}).get("separators", [r"^##\s+"])
    child_max_size = config.get("chunking", {}).get("child_max_size", 800)
    child_overlap = config.get("chunking", {}).get("child_overlap", 100)
    chunks = create_parent_child_chunks(doc, separators, child_max_size, child_overlap)

    return doc, chunks
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd alt-theory-rag && python -m pytest tests/test_parsers.py -v
```

Expected: All tests PASS

- [ ] **Step 5: Add chunk_type/parent_id to ingestion.py Chunk dataclass**

In `alt-theory-rag/mcp_server/ingestion.py`, find the `Chunk` dataclass and add fields:

```python
# Add these fields to the Chunk dataclass:
chunk_type: str = "child"          # "parent" | "child"
parent_id: str = ""                # Links child to parent
section_header: str = ""           # e.g. "## Key Concept: Directed Attention"
```

- [ ] **Step 6: Wire parsers.py into ingestion pipeline**

In `alt-theory-rag/mcp_server/ingestion.py`, the `DocumentParser` class has:
- `parse_file()` → calls `_parse_markdown()` for `.md` files
- `_parse_markdown()` → handles YAML frontmatter via regex (~`re.match(r"^---\n.*?\n---\n", ...)`)
- `_chunk_markdown()` → splits by `##`/`###` headers into flat chunks

**Changes needed**:

a) In `_parse_markdown()`: Replace the YAML-only frontmatter regex with a call to `parse_frontmatter()` from parsers.py:
```python
# OLD (around line 197): manual YAML regex
# NEW:
from mcp_server.parsers import parse_frontmatter
metadata, content = parse_frontmatter(content)
```

b) In `_chunk_markdown()`: Replace with `create_parent_child_chunks()` from parsers.py:
```python
# OLD: flat chunk list from _chunk_markdown()
# NEW:
from mcp_server.parsers import parse_document, create_parent_child_chunks
# After parse_file creates Document, call create_parent_child_chunks() instead of _chunk_markdown()
```

c) The return type changes: instead of returning `List[Chunk]` (flat), return `List[Chunk]` where some have `chunk_type="parent"` and others `chunk_type="child"`. The `_index_document()` method in server.py adds ALL chunks to ChromaDB — this works unchanged since both parents and children are just chunks with different metadata.

**Verify**:
```bash
cd alt-theory-rag && python -c "
from mcp_server.parsers import parse_frontmatter
meta, body = parse_frontmatter('{\"theoryname\": \"art\", \"author\": \"K\"}\n\nBody.')
print(f'meta={meta}, body={body.strip()}')
"
```
Expected: `meta={'theoryname': 'art', 'author': 'K'}, body=Body.`

- [ ] **Step 7: Commit**

```bash
git add alt-theory-rag/mcp_server/parsers.py alt-theory-rag/tests/test_parsers.py alt-theory-rag/mcp_server/ingestion.py
git commit -m "feat: dual-format parser with parent-child chunking and metadata aliases"
```

---

## Task 5: Search with Parent Context

**Files:**
- Modify: `alt-theory-rag/mcp_server/server.py`

**Spec ref:** Section 3.2 (parent context attachment, Method A)

- [ ] **Step 1: Modify search to filter children and attach parents**

In `alt-theory-rag/mcp_server/server.py`, find the `query()` method in `KnowledgeOrchestrator`. Modify the ChromaDB query to:

```python
# 1. Search only child chunks
results = self.collection.query(
    query_embeddings=query_embedding,
    n_results=max_results * 3,  # Fetch more for reranking
    where={"chunk_type": "child"},  # Filter: only children
)

# 2. After ranking, batch-fetch parents
parent_ids = list(set(
    meta.get("parent_id")
    for meta in results["metadatas"][0]
    if meta.get("parent_id")
))
parent_lookup = {}
if parent_ids:
    parents = self.collection.get(ids=parent_ids)
    for i, pid in enumerate(parents["ids"]):
        parent_lookup[pid] = parents["documents"][i]

# 3. Attach parent content to each child result
for i, meta in enumerate(results["metadatas"][0]):
    pid = meta.get("parent_id")
    if pid in parent_lookup:
        results["metadatas"][0][i]["parent_content"] = parent_lookup[pid]
```

- [ ] **Step 2: Add result template formatting (spec Section 3.8)**

In `alt-theory-rag/mcp_server/server.py`, in the `search_knowledge` MCP tool, format results using the Dify-compatible template before returning:

```python
# Build formatted output from search results
def format_results(results):
    """Format results using Dify-compatible template (spec Section 3.8)."""
    formatted = []
    for r in results:
        doc_name = r.get("title") or r.get("source_file", "unknown")
        theory_name = r.get("theory", "unknown")
        content = r.get("content", "")
        formatted.append(f"### doc: {doc_name}\n### theory name: {theory_name}\nquotation: {content}\n---")
    return "\n\n".join(formatted)
```

- [ ] **Step 3: Disable adjacent chunk expansion**

In `alt-theory-rag/mcp_server/server.py`, find the `_expand_with_adjacent_chunks()` method (or similar logic that adds context from neighboring chunks). Comment it out or remove the call in the query pipeline — parent-child context replaces this functionality.

```python
# OLD: results = self._expand_with_adjacent_chunks(results, ...)
# NEW: skip — parent context is now attached via Step 1
```

- [ ] **Step 4: Verify with a manual test**

```bash
cd alt-theory-rag && python -c "
from mcp_server.server import KnowledgeOrchestrator
orch = KnowledgeOrchestrator()
# After indexing, test search
results = orch.query('attention restoration', max_results=3)
for r in results:
    print(f'  [{r.get(\"chunk_type\", \"?\")}] {r.get(\"section_header\", \"?\")}')
    print(f'  parent_content present: {\"parent_content\" in r}')
"
```

Expected: Results show `chunk_type: child` with `parent_content` attached.

- [ ] **Step 5: Commit**

```bash
git add alt-theory-rag/mcp_server/server.py
git commit -m "feat: parent-child search with context attachment via secondary query"
```

---

## Task 6: Core MCP Tools (4 tools)

**Files:**
- Modify: `alt-theory-rag/mcp_server/server.py`

**Spec ref:** Section 4 (Phase 1 tools), Section 3.5 (switch_domain behavior)

- [ ] **Step 1: Keep only 4 MCP tools, remove/comment rest**

In `alt-theory-rag/mcp_server/server.py`, find all `@mcp.tool()` decorated functions (12 total). Comment out all except:
- `search_knowledge` (already modified in Task 5)
- `reindex_documents`
- `list_categories` → rename to `list_domains`
- New: `switch_domain`

- [ ] **Step 2: Implement switch_domain tool**

```python
@mcp.tool()
def switch_domain(domain: str) -> str:
    """Switch active knowledge base domain.
    Validates domain exists, updates config.yaml, triggers reindex.
    """
    import yaml
    config_path = Path(__file__).parent.parent / "config.yaml"
    cfg = yaml.safe_load(config_path.read_text())

    # Validate domain directory exists
    domain_dir = config_path.parent / f"documents-{domain}"
    if not domain_dir.exists():
        return f"Error: Domain '{domain}' not found. Available: {list_domains_internal()}"

    # Update config
    cfg["domain"]["active"] = domain
    config_path.write_text(yaml.dump(cfg, default_flow_style=False))

    # Trigger reindex with new domain
    result = reindex_documents(force=True)
    return f"Switched to domain '{domain}'. {result}"
```

- [ ] **Step 3: Implement list_domains tool**

```python
@mcp.tool()
def list_domains() -> str:
    """List available knowledge base domains."""
    base_dir = Path(__file__).parent.parent
    # Find domain dirs matching documents-* pattern
    domains = [d.name.replace("documents-", "")
               for d in base_dir.iterdir()
               if d.is_dir() and d.name.startswith("documents-")]
    active = orchestrator._yaml_config.get("domain", {}).get("active", "unknown")
    return json.dumps({"active": active, "available": sorted(domains)})
```

- [ ] **Step 4: Verify all 4 tools register**

```bash
cd alt-theory-rag && python -c "
from mcp_server.server import mcp
tools = mcp._tool_manager._tools
print(f'Tool count: {len(tools)}')
for name in sorted(tools.keys()):
    print(f'  - {name}')
"
```

Expected: Exactly 4 tools: `search_knowledge`, `reindex_documents`, `list_domains`, `switch_domain`

- [ ] **Step 5: Commit**

```bash
git add alt-theory-rag/mcp_server/server.py
git commit -m "feat: 4 core MCP tools (search, reindex, list_domains, switch_domain)"
```

---

## Task 7: Search Logging + Config Verification

**Files:**
- Modify: `alt-theory-rag/mcp_server/server.py`
- Modify: `alt-theory-rag/config.yaml` (verify values)

- [ ] **Step 1: Add search logging to search_knowledge**

After the search in `search_knowledge` tool, add:

```python
import json
import time
from datetime import datetime, timezone

# At start of search_knowledge:
start_time = time.time()

# At end, before return:
log_entry = {
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "query": query,
    "top_k": max_results,
    "results": [{"id": r.get("id"), "score": r.get("score"), "theory": r.get("theory", "?")} for r in results],
    "latency_ms": int((time.time() - start_time) * 1000),
}
log_path = Path("data/search_log.jsonl")
log_path.parent.mkdir(exist_ok=True)
with open(log_path, "a", encoding="utf-8") as f:
    f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")
```

- [ ] **Step 2: Verify config values**

```bash
cd alt-theory-rag && python -c "
from mcp_server.config import load_yaml_config
c = load_yaml_config()
assert c['search']['hybrid_alpha'] == 0.7, f'alpha={c[\"search\"][\"hybrid_alpha\"]}'
assert c['search']['default_top_k'] == 3, f'top_k={c[\"search\"][\"default_top_k\"]}'
assert c['embedding']['model'] == 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
print('Config OK')
"
```

Expected: `Config OK`

- [ ] **Step 3: Commit**

```bash
git add alt-theory-rag/mcp_server/server.py
git commit -m "feat: search logging to JSONL + verify config values"
```

---

## Task 8: Integration Test with v0.1 KB Docs

**Files:**
- No code changes — verification only

**Spec ref:** Appendix B (v0.1 format)

- [ ] **Step 1: Copy v0.1 KB docs to documents/**

```bash
cp -r "../resources/Knowledge base docs v0.1/"*.md alt-theory-rag/documents/
```

- [ ] **Step 2: Run reindex**

```bash
cd alt-theory-rag && python -c "
from mcp_server.server import KnowledgeOrchestrator
orch = KnowledgeOrchestrator()
result = orch.index_all(force=True)
print(f'Indexed: {result}')
"
```

- [ ] **Step 3: Verify JSON frontmatter parsed**

```bash
cd alt-theory-rag && python -c "
from mcp_server.server import KnowledgeOrchestrator
orch = KnowledgeOrchestrator()
# Check a few chunks have theory metadata
results = orch.collection.get(limit=5, where={'chunk_type': 'child'})
for meta in results['metadatas'][:3]:
    print(f'theory={meta.get(\"theory\", \"MISSING\")}, author={meta.get(\"author\", \"MISSING\")}')
"
```

Expected: theory and author fields populated (not MISSING)

- [ ] **Step 4: Verify parent-child chunks**

```bash
cd alt-theory-rag && python -c "
from mcp_server.server import KnowledgeOrchestrator
orch = KnowledgeOrchestrator()
parent_count = orch.collection.count(where={'chunk_type': 'parent'})
child_count = orch.collection.count(where={'chunk_type': 'child'})
print(f'Parents: {parent_count}, Children: {child_count}')
assert parent_count > 0, 'No parent chunks!'
assert child_count > parent_count, f'Children ({child_count}) should exceed parents ({parent_count})'
print('Chunk structure OK')
"
```

Expected: Parents > 0, Children > Parents

- [ ] **Step 5: Run test queries**

```bash
cd alt-theory-rag && python -c "
from mcp_server.server import KnowledgeOrchestrator
orch = KnowledgeOrchestrator()

queries = [
    '什么是注意力恢复理论',
    'ART',
    'Kaplan directed attention',
]
for q in queries:
    results = orch.query(q, max_results=3)
    print(f'Q: {q}')
    for r in results[:2]:
        print(f'  → [{r.get(\"section_header\",\"?\")}] score={r.get(\"score\",0):.3f} parent={\"parent_content\" in r}')
    print()
"
```

Expected: Results returned for all 3 queries, parent_content present.

- [ ] **Step 6: Verify search log**

```bash
wc -l alt-theory-rag/data/search_log.jsonl
```

Expected: > 0 lines

- [ ] **Step 7: Commit (documentation only)**

```bash
git add alt-theory-rag/documents/
git commit -m "test: integration test with v0.1 KB docs — all verifications pass"
```
