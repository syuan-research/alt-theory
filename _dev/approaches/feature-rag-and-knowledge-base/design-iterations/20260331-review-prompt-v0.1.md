# Design Review Prompt — Alt Theory RAG System

> For use by another AI session to review the design document.
> Date: 2026-03-31

---

## Review Context

You are reviewing a technical design document for "Alt Theory RAG" — a custom RAG (Retrieval-Augmented Generation) system for an AI cognitive mentor focused on environmental psychology theory.

**Design document location**: `_dev/approaches/feature-rag-and-knowledge-base/alt-theory-rag-design.md`

**Base project being forked**: `tmp/knowledge-rag/` (a working MCP-based RAG system, ~700 lines, 3 Python files)

**Knowledge base samples**: `resources/Knowledge base docs v0.1/` (actual KB documents in the domain)

Please read all three before starting the review.

---

## Review Dimensions

### 1. Requirements Alignment (需求契合度)
- Does the design match the actual needs of the Alt Theory agent?
- Check `agent/agent.md` and `_dev/approaches/migrate-dify-prompts/` for agent design context
- Are the search/retrieval requirements correctly captured?
- Is the parent-child chunking design aligned with how the Dify system worked?
- Check `_dev/approaches/migrate-dify-prompts/raw_dify_prompts_v0.4/template-transform.md` for the original retrieval template

### 2. Technical Feasibility (技术可行性)
- Is the fork-from-knowledge-rag approach sound?
- Read the actual source code in `tmp/knowledge-rag/mcp_server/` (config.py, ingestion.py, server.py)
- Can the proposed modifications be made without breaking existing functionality?
- Are there hidden dependencies or coupling issues?
- Is the parent-child chunking implementation realistic given the codebase?

### 3. Architectural Flexibility (架构灵活性)
- Does the design allow easy swapping of embedding models? (e.g., from FastEmbed to FlagEmbedding/BGE-M3, or to online APIs)
- Is the metadata schema configurable without code changes?
- Can chunking strategies be changed without rewriting the pipeline?
- Is the domain-switching mechanism well-designed?
- Are configuration points accessible to a non-developer (YAML, JSON, or simple config files)?

### 4. Knowledge Base Content Integration (KB内容整合)
- Read 2-3 actual KB documents from `resources/Knowledge base docs v0.1/`
- Note: KB docs use JSON frontmatter (not YAML) and `===SECTION===` as section separator
- Does the chunking design correctly handle this actual format?
- Is the metadata extraction from frontmatter correct?
- Does the design account for the fact that KB content itself will be iterated?

### 5. Practical Concerns (实际问题)
- What can go wrong during implementation?
- What are the riskiest parts?
- What should be implemented first to validate the approach?
- Are there simpler alternatives that were not considered?

### 6. Completeness & Gaps (完整性与遗漏)
- What's missing from the design?
- What assumptions need validation?
- What questions should the designer answer before implementation?

---

## Output Format

Please structure your review as:

1. **Summary**: 2-3 sentence overall assessment
2. **Critical Issues**: Things that MUST be fixed before implementation
3. **Important Concerns**: Things that SHOULD be addressed but aren't blockers
4. **Suggestions**: Nice-to-have improvements
5. **Questions for the Designer**: Specific questions that need answers

Keep the review concise and actionable. Focus on substance over form.

---

## Known Open Questions (from designer)

These questions are already identified but unresolved — you may add your own perspective:

1. Embedding model choice: FastEmbed multilingual-e5-large (2.24GB) vs FlagEmbedding BGE-M3 (543MB int8, not in FastEmbed)
2. Custom separator: KB docs use `===SECTION===` — is regex `r"^===SECTION===$"` sufficient?
3. Score threshold: Hard cutoff vs flagged — which is better for the use case?
4. MCP tool removal: Which tools can be safely removed without introducing bugs?
5. Parent-child chunking: Is the proposed two-level hierarchy sufficient, or should it support arbitrary depth?
