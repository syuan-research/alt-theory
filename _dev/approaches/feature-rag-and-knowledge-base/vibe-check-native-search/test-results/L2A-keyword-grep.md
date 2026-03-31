# Vibe-Check Test Results — Level 2A: Keyword Grep

> Level: L2A
> Agent: L2A-grep
> Date: 2026-04-01
> Tests: #5-#6

---

## Test #5

**问题**: "Which theories mention 'affordance'?"

**搜索过程**:

| Step | Tool | Command / Target | Decision Reason |
|------|------|-----------------|-----------------|
| 1 | Grep | pattern="affordance", path=KB, case-insensitive, files_with_matches | Initial broad search for the keyword |
| 2 | Grep | pattern="affordance", path=relational_restoration_theory-hartig-2021-core.md, case-insensitive, content with context | Verify unexpected hit — found single passing mention ("affordances for mutually appreciated activities") |
| 3 | Grep | pattern="affordance", path=ecological_approach_heft_1997_core.md, case-insensitive, content with context | Verify expected hit — affordance is the central pillar of the theory, appearing in topics, core concept section, and throughout |

**答案**:
Grep found 6 files mentioning "affordance":
1. **Ecological Approach to Place** (Heft, 2018) — core + details files (affordance is a core concept)
2. **Ecological Approach to Landscape Perception** (Heft, 2010) — core + details files (affordance is a core concept)
3. **Ecological Approach to Perception** (Heft, 1997) — core file (affordance is THE central pillar)
4. **Relational Restoration Theory** (Hartig, 2021) — core file (single passing mention: "affordances for mutually appreciated activities")

The three Heft theories are the primary matches. Hartig's Relational Restoration Theory is a false positive for "theories about affordance" — it uses the word once in a supporting sentence, not as a theoretical concept.

**期望答案**: Heft's three theories (Ecological Approach to Place, Ecological Approach to Landscape Perception, Ecological Approach to Perception)

**评估**:
- 准确性: 4/5 — Found all 3 expected Heft theories correctly. The 4th hit (Hartig) is a true keyword match but not a "theory about affordance". A grep-only approach cannot distinguish core concept mentions from passing usage without additional inspection.
- 完整性: 5/5 — All three expected Heft theories were found in a single grep call.
- 速度: 3 turns (1 initial search + 2 verification reads)
- 上下文消耗: low — grep returned only file names, verification reads were targeted single-file greps
- 发现:
  - Single grep call with `-i` flag found all expected results immediately.
  - 1 false positive (Hartig 2021) that uses "affordances" in a passing sentence. This is inherent to keyword grep — it cannot distinguish topical relevance from incidental usage.
  - The Heft 1997 file had no separate "details" file in the index, only a core file, which explains why only 5 of 6 files are Heft-related.

---

## Test #6

**问题**: "找出所有 topics 包含 crowding 的理论"

**搜索过程**:

| Step | Tool | Command / Target | Decision Reason |
|------|------|-----------------|-----------------|
| 1 | Grep | pattern="crowding", path=KB, case-insensitive, files_with_matches | Initial broad search for the keyword |
| 2 | Grep | pattern="crowding", path=scannell_gifford_tripartite_framework-scannell-2010-details.md, content with context | Verify unexpected hit — found in a results section about a study mentioning crowding as a perception problem; crowding is not a topic of the PPP framework |
| 3 | Grep | pattern="crowding", path=privacy_regulation_theory_altman_1976_core.md, content with context | Verify unexpected hit — "Crowding/Intrusion" listed as a state of privacy imbalance; crowding is mentioned as a consequence, not as a topic of the theory |

**答案**:
Grep found 6 files mentioning "crowding":
1. **Social-Psychological Model of Crowding** (Stokols, 1972) — core + details files (crowding IS the topic)
2. **Human Crowding & Personal Control** (Schmidt & Keating, 1979) — core + details files (crowding IS the topic)
3. **Scannell & Gifford Tripartite Framework** (Scannell & Gifford, 2010) — details file only (passing mention in a study result about hiker perceptions)
4. **Privacy Regulation Theory** (Altman, 1976) — core file only (crowding listed as a state of privacy imbalance)

Items 1-2 are the true matches where crowding is a core topic. Items 3-4 are false positives for "theories whose topics include crowding" — they mention the word in related but non-topical contexts.

**期望答案**: Stokols crowding model, Schmidt & Keating

**评估**:
- 准确性: 4/5 — Found both expected theories (Stokols, Schmidt & Keating) plus 2 false positives. The false positives are legitimate keyword matches but not theories "about" crowding.
- 完整性: 5/5 — Both expected theories found in a single grep call.
- 速度: 3 turns (1 initial search + 2 verification reads)
- 上下文消耗: low — grep returned only file names, verification reads were targeted
- 发现:
  - The word "crowding" appears in related theories (privacy regulation, place attachment) in peripheral ways, which is expected given that crowding is adjacent to privacy and environmental perception.
  - A pure keyword grep cannot distinguish "crowding as the theory's topic" from "crowding mentioned in passing". To do that, you would need to check the frontmatter `topics` field specifically, which would require a more targeted search like `grep -l '"topics".*crowding'` or reading the YAML headers.
  - The file `human_crowding_personal_control-schmidt-1979-core.md` uses "crowding" in its filename, which means even a filename grep would catch it — useful metadata signal.

---

## Summary

| Dimension | Test #5 (affordance) | Test #6 (crowding) |
|-----------|---------------------|-------------------|
| Accuracy | 4/5 | 4/5 |
| Completeness | 5/5 | 5/5 |
| Turns | 3 | 3 |
| Context cost | low | low |
| False positives | 1 (Hartig) | 2 (Scannell & Gifford, Altman) |
| False negatives | 0 | 0 |

### Key Takeaway

Keyword grep is highly effective for finding theories that mention a concept — completeness is excellent with 0 false negatives across both tests. The main weakness is **precision**: grep cannot distinguish between a theory's core topic and a passing mention. For the KB's structure, a frontmatter-aware search (e.g., `grep -A5 '"topics"' | grep 'crowding'`) would improve precision, but that requires knowing the YAML structure in advance.
