# Vibe-Check: RAG System Testing

> Purpose: 测试 Alt Theory RAG MCP server 的检索质量
> Stage: 2a (RAG Retrieval Quality Testing)
> RAG spec: `alt-theory-rag-design.md` (v0.5)
> Report template: `report-template-v0.1.md`

## 前置条件

1. RAG MCP server 已接入 Claude Code（MCP config 配置完成）
2. KB 文件已加载到 `alt-theory-rag/documents/`，已 reindex
3. KB 版本：v0.2（YAML frontmatter，57 files）

### MCP 接入

```json
{
  "mcpServers": {
    "alt-theory-rag": {
      "command": "python",
      "args": ["{absolute-path}/alt-theory-rag/mcp_server/server.py"]
    }
  }
}
```

接入后验证：调用 `search_knowledge` 工具，确认返回结果。

### KB 文件准备

```bash
# 将 KB v0.2 复制到 RAG server 的 documents 目录
cp _dev/approaches/feature-rag-and-knowledge-base/kb-v0.2/*.md alt-theory-rag/documents/
# Reindex
# (通过 MCP 调用 reindex_documents 工具)
```

---

## 测试流程

### Step 1: 创建测试结果文件夹

每次测试创建一个新文件夹：
```
vibe-check-rag/
└── test-results/
    └── {date}_run-{N}/
        ├── T01_semantic-similarity.md
        ├── T02_cross-language.md
        └── ...
```

### Step 2: 子代理并行测试（每次 3 个）

从 `test-questions.md` 选择 3 个测试题，分别启动 3 个子代理并行执行。

**子代理提示词模板**：
```
你是 Alt Theory RAG 系统的测试代理。请执行以下测试：

测试题: {question}
期望行为: {expected_behavior}

使用 search_knowledge 工具搜索，记录完整的搜索过程和决策依据。

完成后，按 report-template-v0.1.md 的格式输出报告到 test-results/{date}_run-{N}/T{NN}_{slug}.md
```

### Step 3: 收集子代理报告

子代理完成后，读取所有报告。注意：
- 不要重新执行测试，直接读报告
- 关注 search_knowledge 的原始返回（tool output）
- 识别 pattern：哪些类型的问题 RAG 表现好/差

### Step 4: 主代理诚实演示

**这是最后一步。** 按 user 要求演示一个具体的搜索场景。

演示规则：
- **诚实**：如果 RAG 返回结果不理想，如实说明
- **对比**：如果用户要求，同时用 native 搜索做同一个问题，对比结果
- **Follow user**：用户可能要求测特定场景、换参数、或追问细节

---

## 测试维度

### 核心维度（必测）

| 维度 | 测试什么 | 评估标准 |
|------|---------|---------|
| Semantic similarity | 同义词/不同表述能否匹配 | "mental recovery in nature" → ART |
| Top-k relevance | 前 3 个结果是否最相关 | 排序合理性 |
| Parent context | parent_content 是否正确附加 | 每个结果都有 parent_content |
| Metadata completeness | 所有 frontmatter 字段是否透传 | topics, author, year 等可见 |
| False positive rate | 不相关结果出现在 top-k | 应该 ≤1/3 |

### 扩展维度（可选）

| 维度 | 测试什么 | 评估标准 |
|------|---------|---------|
| Cross-language | 中英混合查询 | 中文理论名能匹配英文 KB |
| Category filter | 按类型筛选 | type=core 只返回 core |
| Deep content | 需要 parent 全文时 | parent_content 足够完整 |
| Response time | 搜索延迟 | 首次查询 < 10s（含 embedding） |
| Edge cases | 空结果、拼写错误 | graceful degradation |

---

## 对比基线

使用 native search vibe-check 的结果（`vibe-check-native-search/test-results/`）作为对比基线。同一道题如果 native 和 RAG 都测过，可以直接对比 accuracy、completeness 和 context consumption。
