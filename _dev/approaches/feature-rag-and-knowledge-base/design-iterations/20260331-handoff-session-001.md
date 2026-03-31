# Handoff Document — Session 001 → Session 002

> Date: 2026-03-31 | Context limit reached, archiving for continuation

---

## What Was Done This Session

1. **Analyzed two RAG projects**:
   - `agent-brain` (agent-brain/) — production-grade, over-engineered for our needs
   - `knowledge-rag` (tmp/knowledge-rag/) — lightweight MCP server, 3 files ~700 lines, chosen as fork base

2. **Researched three topics** (via sub-agents):
   - Embedding models for Chinese-English mixed content
   - MCP protocol compatibility across tools
   - Claude SDK native search + LSP relevance

3. **Wrote initial design doc**: `alt-theory-rag-design.md` (v0.1)

4. **Discovered actual KB content format**: `resources/Knowledge base docs v0.1/`
   - JSON frontmatter (no `---` delimiters)
   - `===SECTION===` as section separator (Dify-specific)
   - core + details document pairs per theory

5. **Researched KB note design** for dual consumers (grep + embedding):
   - Natural markdown with `##` headers beats structured formats for both grep and embedding
   - YAML frontmatter is standard, JSON is not
   - `===SECTION===` is noise for both grep and embedding

---

## Confirmed Decisions

### Fork Strategy
- **Fork knowledge-rag** (NOT agent-brain). Reasons: 3 files, MCP-native, FastEmbed already integrated, minimal modification needed.

