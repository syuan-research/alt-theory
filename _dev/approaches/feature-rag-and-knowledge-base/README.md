# Feature: RAG & Knowledge Base

为 Alt Theory 设计和实现自定义 RAG 系统 + 知识库管理。

## Status
Research & Design phase

## Key Files
- [alt-theory-rag-design.md](alt-theory-rag-design.md) — 技术设计文档（迭代中）
- [design-iterations/](design-iterations/) — 设计审阅和迭代记录

## Approach
基于 [knowledge-rag](https://github.com/lyonzin/knowledge-rag) (MIT) 改造，非从零构建。

## Research Sources
- `tmp/knowledge-rag/` — 本地克隆的 knowledge-rag 项目
- `tmp/agent-brain/` — 本地克隆的 agent-brain 项目（参考模块）
- `resources/Knowledge base docs v0.1/` — KB 内容样本

## Related
- approaches/migrate-dify-prompts/ — Dify → Claude Code 迁移（含原始 RAG 配置）
- approaches/test-env-memory-improvement/ — Note 系统改进（原始设计文档位置）
