# Feature: RAG & Knowledge Base

---
created: 20260331
status: active
---

## 概述

为 Alt Theory 构建知识检索系统。从 spec 设计到 RAG 实现，经过 vibe-check 后调整方向为 native-first strategy。

## 当前版本

- **Spec v0.5**: [alt-theory-rag-design.md](../alt-theory-rag-design.md)
- **RAG 实现**: [alt-theory-rag/](../../../alt-theory-rag/) (v0.3-integration, 64/64 tests pass)
- **KB v0.2**: [kb-v0.2/](../kb-v0.2/) (57 files, YAML frontmatter)
- **Vibe-check**: [vibe-check-native-search/](../vibe-check-native-search/)

## 战略方向 (20260401)

**Native-first strategy** — L1 index + L2 grep + L3 Read 作为默认路径。RAG 作为 fallback，具体策略待定。

投入方向：
- 完善 L1 index（加 metadata 字段：topics, environment, population）
- 标准化 KB 标题命名（消除 header grep recall gap）
- 优化 agent.md search strategy（read budget, ReAct-style 累积理解）

RAG 的不可替代价值：同义词/不同标题的语义匹配（L2B recall gap）。但在当前 57 文件规模下，可由更好的 index + agent strategy 弥补。

## 已解决

- **20260331** Spec v0.1→v0.5，经 3 轮 Opus review 迭代
- **20260331** RAG server 实现（fork knowledge-rag, 8 tasks, 64 tests pass）
- **20260401** Q1 parent_chunk_id bug + Q2 metadata passthrough bug 修复
- **20260401** KB v0.2 转换完成（57 files, JSON→YAML, theoryname→theory）
- **20260401** Vibe-check 完成（14 tests, L1-L3 三级策略验证）
- **20260401** 战略转向：Native-first（基于 vibe-check 数据 + demo 分析）
- **20260401** KB v0.2 Field Spec + known issues 记录（metadata quality 待改善）
- **20260401** CLAUDE.md 更新（RAG 架构、build commands、approach 索引）
- **20260401** .gitignore 白名单模式（`/*` + 逐级 unignore）

## 进行中

- Stage 1b: vibe-check 已完成（原生搜索端），original knowledge-rag RAG 端用户手动
- Stage 3 方向已初步确定（native-first），待 Stage 2a/2b 完成后最终决策

## 待决定

- RAG fallback 的具体触发条件和使用策略
- BM25 在当前规模下的价值评估（可能不需要）
- agent.md search strategy 的具体设计
- KB v0.2 metadata quality 改善（topics 一致性、environment/population 标准化、type relabel）

## KB v0.2 Known Issues

- `type`: theoretical_framework 由于不准确， 决定 batch 合并为 core，需手动 relabel
- `topics`: 准确性和粒度不一，需 domain-expert review
- `environment`/`population`: 命名不一致

详见: [KB-v0.2-Field-Spec.md](../kb-v0.2/KB-v0.2-Field-Spec.md)

## 三模型协作模式

- **Opus-4.6**: Spec reviewer + 设计决策顾问
- **GLM-5.1/GLM-5-turbo**: 分析、协调、代码定位、修复
- **Qwen3.6-plus-preview**: Build agent，执行明确指令

变更分级：小(fix note) / 中(spec update) / 大(Opus review → full cycle)

## 文件结构

```
_dev/approaches/feature-rag-and-knowledge-base/
├── approach-notes-and-status/
├── alt-theory-rag-design.md          # Spec v0.5
├── build-plan.md                     # 实现步骤（已完成）
├── roadmap.md                        # 项目阶段
├── kb-v0.2/                          # KB v0.2 文件 + Field Spec
├── vibe-check-native-search/         # Vibe-check skill + test results
├── design-iterations/                # Opus review 文件
├── docs/                             # Review prompts, test notes, integration notes
└── references/                       # 参考资料

alt-theory-rag/                        # RAG server 代码（git tracked）
```

## 时间线

| 日期 | Session | 文件 |
|------|---------|------|
| 20260331 | session-000 | Spec 迭代 (v0.1→v0.3) |
| 20260331 | session-001 | Spec v0.4 review + build plan |
| 20260401 | session-001 | [Multi-LLM RAG implementation](../../../ai-logs/20260401-session-001_multi-llm-rag-implementation.md) |
| 20260401 | session-002 | [Vibe-check + strategy shift](20260401-session-002_vibe-check-and-native-search-strategy.md) |
