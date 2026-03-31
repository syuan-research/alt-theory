# RAG & Knowledge Base — Project Roadmap

> Date: 2026-03-31
> Status: Stage 1 in progress (spec phase)
> Design doc: [alt-theory-rag-design.md](alt-theory-rag-design.md) (v0.3)

---

## Principles

- **No tech stack attachment** — serve Alt Theory, not any particular technology
- **User decides, AI suggests** — vibe-check before committing to architecture
- **Separate then combine** — test RAG and native search independently before designing hybrid
- **Spec-driven build** — detailed spec → review → build, not build-first-fix-later

---

## Stage 1: Build RAG MCP Server (current)

**Goal**: Working RAG server with parent-child chunking, testable against KB v0.1 docs.

**Sub-steps**:
1. Spec review by Opus 4.6 → identify gaps, optionally write build plan
2. Build: fork knowledge-rag, implement modifications per design doc v0.3
3. Verify: server starts, indexes docs, returns search results

**Spec**: `alt-theory-rag-design.md` v0.3
**Fork base**: `tmp/knowledge-rag/`
**Test data**: `resources/Knowledge base docs v0.1/`

**Output**: Running RAG MCP server + structured search log

**Dependencies on testing**: None. Server is independently testable.
**Design note**: Include search logging (`search_log.jsonl`) for Stage 2a.

---

## Stage 1b: User Vibe-Check (before Stage 2, required)

**Goal**: User feels both tools with their own hands before designing tests.

**Must complete before Stage 2** because results may influence:
- Whether to invest in RAG optimization or native optimization
- KB format decisions (what makes grep work better vs what makes embedding work better)
- Test question design

### Stage 1b-i: Claude Code Native Search Feel

**What**: Use Claude Code with well-structured KB documents + good prompts.
- Progressive disclosure prompts in agent.md (theory list → section titles → full content)
- Well-linked markdown documents (section headers, cross-references)
- This is **document work, no code** — organizing KB structure and prompt design

**User action**: Try finding theories, concepts, cross-theory comparisons using only grep/glob/read.

### Stage 1b-ii: Original knowledge-rag RAG Feel

**What**: Run original knowledge-rag (unmodified) with some KB docs.
- Feel embedding model speed (first load, query latency)
- Feel retrieval quality with default settings (bge-small-en, monolingual)
- This gives a **baseline expectation** for what embedding feels like

**User action**: Ask questions via MCP tools, feel the response speed and relevance.

---

## Stage 2a: RAG Retrieval Quality Testing

**Goal**: Evaluate custom RAG server (from Stage 1) with prepared question sets.

**Method**:
- Prepare simple and difficult questions (domain-specific)
- Evaluate: recall completeness, false positives, response speed
- Iterate: tune parameters, optimize chunking, expand query expansions

**Input**: Custom RAG server + KB v0.1 docs + question sets
**Output**: RAG retrieval quality assessment + tuned parameters

---

## Stage 2b: Claude Code Native Search Testing (parallel with 2a)

**Goal**: Evaluate Claude Code native search with same question sets.

**Method**:
- Same questions as 2a
- Evaluate: same dimensions (recall, false positives, speed)
- Iterate: optimize KB document structure, prompt design

**Input**: KB docs + agent.md prompts + question sets
**Output**: Native search quality assessment + optimized KB format

---

## Decision Point: KB Format

After Stage 2a + 2b results, decide:
- KB document format (v0.2 direction confirmed or adjusted)
- Whether RAG is worth the complexity for this domain/scale
- What to invest in for Stage 3

---

## Stage 3: Final Strategy Design

**Goal**: Design the retrieval architecture that actually ships with Alt Theory.

**Possible outcomes** (no tech stack attachment):
- **Hybrid**: agent.md + RAG + native search, each used where it's best
- **Native-optimized**: good prompts + well-structured docs + maybe BM25, no embedding
- **RAG-optimized**: heavy RAG usage, minimal native search
- **Something else**: whatever serves Alt Theory best

**This stage includes**:
- agent.md search strategy design (progressive disclosure levels)
- KB format finalization
- Overall integration plan
- Final comparative evaluation

---

## What's NOT in this roadmap

- KB content creation (theory documents) — separate workflow
- Agent personality/character design — separate approach
- Dify migration completion — depends on this roadmap's outcome
- BM25 standalone (without embedding) — considered if Stage 3 drops embedding
