# Design Review Prompt — Alt Theory RAG System v0.2

> For use by another AI session to review the design document.
> Version: v0.2 | Date: 2026-03-31
> Changes from v0.1: aligns with design doc v0.2, adds confirmed decisions context, adds unified search dimension, updates open questions

---

## Review Context

You are reviewing a technical design document for "Alt Theory RAG" — a custom RAG (Retrieval-Augmented Generation) system for an AI cognitive mentor focused on environmental psychology theory.

**Important context**: The designer is a non-programmer domain expert (environmental psychology). The review should assess whether the design is technically sound AND whether it can be implemented/maintained by someone without deep software engineering expertise. Flag anything that assumes engineering knowledge the designer may not have.

### Required Reading (in order)

1. **Design document**: `_dev/approaches/feature-rag-and-knowledge-base/alt-theory-rag-design.md` (v0.2)
2. **Fork base source code**: `tmp/knowledge-rag/mcp_server/` — read config.py, ingestion.py, server.py
3. **KB content samples**: `resources/Knowledge base docs v0.1/` — read 2-3 actual documents
4. **Agent context** (optional, for requirements alignment): `agent/agent.md` and `_dev/approaches/migrate-dify-prompts/raw_dify_prompts_v0.4/template-transform.md`

Read all of 1-3 before starting the review. Item 4 is optional if you need more context on how the agent uses retrieved knowledge.

---

## Confirmed Decisions (DO NOT re-debate these)

These decisions are already made. The reviewer should NOT suggest alternatives or question them — focus on whether the implementation approach is sound given these constraints.

| Decision | Rationale |
|----------|-----------|
| Fork knowledge-rag (not agent-brain) | 3 files, ~700 lines, MCP-native, already has FastEmbed + hybrid search |
| Parent-child chunking is Day 1 | Without it, grep is better than RAG. Non-negotiable. |
| Initial embedding: multilingual-e5-large (FastEmbed) | Available now, Chinese+English. Provider abstraction allows future swap. |
| Reranker: bge-reranker-base (MIT license) | jina-reranker-v2 is CC-BY-NC-4.0, unacceptable. |
| Config-driven architecture | User is non-programmer; config.yaml is the interface for customization. |
| KB format v0.2 direction: YAML frontmatter + ## headers | Better for grep + embedding than JSON/===SECTION===. But format is NOT coupled to RAG. |
| PDF links NOT in KB docs (copyright) | Separate sources.yaml file for PDF/DOI mapping. |
| Conservative MCP tool strategy | Keep all 12 tools initially, remove only after testing. Only `add_from_url` is safe to remove immediately. |
| MCP as deployment format | Works with Claude Code, OpenCode, Cursor. Same server, different config files. |
| score_threshold is Phase 2 | Not needed in first version. |
| Unified search design scope | Not just RAG — includes Claude Code native grep/read + agent.md search strategy. |

---

## Review Dimensions

### 1. Technical Feasibility of Modifications (核心：改动可行性)

This is the most important dimension. The design proposes modifying an existing working system. Assess each modification:

- Read the actual source code in `tmp/knowledge-rag/mcp_server/`
- For each modification in design doc Section 3 (3.1–3.8), assess:
  - Is the change realistic given the existing code structure?
  - Are there hidden dependencies or coupling that would break?
  - Is the proposed code pattern (e.g., EmbeddingProvider Protocol) the right abstraction level?
  - Will the changes work together, or do they conflict?

**Specific areas to check**:

a. **Embedding provider abstraction (3.1)**: knowledge-rag currently hardcodes FastEmbed. How deeply is FastEmbed coupled into server.py? Can it be cleanly abstracted?

b. **Parent-child chunking (3.2)**: Current ingestion.py does flat chunking. What changes are needed to support parent-child? How does this affect ChromaDB storage (two collection types? metadata filtering?)

c. **Configurable metadata (3.3)**: Current config uses a Python dataclass. Moving to YAML config — is the proposed schema sufficient? Missing fields?

d. **Domain switching (3.5)**: Current system has a single collection. How does multi-domain work with ChromaDB? Is active_domain.txt the right state mechanism?

### 2. Unified Search Architecture (新增：统一搜索设计)

