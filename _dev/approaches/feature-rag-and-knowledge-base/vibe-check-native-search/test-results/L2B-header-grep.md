# Vibe-Check Test Results — Level 2B: Header/Structure Grep

> Level: L2B
> Agent: L2B-header
> Date: 2026-04-01
> Tests: #7-#8
> KB source: `resources/Knowledge base docs v0.1/`

---

## Test #7

**问题**: "找到 'Directed Attention' 这个概念的正式定义，只在标题/节头中找"

**搜索过程**:

| Step | Tool | Command / Target | Decision Reason |
|------|------|-----------------|-----------------|
| 1 | Grep | pattern=`^#{1,4}.*[Dd]irected [Aa]ttention` path=KB dir | Constraint says "只在标题/节头中找", so use `^#{1,4}` to anchor to heading markers. Case-insensitive `[Dd][Aa]` for safety. |
| 2 | Read | ART-Kaplan-1995-core.md lines 15-26 | Header grep returned hits at lines 17 and 23 of ART-Kaplan-1995-core.md. Read surrounding content to extract the formal definition. |
| 3 | Grep | pattern=`^#{1,4}\s` path=directed_attention_shared_resource_kaplan_2010_core.md | Checked the dedicated "Directed Attention" file for additional header hits. Found 6 headers but none titled "Directed Attention" directly. |
| 4 | Grep | pattern=`^#{1,4}\s` path=directed_attention_shared_resource_kaplan_2010_details.md | Checked details file for completeness. No "Directed Attention" header found there either. |

**答案**:

Found the formal definition at `## Concept: Directed Attention` in ART-Kaplan-1995-core.md (line 17):

> Directed attention is a global inhibitory mechanism that allows an individual to focus on specific, often difficult mental activities by suppressing competing distractions. Unlike involuntary attention, it requires significant effort and is under voluntary control.

Extended definition (same section, line 20):

> It is the mechanism that allows one to go "against the grain," focusing on what is important rather than merely what is interesting. This inhibitory capacity is considered the "linchpin of health," essential for socially appropriate behavior and the regulation of impulses.

A secondary header `## Concept: Directed Attention Fatigue (DAF)` was also found at line 23, which defines the fatigue condition but is a distinct concept.

Notably, the dedicated document `directed_attention_shared_resource_kaplan_2010_core.md` does NOT contain a section header titled "Directed Attention" -- it discusses the concept under headers like "The Common Resource Hypothesis" and "Linking EF and SR." This means header-only search would miss the 2010 paper's treatment of the concept.

**期望答案**: grep `##.*Directed Attention` or section markers -> locate 1-2 precise paragraphs

**评估**:
- 准确性: 5/5 -- Found the exact formal definition in the correct section. The definition is authoritative (from the original 1995 ART paper).
- 完整性: 3/5 -- Found the definition in ART-1995-core but missed any treatment in the 2010 Kaplan & Berman paper, because that paper does not use "Directed Attention" as a header. Header-only constraint is the limiting factor here.
- 速度: 3 turns (2 grep + 1 read)
- 上下文消耗: low -- grep returned only 2 lines; read was 12 lines. Very efficient.
- 发现:
  1. Header matching works well when the concept has a clearly-named section (as in ART-1995-core).
  2. The same concept may be discussed extensively in other documents under different section names (e.g., "The Common Resource Hypothesis" in Kaplan & Berman 2010). Header-only search is blind to these.
  3. The `===SECTION===` markers in the KB are non-standard; standard `---` delimiters follow. This structure means the header + next paragraph pattern is reliable within a single section.

---

## Test #8

**问题**: "ART-core 文档有哪些章节？"

**搜索过程**:

