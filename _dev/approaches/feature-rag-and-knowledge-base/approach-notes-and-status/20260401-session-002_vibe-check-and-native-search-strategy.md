# 20260401-session-002 Vibe-Check + Native Search Strategy

## 背景

Session 001 完成了 RAG server 实现（v0.3-integration）和 bug 修复。按 roadmap，Stage 1b 需要用户 vibe-check 原生搜索能力。本 session 同时处理：vibe-check skill 设计、KB v0.2 转换、CLAUDE.md 更新、战略讨论、agent 回复策略研究。

### 5. CLAUDE.md 更新

- project-status 链接 → 20260324
- Active Approaches 加 feature-rag-and-knowledge-base
- Key Files 加 alt-theory-rag/ 目录
- 新增 RAG Server section（build commands, architecture, design decisions）

### 6. Vibe-check Skill 改进

用户反馈原始 skill 缺失两个关键步骤：
- **子代理测试流程**：创建 test-results 文件夹 → 启动 3 个子代理并行测试 → 收集报告 → 主代理诚实演示
- **主代理诚实演示**：最后一步是主 agent 按 user 要求演示，诚实（结果不理想也如实说）、Follow user

已更新 `vibe-check-native-search/SKILL.md`。

### 7. RAG Vibe-Check Skill 创建

创建了独立的 RAG 系统测试 skill（`vibe-check-rag/`），与 native search skill 分开：
- **SKILL.md**: 前置条件（MCP 接入、KB 文件准备）、测试流程（子代理并行）、评估维度、native 对比基线
- **test-questions.md**: 10 道 RAG 专项测试题（语义匹配、中英混合、parent context、metadata passthrough、排序质量、false positive、深度内容、概念查找、作者聚合、空结果）
- **report-template-v0.1.md**: 子代理报告模板（搜索行为链 + 评分 + tool output）

注意：RAG MCP server 尚未接入 Claude Code，需要用户确认接入方式后再执行测试。

### 8. Agent Response Strategy 研究

子代理研究了 agent.md、8 个 sim-user profiles、vibe-check 结果，产出分析报告。在此基础上，进一步润色整合为 design draft（`docs/20260401-agent-response-strategy-draft.md`），覆盖：

- **Search quality 4 维度**: 必要性（何时搜/不搜）、层级选择（L0-L3+ cost hierarchy）、效率、累积性（ReAct）
- **Response quality 4 维度**: Grounding（基于 KB 而非训练知识）、Synthesis（整合而非粘贴）、Honesty（承认 KB 局限）、Adaptation（按用户类型调整）
- **Cross-cutting 3 维度**: 搜索-回复对齐、渐进揭示（Progressive Disclosure）、概念映射质量（Inductive mode 核心）
- **最难标准**: "知道什么不知道" — KB 边界认知、置信度校准、反向搜索（搜来理解为什么不 fit）
- **Per-user-type search expectations**: 8 个 profile 各自的搜索强度期望表

这是骨架性文档，后续 agent.md 主线设计时回来参考。

## 讨论内容

### 1. Vibe-check Skill 设计

创建了三级渐进式搜索测试 skill（`vibe-check-native-search/`）：

- **Level 1** (Index only): 4 题 — 理论查找、关联推理、作者筛选、年份过滤
- **Level 2** (Native search tools): 6 题，三种子策略：
  - L2A: 关键词 grep（探索性搜索）
  - L2B: 标题/结构 grep（精确查找，文档 TOC）
  - L2C: Filename glob + frontmatter peek（文件定位、元数据查询）
- **Level 3** (Deep read): 4 题 — 概念定义、跨理论比较、跨文献发展脉络

### 2. Vibe-check 结果

14 道题全部 4-5 分。关键发现：