The design explicitly positions this as "not just RAG" but a unified retrieval system. Assess:

- Is the Layer 0-3 progressive disclosure model (theory list → section titles → RAG retrieval → PDF full text) well-defined?
- How should agent.md encode the search strategy? Is the current description (design doc Section 7, Q1) sufficient, or does it need more specificity?
- For <200 markdown documents, does the RAG actually add enough value over native grep to justify the complexity? Be honest.
- Where is the boundary between "use grep" and "use RAG"? Is it clear enough for the agent?

### 3. Config-Driven Design Quality (配置驱动设计质量)

The user will interact with the system primarily through config.yaml. Assess:

- Is the proposed YAML schema (Sections 3.1–3.7) complete? Missing parameters?
- Are the config parameters self-explanatory for a non-programmer?
- Is there a risk of config becoming so complex that it defeats the purpose?
- Edge cases: what happens with invalid config values?

### 4. KB Content & Format Independence (KB内容与格式解耦)

Read 2-3 actual KB documents from `resources/Knowledge base docs v0.1/`. Note the actual format:
- JSON frontmatter (no `---` delimiters, wrapped in `{ }`)
- `===SECTION===` as section separator
- `---` within sections as paragraph breaks
- core + details document pairs

Assess:
- Does the configurable separator approach (regex patterns in config) actually handle the v0.1 format? Test mentally: can `^===SECTION===$` parse the actual files correctly?
- When KB migrates from v0.1 → v0.2 format, does only config need changing (as claimed)?
- Is the metadata extraction flexible enough for both JSON frontmatter (v0.1) and YAML frontmatter (v0.2)?

### 5. Implementation Risk Assessment (实施风险评估)

- What are the riskiest parts of the implementation? Rank by failure probability.
- What should be built and tested FIRST to validate the approach?
- Are there simpler alternatives that achieve 80% of the value with 20% of the effort?
- Any gotchas with ChromaDB + parent-child chunking?

### 6. Gaps & Missing Pieces (遗漏与缺失)

- What's missing from the design that would block implementation?
- What assumptions need validation before coding starts?
- Are there architectural concerns not addressed (error handling, logging, testing strategy)?
- Is the file structure (Section 5) complete?

---

## Output Format

Structure your review as:

1. **Overall Assessment** (2-3 sentences): Is this design ready for implementation? What's the biggest risk?

2. **Critical Issues** (MUST fix before implementation):
   - Number each issue
   - For each: what's wrong, why it matters, suggested fix

3. **Important Concerns** (SHOULD address, not blockers):
   - Number each concern
   - For each: what's the concern, potential impact, suggested approach

4. **Suggestions** (nice-to-have):
   - Brief, actionable suggestions

5. **Answers to Open Questions** (from design doc Section 7):
   - Q1–Q5: give your perspective on each

6. **Implementation Priority** (recommended build order):
   - What to build first to validate the approach
   - What can be deferred

Keep the review **concise and actionable**. Focus on substance over form. Prioritize concrete problems over theoretical concerns.

---

## Open Questions from Designer (design doc Section 7, Q1–Q5)

These are unresolved questions — the reviewer should provide their perspective:

**Q1: Unified search architecture details**
How should agent.md encode search strategy? Specific prompt patterns for progressive disclosure (Level 0-3)?

**Q2: Does Claude Code native search actually beat RAG?**
For <200 markdown documents, what specific retrieval tasks does RAG do better than grep? Is the RAG advantage compressed to just "semantic similarity + BM25 speed"?

**Q3: PDF source mapping format**
Confirm: sources.yaml separate from KB notes? Or another approach?

**Q4: Initial embedding model choice**
multilingual-e5-large (1024D, 2.24GB) vs smaller model first? User has limited disk/memory.

**Q5: KB format transition**
Batch conversion script from v0.1 (JSON + ===SECTION===) to v0.2 (YAML + ## headers)? Or handle both formats in parser?

---

## Reviewer Background Note

This design was created through an iterative process between a domain expert (environmental psychology, non-programmer) and an AI assistant (Claude Code). The design doc was written BY the AI, but all decisions were made BY the human. Keep this in mind when assessing the design's implementability.
