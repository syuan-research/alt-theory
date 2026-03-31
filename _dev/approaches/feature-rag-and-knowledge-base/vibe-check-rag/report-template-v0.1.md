# Sub-Agent Test Report Template v0.1

> Sub-agent 在测试中按此格式输出报告。在 sub-agent 的提示词中引用此模板。

---

## Test Report: {test_id} — {question_brief}

**Date**: YYYY-MM-DD
**Agent**: {agent_name}
**KB version**: v0.2
**RAG server**: alt-theory-rag v0.3-integration

### Test Question

> {原始问题文本}

### Search Strategy

| Step | Tool | Query/Target | Decision Reason |
|------|------|-------------|-----------------|
| 1 | | | |
| 2 | | | |
| 3 | | | |

### Answer

{agent 给出的回答}

### Evaluation

| Dimension | Score (1-5) | Notes |
|-----------|-------------|-------|
| Accuracy | | |
| Completeness | | |
| Relevance (top-k quality) | | |
| Turns | | |
| Context consumption | | |

### Discoveries

- {任何有趣的观察：parent_content 是否附上、metadata 是否完整、false positive/negative、response time 等}

### Tool Output (Raw)

```
{粘贴 search_knowledge 工具的原始返回，供后续分析}
```