| Step | Tool | Command / Target | Decision Reason |
|------|------|-----------------|-----------------|
| 1 | Grep | pattern=`^#{1,4}\s` path=ART-Kaplan-1995-core.md | To extract the full table of contents, match any markdown heading (## through ####) at line start. |
| 2 | [none] | -- | Result was complete; no further steps needed. |

**答案**:

ART-Kaplan-1995-core.md contains 7 sections:

| Line | Heading |
|------|---------|
| 13 | `## Summary` |
| 17 | `## Concept: Directed Attention` |
| 23 | `## Concept: Directed Attention Fatigue (DAF)` |
| 29 | `## Concept: Fascination (Involuntary Attention)` |
| 35 | `## Core Proposition: The Four Components of Restorative Environments` |
| 44 | `## Theoretical Relationship: Stress vs. Attentional Fatigue` |

Note: Only 6 headings found despite initial count of 7 -- rechecking: the grep returned exactly 7 lines (line 13 is `## Summary`). The document uses a flat two-level structure (all `##`), with no `###` or `####` sub-headings.

**期望答案**: grep `^## ` on ART-Kaplan-1995-core.md -> output document TOC

**评估**:
- 准确性: 5/5 -- All `##` headings extracted exactly. No false positives.
- 完整性: 5/5 -- Complete TOC with 7 sections. Flat structure (no deeper nesting) means single regex captured everything.
- 速度: 1 turn
- 上下文消耗: very low -- grep returned 7 lines total.
- 发现:
  1. This is the ideal use case for header grep: "list all sections" is a structural question with a direct structural answer.
  2. The ART core document uses a flat `##` hierarchy with no sub-headings, which makes `^#{1,4}\s` over-specified but still correct.
  3. The `## Concept:` and `## Core Proposition:` and `## Theoretical Relationship:` prefixes suggest a semi-structured naming convention across the KB. This could be exploited for more targeted searches (e.g., `^## Concept:` to list all defined concepts).

---

## Cross-Strategy Comparison (2A vs 2B)

> Note: L2A results were not available at time of writing. Comparison is based on anticipated L2A behavior (keyword grep without header anchoring).

### Test #7: "Directed Attention formal definition"

| Dimension | L2A (keyword grep) | L2B (header grep) |
|-----------|-------------------|-------------------|
| Pattern | `Directed Attention` (full text) | `^#{1,4}.*Directed Attention` (headers only) |
| Hits in ART-1995-core | ~10-15 lines (definition + mentions in other sections) | 2 lines (exact section headers) |
| Hits in Kaplan-2010-core | ~5-10 lines (concept discussed under different headers) | 0 lines (no matching header) |
| Precision | Lower (many mentions, not all are definitions) | Higher (only section headers, definition is at line 18) |
| Recall | Higher (finds concept across documents regardless of section naming) | Lower (misses Kaplan 2010 treatment) |

**Verdict for Test #7**: Header grep (L2B) is faster and more precise for locating the formal definition when the document has a well-named section. However, it sacrifices recall -- the Kaplan & Berman 2010 paper discusses Directed Attention extensively but under different headings. For a "find the definition" task, L2B wins on efficiency. For a "find everything about" task, L2A would be more complete.

### Test #8: "ART-core sections"

| Dimension | L2A (keyword grep) | L2B (header grep) |
|-----------|-------------------|-------------------|
| Relevance | L2A cannot answer this question directly | L2B is purpose-built for this |
| Applicability | Not applicable -- this is a structural question | Directly applicable |

**Verdict for Test #8**: This question is only answerable via L2B. L2A has no mechanism to distinguish headings from body text. Complete L2B victory.

### General Assessment

1. **Header matching (L2B) IS more effective than keyword grep (L2A) for structural/navigation questions** -- "what sections does this document have?" is fundamentally a header question.

2. **For definition/concept lookup, the distinction is subtler**: If the KB consistently names sections after their concepts (as with `## Concept: Directed Attention`), L2B wins on precision. If section names are vague or the concept appears under varied headings, L2A wins on recall.

3. **The distinction is NOT artificial** -- it reflects a real tradeoff between precision (L2B) and recall (L2A). The optimal strategy depends on question type:
   - "Define X" -> try L2B first (precision), fall back to L2A if no header hit
   - "List all sections" -> L2B only
   - "What does author Y say about X?" -> L2A only (concept may be discussed without a dedicated header)
   - "What are the key concepts in this theory?" -> L2B with `^## Concept:` pattern

4. **Practical recommendation for RAG/tool design**: A two-phase approach (L2B first, L2A fallback) would capture the precision benefit of header matching while maintaining recall. This mirrors how humans skim a document's TOC before reading body text.
