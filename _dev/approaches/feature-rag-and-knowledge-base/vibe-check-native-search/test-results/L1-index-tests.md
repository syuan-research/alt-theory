# Vibe-Check Test Results -- Level 1: Index Only

> Level: L1
> Agent: L1-index
> Date: 2026-04-01
> Tests: #1-#4

---

## Test #1

**问题**: What is ART?

**搜索过程**:

| Step | Tool | Command / Target | Decision Reason |
|------|------|-----------------|-----------------|
| 1 | Read | level-1-index.md | Single read of the full index. Question asks about a specific theory abbreviation that can be matched directly in the Theory column. |

**答案**: ART stands for Attention Restoration Theory. It was proposed by Stephen Kaplan in 1995. It belongs to the "Attention & Restoration" category. The index lists two files: a core version and a details version. The index does not explicitly state the "four components" but the theory name and category clearly indicate it deals with how certain environments restore attentional capacity.

**期望答案**: Kaplan 1995, attention restoration, four components

**评估**:
- 准确性: 4/5 -- Correctly identified Kaplan 1995 and attention restoration. "Four components" is not explicitly in the index, so the L1 index alone cannot surface this detail. Deduction is for the missing structural detail that would require reading the actual KB file.
- 完整性: 3/5 -- Got author, year, and general topic. Missing the four components (Fascination, Being Away, Extent, Compatibility) because the index is too coarse to include sub-components.
- 速度: 1 turn (single Read of the index)
- 上下文消耗: low (one ~100-line index file)
- 发现: L1 index is excellent for answering "what is X" lookup questions. It fails on any detail deeper than author/year/category. For ART, the four components are arguably the most important content, and the index cannot provide them.

---

## Test #2

**问题**: 哪些理论和 stress 有关？

**搜索过程**:

| Step | Tool | Command / Target | Decision Reason |
|------|------|-----------------|-----------------|
| 1 | (mental scan of index) | level-1-index.md (already in context) | Scan the Theory column and Author field for "stress", "SRT", "Ulrich" (known stress researcher), "Lazarus" (known stress/coping theorist). The word "stress" appears in: (a) Stress Reduction Theory (line 19), (b) Transactional Model of Stress & Coping (line 85). Additional inference needed: Supportive Design by Ulrich (line 21) is closely related to SRT; Lazarus Emotion theory (line 86) is built on stress appraisal foundations. |

