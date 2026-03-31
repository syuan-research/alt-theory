# Design Review Prompt — Alt Theory RAG System v0.3

> For use by another AI session to review the design document before implementation.
> Version: v0.3 | Date: 2026-03-31
> Purpose: Identify spec gaps that would cause poor implementation. Optionally write build plan.
> Previous reviews: v0.2 review by Opus 4.6 (see design-iterations/20260331-review-response-by-claude-opus-4-6.txt)

---

## Review Context

You are reviewing a technical design document for "Alt Theory RAG" — a custom RAG system for an AI cognitive mentor focused on environmental psychology theory. The design has been through one review round (v0.2 → v0.3) and most architectural decisions are settled.

**This review has a different purpose than the v0.2 review.** The v0.2 review was about architectural soundness. This review is about **implementation readiness**: is the spec detailed enough for a developer (using a less capable model, GLM-5.1) to build it correctly?

**Designer context**: The designer is a non-programmer domain expert. The builder (GLM-5.1) is a capable but detail-sensitive model. More spec detail = better implementation quality.

---

## Required Reading

1. **Design document v0.3**: `_dev/approaches/feature-rag-and-knowledge-base/alt-theory-rag-design.md`
2. **Fork base source code**: `tmp/knowledge-rag/mcp_server/` — read config.py, ingestion.py, server.py
3. **KB content samples**: `resources/Knowledge base docs v0.1/` — read 2-3 actual documents
4. **Previous review response**: `_dev/approaches/feature-rag-and-knowledge-base/design-iterations/20260331-review-response-by-claude-opus-4-6.txt`

Read all of 1-3 before starting. Item 4 provides context on what was already caught.

---

## Confirmed Decisions (DO NOT re-debate)

All decisions from v0.2 review are confirmed. Key ones:

| Decision | Why it's settled |
|----------|-----------------|
| Fork knowledge-rag | 3 files, MCP-native, FastEmbed |
| Parent-child chunking Day 1 | Without it, grep is better |
| paraphrase-multilingual-MiniLM (384D) | Start small, upgrade path exists |
| Single ChromaDB collection + chunk_type metadata | Simpler than dual collection |
| Dual-format parser (JSON v0.1 + YAML v0.2) | No batch conversion needed |
| 4 core MCP tools in Phase 1 | Reduce testing burden |
| Provider interface uses `__call__()` + `name()` | Matches ChromaDB v1.4.0+ |
| bge-reranker-base (MIT) | Chinese support TBD |
| Domain in config.yaml | Simpler than separate file |

---

## Review Task 1: Spec Gap Analysis

For each section of the design doc (3.1–3.8), assess:

**Is this section detailed enough for implementation?**

Rate each section:
- **Ready**: spec is clear, builder can implement directly
- **Needs clarification**: builder would have to guess or make assumptions
- **Missing**: something important is not addressed

For "Needs clarification" and "Missing", explain:
- What specifically is unclear or missing
- What the builder might get wrong without guidance
- What should be added to the spec (be specific, but don't write full pseudocode)

**Focus areas** (known risk points):
- Section 3.2: Parent-child chunking — how exactly does the data flow from document → chunks → ChromaDB → search results?
- Section 3.3: Metadata extraction with aliases — how does the parser map v0.1 "theoryname" to v0.2 "theory"?
- Section 3.1: Provider abstraction — how does the config.yaml `provider` field select which class to instantiate?

**Do NOT over-specify.** Build-time validation is expected and normal. Only flag gaps that would cause the builder to make wrong architectural choices, not minor implementation details. If you're unsure whether something is a spec gap or a build-time decision, lean toward build-time.

---

## Review Task 2: Build Plan (optional but recommended)

If you choose to write a build plan, format it as:

```
Step N: [description]
- Files to modify: [list]
- Current state: [what exists now in knowledge-rag source]
- Target state: [what should exist after modification]
- Key functions/classes affected: [names + line numbers]
- Data flow: [input → transformation → output]
```

**Constraints on the build plan**:
- Keep each step focused on one logical change
- Reference actual function names and line numbers from the source code (you have access to it)
- Do NOT write pseudocode or implementation details — just what changes, not how
- Aim for 8-12 steps total (matching the 11 steps in design doc Section 6)
- The plan should be a guide, not a straightjacket — builder may deviate if justified

**Important**: If at any point you're uncertain about a source code reference, say so rather than guessing. Wrong line numbers are worse than no line numbers.

---

## Output Format

### Part 1: Spec Gap Analysis

For each section (3.1 through 3.8):
```
Section 3.X: [title]
Rating: Ready / Needs clarification / Missing
[If not Ready]:
- Issue: [what's unclear]
- Risk: [what builder might get wrong]
- Suggestion: [what to add to spec]
```

### Part 2: Build Plan (if you write one)

Per-step as described above.

### Part 3: Overall Readiness Assessment

1-2 sentences: Is this spec ready for implementation? What's the biggest remaining risk?

---

## Specific Questions for the Reviewer

1. **search_log.jsonl**: The design proposes logging all search queries and results. Is this useful for Stage 2a testing? Any concerns about log format or performance impact?

2. **Build order**: The design doc's 11 steps in Section 6 — is this the right order? Would you reorder anything?

3. **The provider abstraction (Section 3.1)**: The `__call__()` interface is confirmed for ChromaDB compatibility. But each provider wraps a different library (FastEmbed, FlagEmbedding, API). Is the Protocol sufficient, or does the spec need to address how each provider handles initialization errors, model downloading, etc.?

4. **What did the v0.2 review miss?**: Read the previous review response. Is there anything it got wrong, or anything important it didn't catch that you see now?
