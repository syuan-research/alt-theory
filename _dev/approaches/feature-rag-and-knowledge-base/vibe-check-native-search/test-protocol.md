# Vibe-Check Test Protocol

> 在 Claude Code 中测试原生搜索能力。每道题测试后记录评分。

## Setup

```
1. 打开 Claude Code，工作目录: <private-workspace>\llm-theo-v0.2
2. 第一条消息粘贴:
   "Read vibe-check-native-search/level-1-index.md first, then answer my questions about environmental psychology theories."
3. 开始按顺序测试
```

---

## Level 1 Tests (Theory Index 已加载)

> 测试: Claude Code 能否利用 index 准确回答，而不需要额外搜索

| # | 问题 | 期望答案 | 准确 | 完整 | 轮数 | 备注 |
|---|------|---------|------|------|------|------|
| 1 | "What is ART?" | Kaplan 1995, attention restoration, four components | /5 | /5 | | |
| 2 | "哪些理论和 stress 有关？" | SRT, ART, Supportive Design, Transactional Model, Lazarus Emotion | /5 | /5 | | |
| 3 | "Kaplan 提出了哪些理论？" | ART, Directed Attention Shared Resource, Environmental Preference Matrix | /5 | /5 | | |
| 4 | "2010 年以后的理论有哪些？" | Hartig 2021 (collective/relational restoration), Fielding 2016 | /5 | /5 | | |

---

## Level 2 Tests (原生搜索工具 — 三种策略)

> 测试 Claude Code 能否用不同原生工具策略找到 index 没有覆盖的信息

### 2A: 关键词 grep（探索性搜索）

> 场景: 不知道答案在哪，广撒网

| # | 问题 | 期望行为 | 准确 | 完整 | 速度 | 备注 |
|---|------|---------|------|------|------|------|
| 5 | "Which theories mention 'affordance'?" | grep → Heft 的三个理论 | /5 | /5 | | |
| 6 | "找出所有 topics 包含 crowding 的理论" | grep → Stokols crowding model | /5 | /5 | | |

### 2B: 标题/结构 grep（精确查找）

> 场景: 知道概念名，想直接定位到定义段落
> 有用性待验证 — 这和 2A 的区别是什么？标题匹配真的比正文匹配更有效吗？

| # | 问题 | 期望行为 | 准确 | 完整 | 速度 | 备注 |
|---|------|---------|------|------|------|------|
| 7 | "找到 'Directed Attention' 这个概念的正式定义，只在标题/节头中找" | grep `##.*Directed Attention` 或 `===SECTION===` → 精确到 1-2 个段落 | /5 | /5 | | |
| 8 | "ART-core 文档有哪些章节？" | grep `^## ` ART-Kaplan-1995-core.md → 输出文档 TOC | /5 | /5 | | |

### 2C: Filename glob + Frontmatter peek（文件定位）

> 场景: 按命名规范或元数据快速定位文件

| # | 问题 | 期望行为 | 准确 | 完整 | 速度 | 备注 |
|---|------|---------|------|------|------|------|
| 9 | "找到 Privacy Regulation Theory 的文件" | glob `*Privacy*` 或 `*altman*1976*` | /5 | /5 | | |
| 10 | "看 Scannell-Gifford 的 frontmatter，它的 topics 有哪些？不用读全文" | Read(file, limit=15) → 只返回元数据 | /5 | /5 | | |

---

## Level 3 Tests (需要 Read 完整文档)

> 测试: 深度内容提取和跨理论比较

| # | 问题 | 期望行为 | 准确 | 完整 | 速度 | 备注 |
|---|------|---------|------|------|------|------|
| 11 | "ART 的四个恢复成分分别是什么？请给出具体定义" | Read ART core → Being Away, Extent, Fascination, Compatibility | /5 | /5 | | |
| 12 | "ART 和 SRT 对 stress 的解释有什么不同？" | Read 两者 → ART: attention fatigue → stress; SRT: psycho-evolutionary, innate response | /5 | /5 | | |
| 13 | "Place attachment 的三维度框架是什么？和 Lewicka 的 review 有什么关联？" | Read Scannell-Gifford core + Lewicka core | /5 | /5 | | |
| 14 | "Heft 的 ecological approach 如何连接 perception 和 place？" | Read Heft 1997 + Heft 2018 | /5 | /5 | | |

---

## Scoring Guide

- **5**: 完全正确，无遗漏，一步到位
- **4**: 基本正确，有小遗漏或需要 1 次追问
- **3**: 部分正确，遗漏明显，或需要多次追问
- **2**: 方向对但细节错
- **1**: 完全错误或找不到

## Notes Template

每道题测试后记录：
```
Test #N:
- Claude Code 用的工具: [grep / Read / glob / 直接回答]
- 答案质量: [准确/不准确/遗漏]
- 交互轮数: N
- 上下文消耗: [感觉/估算]
- 发现: [任何有意思的观察]
```