**答案**: Based on the index, theories related to stress include:
1. **Stress Reduction Theory (SRT)** -- Roger S. Ulrich et al., 1991
2. **Theory of Supportive Design** -- Roger S. Ulrich, 1991 (same author, adjacent in the Attention & Restoration section)
3. **Transactional Model of Stress & Coping** -- Lazarus & Launier, 1978 (explicitly named "Stress & Coping")
4. **Cognitive-Motivational-Relational Theory of Emotion** -- Richard S. Lazarus, 1991 (same author as #3, built on stress appraisal)
5. **Attention Restoration Theory (ART)** -- Stephen Kaplan, 1995 (in the same category, addresses directed attention fatigue which is closely linked to stress recovery)

**期望答案**: SRT, ART, Supportive Design, Transactional Model, Lazarus Emotion

**评估**:
- 准确性: 5/5 -- All five expected theories identified. The index's structure (grouping by category, author names) enables accurate association.
- 完整性: 5/5 -- Matched all expected answers. Also noted the relationship reasoning (shared authors, shared category).
- 速度: 0 extra turns (answered from the index already in context)
- 上下文消耗: low
- 发现: This question tests associative reasoning across the index, not just keyword matching. The index's categorical grouping (Attention & Restoration section containing SRT, ART, Supportive Design) and author field (Lazarus appearing in two entries) make this feasible. A naive keyword search for "stress" would miss ART, Supportive Design, and Lazarus Emotion -- domain knowledge is required to make the associations.

---

## Test #3

**问题**: Kaplan 提出了哪些理论？

**搜索过程**:

| Step | Tool | Command / Target | Decision Reason |
|------|------|-----------------|-----------------|
| 1 | (mental scan of index) | level-1-index.md (already in context) | Scan the Author column for "Kaplan". Found in three entries spanning two categories. |

**答案**: Theories proposed by Kaplan (from the index):
1. **Attention Restoration Theory (ART)** -- Stephen Kaplan, 1995 (Attention & Restoration category)
2. **Directed Attention as Shared Resource** -- Kaplan & Berman, 2010 (Attention & Restoration category)
3. **Environmental Preference Matrix** -- Stephen Kaplan, 1987 (Place & Environment Perception category)

**期望答案**: ART, Directed Attention Shared Resource, Environmental Preference Matrix

**评估**:
- 准确性: 5/5 -- Exact match to all three expected theories.
- 完整性: 5/5 -- All Kaplan theories in the index identified. Each entry includes year, co-author (Berman), and category context.
- 速度: 0 extra turns (answered from the index already in context)
- 上下文消耗: low
- 发现: Author-based lookup is trivially easy with a tabular index. The Author column provides direct match capability. This is a strength of the L1 index format -- it turns author queries into simple column scans. Note: Kaplan also appears in ART details file (line 16) but that is the same theory, not a separate one.

---

## Test #4

**问题**: 2010 年以后的理论有哪些？

**搜索过程**:

| Step | Tool | Command / Target | Decision Reason |
|------|------|-----------------|-----------------|
| 1 | (mental scan of index) | level-1-index.md (already in context) | Scan the Year column for values > 2010. The index is sorted by category not by year, so this requires scanning every row. |

**答案**: Theories from after 2010 (year > 2010) found in the index:
1. **Perceptual Fluency Theory** -- Joye & van den Berg, 2011
2. **Ecological Approach to Landscape Perception** -- Harry Heft, 2010 (exactly 2010 -- borderline, excluded if strictly "after")
3. **Ecological Approach to Place** -- Harry Heft, 2018
4. **Social Identity Approach to Environment** -- Fielding & Hornsey, 2016
5. **Goal-framing Theory** -- Lindenberg & Steg, 2013
6. **Collective Restoration Theory** -- Terry Hartig, 2021
7. **Relational Restoration Theory** -- Terry Hartig, 2021

Note: Directed Attention as Shared Resource (Kaplan & Berman, 2010) is exactly 2010. If "2010 年以后" means >= 2010, it should be included (making 8 theories). If it means strictly > 2010, it should be excluded (7 theories).

**期望答案**: Hartig 2021 (collective/relational restoration), Fielding 2016

**评估**:
- 准确性: 5/5 -- Both expected answers (Hartig 2021, Fielding 2016) are correctly identified among the results.
- 完整性: 5/5 -- Found all post-2010 theories (7-8 depending on boundary). The expected answer only listed 2, but the index actually contains 7-8 post-2010 entries. The answer is more complete than the expected answer.
- 速度: 0 extra turns (answered from the index already in context)
- 上下文消耗: low
- 发现: The expected answer appears to be a minimal subset. The actual index contains significantly more post-2010 theories than expected (Heft 2018, Joye & van den Berg 2011, Lindenberg & Steg 2013 are all present but not in the expected answer). This suggests either the expected answer was written before the full KB was populated, or it was testing minimal recall. The L1 index makes year-based filtering straightforward via column scanning, though a chronological sort would make it even easier. The current category-based sort requires scanning every row.

---

## Summary

| Metric | Test #1 | Test #2 | Test #3 | Test #4 |
|--------|---------|---------|---------|---------|
| 准确性 | 4/5 | 5/5 | 5/5 | 5/5 |
| 完整性 | 3/5 | 5/5 | 5/5 | 5/5 |
| 速度 (turns) | 1 | 0* | 0* | 0* |
| 上下文消耗 | low | low | low | low |

*0 extra turns = answered from the single initial Read of the index.

### Key Observations

1. **L1 index strengths**: Excellent for lookup-by-name (Test #1), lookup-by-author (Test #3), and categorical/year-based filtering (Test #4). The tabular structure enables systematic scanning.

2. **L1 index weakness**: Cannot answer questions requiring theory content/detail (Test #1's "four components"). The index is a directory, not a knowledge source. For content-level questions, L2 (actual KB file reading) is required.

3. **Associative queries need domain knowledge** (Test #2): The index does not tag theories with keywords like "stress". Finding all stress-related theories requires the agent to know that Ulrich's SRT/Supportive Design, Lazarus's coping models, and Kaplan's ART are all stress-related. A naive keyword search would fail.

4. **Index format matters**: The year column makes temporal filtering possible but the category-based sort order means year queries require full scan. An additional year-sorted view would help.

5. **Ambiguity in Chinese**: "2010 年以后" is ambiguous (>= 2010 vs > 2010). The index itself does not resolve this; the agent must note the ambiguity.