- **L1**: 定位极强（0 轮额外搜索），但无法提供内容细节
- **L2A**: Recall 完美（0 false negatives），precision 弱（false positives 来自正文偶然提及）
- **L2B**: 结构性问题完胜（文档 TOC），但 recall 受标题命名一致性限制（Kaplan 2010 用 "Common Resource Hypothesis" 而非 "Directed Attention"）
- **L2C**: frontmatter peek 高效（limit=15 完美截取），发现 Windows glob bug
- **L3**: 跨理论比较是原生搜索最强场景。估计 chunked retrieval 只能达到 60-80% 质量（隐含理论对话需要完整上下文）。Core 文件仅 ~40 行，上下文消耗极低。

### 3. KB v0.2 转换

另一个 session 完成了 57 个文件的批量转换：
- JSON frontmatter → YAML frontmatter
- `theoryname` → `theory`
- Theory 名规范化（Title Case + 空格，0 下划线残留）
- `theoretical_framework` 类型被 batch 合并为 `core`（需后续 relabel）

Field Spec 记录了 known issues：type relabel、topics 准确性、environment/population 命名不一致。

### 4. 战略方向讨论

**核心结论：Native-first strategy**

用户同意：
1. Native-first（L1 index + L2 grep + L3 Read）作为默认路径
2. RAG 作为 fallback，具体策略待定
3. 投入方向：完善 L1 index metadata、标准化标题命名、优化 agent.md search strategy

**用户否决的建议**：
- 概念→理论反向索引 — 太限制，不如用 metadata
- "一句话核心主张" — 太限制，frontmatter metadata 足够
- Read 前 grep 验证 — 不值得（短文件并行读代价不大）

**用户提出的优化方向**：
- Read budget 策略写在 agent.md（软性 guideline）：≤3 个直接读全文，>3 个先 读前xx行 再精选
- LLM 的 ReAct 意识：知道已读过什么不重读，累积式理解（vs Dify 无状态）

**BM25 评估**：不处理模糊/语义匹配，本质是高级关键词搜索。在 57 文件规模下与 grep 差距不大，大规模（1000+）时更有价值。

**Demo agent 搜索评价**：面对模糊感性问题（"喜欢破旧小吃街"），agent 的搜索行为链是 index → 概念映射 → 并行读 4 文件 → 补充读 1 文件 → 结构化分析。核心能力是 LLM 概念映射（工具无法替代），消耗 ~450 行但合理。

### 5. CLAUDE.md 更新

- project-status 链接 → 20260324
- Active Approaches 加 feature-rag-and-knowledge-base
- Key Files 加 alt-theory-rag/ 目录
- 新增 RAG Server section（build commands, architecture, design decisions）

## 决策摘要

- Native-first strategy 确认
- RAG 不废弃但降低优先级
- 投入方向是 agent.md search strategy 和 index metadata，不是搜索基础设施
- KB v0.2 metadata quality 改善是后续任务
- 三模型协作模式 + 变更分级策略写入持久化 memory
- Agent response strategy draft 写入 docs/，为 agent.md 主线设计提供骨架

## 待办

- RAG MCP server 接入 Claude Code（用户会先确认接入方式）
- 接入后执行 RAG vibe-check（10 道测试题，子代理并行）
- 基于 response strategy draft 开始 agent.md 主线设计（待用户决定时机）
- KB v0.2 metadata quality 改善（topics 一致性、environment/population 标准化、type relabel）

## 人机配合动态

- 用户纠正：概念反向索引和一句话主张方向太限制，metadata 更灵活
- 用户提出 read budget 策略（软性 guideline），比 AI 的硬编码方案更实际
- 用户指出 ReAct 累积理解是 agent 架构优势（vs Dify 无状态），AI 未主动提及此点
- 用户纠正：vibe-check 是 RAG 的 check，不是 native 的；需要独立的 RAG 测试 skill
- **Note 组织成功**：Session 001 的 log 在 ai-logs/（符合 note type 分类），approach note 通过引用而非重写指向它。用户认可"引用而非重写"符合项目原则（"Link 不重复"）。
- **思维链 vs 输出**：用户指出 AI 思维链中有更丰富的内容但未完整输出，要求润色后存档。英文框架 + 中文分析整合。