### Embedding Models
- **BGE-M3 is best but NOT in FastEmbed** (PR #602 unmerged as of 2026-03)
- **Available in FastEmbed**: `multilingual-e5-large` (1024D, 2.24GB) or `paraphrase-multilingual-MiniLM-L12-v2` (384D, 220MB)
- **Design must allow swapping** embedding providers: FastEmbed ↔ FlagEmbedding ↔ online API
- Architecture must have an **embedding provider abstraction layer**

### KB Note Format (v0.2 direction)
- **YAML frontmatter** (not JSON, not wikilinks — those are future optional)
- **`##` headers** as natural section/chunk boundaries (not `===SECTION===`)
- **Natural prose markdown** — better for both embedding quality (10-15% improvement) and grep
- **PDF linking**: PDFs will be in project directory but **cannot be embedded directly in docs** (copyright). Need a different approach (config file? directory convention?)
- core + details document pairing preserved

### Parent-Child Chunking
- **Day 1 requirement** — not optional. Without it, grep is better than RAG.
- Parent = full document (with metadata)
- Child = each `##` section within the document
- `chunk_separators` must be configurable (regex patterns in config)

### MCP Tool Set
- **Conservative approach**: keep most tools, only remove clearly safe ones later
- `add_from_url` can be removed (no dependency on other parts)
- Others stay until proven safe to remove

### Score Threshold
- **Phase 2 feature** — first version doesn't need it
- Configurable when added: hard cutoff / flagged / parameter

### MCP as Deployment Format
- MCP is the right choice — universal standard, works with Claude Code + OpenCode + Cursor
- Same server, different config files per tool

### Claude Code Native Search
- LSP is irrelevant for markdown/theoretical content
- Claude Code uses ripgrep for search
- Anthropic itself abandoned RAG in Claude Code in favor of agentic search
- **But RAG still valuable for**: semantic similarity, hybrid search ranking, parent-child retrieval

---

## Open Questions (for next session to address)

### Critical Design Questions

**Q1: Unified search architecture**
The design should NOT be "embedding RAG only" but a unified system that includes:
- Claude Code native grep/read for precise search
- MCP RAG server for semantic similarity + hybrid search
- Agent.md with search strategy hints (e.g., "read section titles and metadata first")

The user's insight: "我们要设计的不再是 embedding RAG 而是包括 claude code 读文档一起设计". This reduces external dependency complexity and makes the problem internally discussable.

**Q2: Progressive disclosure levels**
User's analogy:
- Level 0 (pre-loaded in agent prompt): Theory document list (like Claude Code's skill list)
- Level 1 (initial retrieval): Section titles + metadata (lightweight)
- Level 2 (deep retrieval): Full child chunks via RAG
- Level 3 (original source): PDF lookup when specifically needed

How does this map to: agent.md vs agent.md + template + references?

**Q3: Does Claude Code native search actually beat RAG?**
- For <200 markdown documents, native grep may be sufficient for most queries
- RAG advantages: semantic similarity, BM25 + vector hybrid, cross-encoder reranking
- RAG disadvantages: external dependency, setup complexity, embedding model management
- **Question**: What specific retrieval tasks does RAG do better than grep for this domain?
- **Question**: Is the traditional RAG advantage being compressed to just "semantic similarity + BM25 speed"?

**Q4: PDF linking without embedding in docs**
User confirmed: PDFs will be in project directory, but links can't be in documents (copyright concerns for sharing). Options:
- A convention: `papers/` directory with matching filenames
- A config file mapping theory → PDF path
- A `sources.yaml` separate from the notes
- Just a naming convention (ART-Kaplan-1995-core.md → papers/Kaplan-1995.pdf)

**Q5: Embedding provider abstraction design**
How exactly to architect the provider layer so these are all one-config-swap:
- FastEmbed: multilingual-e5-large
- FastEmbed: paraphrase-multilingual-MiniLM
- FlagEmbedding: BGE-M3 (future)
- Online API: OpenAI/SiliconFlow (future)

**Q6: Metadata configurability**
- How to make the ingestion parser configurable without code changes?
- User should be able to edit a config file to change: frontmatter fields, chunk separators, metadata extraction rules
- KB content will iterate — RAG must not be tightly coupled to KB format

**Q7: Domain switching implementation**
- Multiple ChromaDB collections vs multiple data directories?
- switch_domain MCP tool design
- Active domain state persistence

---

## File Locations

| File | Purpose |
|------|---------|
| `_dev/approaches/feature-rag-and-knowledge-base/README.md` | Approach directory readme |
| `_dev/approaches/feature-rag-and-knowledge-base/alt-theory-rag-design.md` | Design doc v0.1 (needs update to v0.2) |
| `_dev/approaches/feature-rag-and-knowledge-base/design-iterations/20260331-review-prompt-v0.1.md` | Review prompt for other AI sessions |
| `_dev/approaches/feature-rag-and-knowledge-base/design-iterations/20260331-kb-content-analysis.md` | KB v0.1 format analysis |
| `tmp/knowledge-rag/` | Cloned knowledge-rag project (fork base) |
| `tmp/agent-brain/` | Cloned agent-brain project (reference only) |
| `resources/Knowledge base docs v0.1/` | Actual KB content samples (30+ theory docs) |

## Research Results (key data points)

### Embedding Models in FastEmbed (as of 2026-03)
| Model | Dim | Size | Languages |
|-------|-----|------|-----------|
| multilingual-e5-large | 1024 | 2.24GB | 100+ |
| paraphrase-multilingual-MiniLM-L12-v2 | 384 | 220MB | 50+ |
| BGE-M3 | 1024 | 543MB(int8) | 100+ (NOT in FastEmbed) |

### Rerankers in FastEmbed
| Model | Size | License |
|-------|------|---------|
| BAAI/bge-reranker-base | 1.04GB | MIT |
| jinaai/jina-reranker-v2-base-multilingual | 1.11GB | CC-BY-NC-4.0 |

### Dify v0.4 Config (for reference)
- Embedding: bce-embedding-base_v1 (SiliconFlow API)
- Search: Hybrid (0.7 vector / 0.3 keyword)
- Top K: 3, Score threshold: 0.5
- Reranking: configured but disabled (Qwen3-Reranker-4B)
- Template: `### doc: {document_name}\n### theory name: {theory_name}\nquotation: {content}`

### MCP Compatibility
MCP works with: Claude Code, OpenCode, Cursor, VS Code Copilot, Windsurf, ChatGPT, Gemini. Standard maintained by Agentic AI Foundation (Linux Foundation). Same server, different config formats per tool.

### Key Anthropic Insight
Anthropic abandoned RAG in Claude Code in favor of agentic search (grep/glob/read). For <500 files, native search works well. RAG value is in semantic similarity and ranking quality.

---

## Next Session TODO

1. Update `alt-theory-rag-design.md` to v0.2 (incorporate all decisions above)
2. Address Q1-Q7 open questions
3. Get design reviewed by another AI session (review prompt ready)
4. Decide on KB note v0.2 format and write a template
5. Decide whether to start with FastEmbed multilingual-e5-large or smaller model
