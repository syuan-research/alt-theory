# Alt Theory 用户文档（简体中文）

本目录是面向用户的**简体中文用户文档**，与英文 Helper 文档 corpus 平行（页面结构与链接对齐）。

## 翻译说明

- 正文由 LLM 翻译自英文用户文档源，目标是自然、可阅读的技术中文，而不是机翻腔。
- **应用内 Helper 只读取英文 corpus**（`agent-assets/skills/alt-theory-help/references/docs/`），**不会**读本目录。
- 本树供熟人阅读、离线 PDF，以及不依赖应用内 Helper 的中文查阅。

## 英文源与生成

- 英文权威源：`agent-assets/skills/alt-theory-help/references/docs/`
- 生成/合并：`node scripts/docs-zh-build.mjs`
- 仅 PDF：`node scripts/docs-zh-build.mjs --pdf-only` 或 `npm run docs:zh-pdf`（需要 Pandoc）

页数：41（与英文 corpus 对齐）。
