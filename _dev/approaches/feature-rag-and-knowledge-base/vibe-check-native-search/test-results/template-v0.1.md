# Vibe-Check Test Results — {level_name}

> Level: {level}
> Agent: {agent_name}
> Date: YYYY-MM-DD
> Tests: {test_range}
> KB source: `resources/Knowledge base docs v0.1/`

---

## Test #{n}

**问题**: {question_text}

**搜索过程**:

| Step | Tool | Command / Target | Decision Reason |
|------|------|-----------------|-----------------|
| 1 | [none / Read / Grep / Glob] | ... | Why chose this tool/strategy |
| 2 | ... | ... | ... |

**答案**:
{answer_given}

**期望答案**: {expected_answer}

**评估**:
- 准确性: /5 — {notes}
- 完整性: /5 — {notes}
- 速度: {n} turns
- 上下文消耗: [low / medium / high]
- 发现: {any interesting observations}

---
