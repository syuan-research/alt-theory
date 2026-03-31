# RAG Test Questions

> 测试 search_knowledge 工具的检索质量。每个测试包含：问题、期望行为、评估重点。

---

## T01: Semantic Similarity（同义词匹配）

**问题**: "What theories explain how natural environments help people recover from mental fatigue?"

**期望行为**: 返回 ART（Attention Restoration Theory）和 SRT（Stress Reduction Theory），可能还有 Supportive Design。不应遗漏 ART。

**评估重点**: RAG 的核心价值 — 语义匹配。问题中没出现 "Attention Restoration" 或 "ART"，embedding 应该能匹配。

---

## T02: Cross-Language（中英混合）

**问题**: "关于注意恢复和环境偏好的理论"

**期望行为**: 返回 ART 和 Environmental Preference Matrix (Kaplan 1987)。

**评估重点**: 中文查询能否匹配英文 KB。paraphrase-multilingual-MiniLM 据称支持多语言。

---

## T03: Parent Context Attachment

**问题**: "What are the four components of Attention Restoration Theory?"

**期望行为**: 结果中包含 parent_content 字段，内容是 ART core 文件的完整文本。child chunk 应该包含 "Four Components" 相关内容。

**评估重点**: parent-child 检索的核心功能。parent_content 必须存在且内容完整。

---

## T04: Metadata Passthrough

**问题**: "Find theories about crowding, published after 1975"

**期望行为**: 返回 Schmidt & Keating 1979（human crowding + personal control）。metadata 中应包含 topics, author, year 等字段。

**评估重点**: Q2 fix 验证 — passthrough + blacklist 是否正确工作。所有 frontmatter 字段应该可见。

---

## T05: Top-K Relevance Ranking

**问题**: "theories about place attachment and environmental perception"

**期望行为**: Top 3 应包含 Place Attachment 相关理论（Scannell-Gifford, Lewicka）和 Ecological Approach (Heft)。排序应相关度优先。

**评估重点**: 混合搜索的排序质量。最相关的结果是否排在前面。

---

## T06: False Positive Check

**问题**: "stress reduction through exercise and physical activity"

**期望行为**: 返回结果应极少或为空。KB 里没有关于 exercise 作为 stress reduction 手段的理论。如果返回 SRT，需要检查是因为 "stress reduction" 的关键词匹配。

**评估重点**: RAG 是否会产生误导性结果。False positive 是 embedding 系统的常见问题。

---

## T07: Deep Content via Parent

**问题**: "How does Hartig's relational restoration theory differ from individual-level restoration theories?"

**期望行为**: 需要读取 RRT 的完整内容才能回答。parent_content 应该提供足够的上下文来比较。

**评估重点**: parent chunk 是否提供了足够的跨理论比较信息。

---

## T08: Specific Concept Lookup

**问题**: "What is 'soft fascination' and how does it relate to attention recovery?"

**期望行为**: 返回 ART 的概念定义（Soft Fascination vs Hard Fascination 的区分）。

**评估重点**: 具体概念定义的检索。应精准命中包含 "Soft Fascination" 的 child chunk。

---

## T09: Author-Based Search

**问题**: "What theories did Stephen Kaplan propose?"

**期望行为**: 返回 ART (1995), Directed Attention Shared Resource (2010, with Berman), Environmental Preference Matrix (1987)。

**评估重点**: 多理论同一作者的聚合能力。metadata passthrough 应显示 author 字段。

---

## T10: Empty Result / Graceful Degradation

**问题**: "What does environmental psychology say about feng shui?"

**期望行为**: 返回空结果或极少结果（KB 中不涉及 feng shui）。Agent 应该诚实说明 KB 中没有相关内容，而不是编造。

**评估重点**: RAG 系统的 graceful degradation — 空结果时 agent 如何处理。
