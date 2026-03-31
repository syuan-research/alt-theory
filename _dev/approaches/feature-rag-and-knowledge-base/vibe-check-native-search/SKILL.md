# Vibe-Check: Claude Code Native Search

> Purpose: 测试 Claude Code 原生搜索能力 vs KB
> Stage: 1b-i (Native Search Feel)
> KB source: `resources/Knowledge base docs v0.1/`
> RAG 对比: `vibe-check-rag/SKILL.md`

## 使用方法

1. 在 Claude Code 中打开此项目的根目录
2. 把 `level-1-index.md` 的内容粘贴到对话开头，或用 Read 工具加载
3. 按 `test-protocol.md` 的步骤逐级测试
4. 子代理测试流程见下方"子代理测试"部分

---

## 渐进式加载策略（Progressive Disclosure）

核心思路：Claude Code 每次不知道 KB 里有什么，需要分层给信息。

### Level 1: Theory Index（始终加载）

**给 Claude Code 的信息**：完整的理论列表 + 核心元数据（名称、作者、年份、类型、主题）

**作用**：让 Claude Code 知道"地图上有什么"。当用户问 "attention restoration 相关的理论" 时，可以从 index 中匹配，而不是盲搜。

**测试重点**：
- Claude Code 能否正确引用 index 中的理论？
- 能否根据 theory name 找到对应的文件？
- 能否做简单的跨理论关联（如 "ART 和 SRT 的关系"）？

### Level 2: Native Search Tools（三种策略）

> Level 2 测试三种不同的搜索策略，观察哪种真正有用

**2A: 关键词 grep（探索性搜索）**
```
grep -r "affordance" resources/Knowledge\ base\ docs\ v0.1/
```
适合: 不知道答案在哪，广撒网。缺点: 结果多，需要后续筛选。

**2B: 标题/结构 grep（精确查找）**
```
grep "^## " resources/Knowledge\ base\ docs\ v0.1/ART-Kaplan-1995-core.md
grep "##.*Directed Attention" resources/Knowledge\ base\ docs\ v0.1/*.md
```
适合: 知道概念名，直接定位定义段落。Vibe-check 重点: 这个比 2A 真的更有效吗？

**2C: Filename glob + Frontmatter peek**
```
Glob: **/*Privacy*.md
Read: file.md (limit=15)  # 只读 frontmatter
```
适合: 按命名规范快速定位文件，或只看元数据不读正文。

**测试重点**：
- 三种策略各自的表现和适用场景
- 标题匹配 (2B) 是否真的比关键词匹配 (2A) 更高效
- Claude Code 在不知道用哪种策略时会不会自己选对

### Level 3: Full Document Read（深度阅读）

**给 Claude Code 的指令**：Read 工具读取完整文档

**典型操作**：
- 读取某个理论的 core + details
- 基于完整内容回答具体问题（如 "ART 的四个组成部分分别是什么"）
- 跨理论比较（如 "ART 和 SRT 在 stress 的解释上有什么不同"）

**测试重点**：
- Read 后能否准确提取关键概念
- 能否区分 core 和 details 的内容
- 上下文窗口够不够用（多个文档同时读取时）

---

## 评估维度

每次测试后记录：

| 维度 | 评分 (1-5) | 备注 |
|------|-----------|------|
| 准确性 | | 找到的理论/概念是否正确 |
| 完整性 | | 是否遗漏了相关理论 |
| 速度 | | 从提问到答案的交互轮数 |
| 上下文消耗 | | 占了多少 context window |

详细测试问题和评分表见 `test-protocol.md`。

---

## 子代理测试流程

> 子代理在干净上下文中测试，不受主对话干扰。每次 3 个并行。

### Step 1: 创建测试结果文件夹

```
vibe-check-native-search/
└── test-results/
    └── {date}_run-{N}/
        ├── T{NN}_{slug}.md
        └── ...
```

### Step 2: 启动子代理（每次 3 个）

**子代理提示词模板**：
```
你是 Alt Theory 原生搜索的测试代理。请执行以下测试：

测试题: {question}
期望行为: {expected_behavior}

KB 位置: resources/Knowledge base docs v0.1/
Level-1 Index: vibe-check-native-search/level-1-index.md

先用 Read 加载 level-1-index.md，然后按需使用 Grep/Glob/Read 工具搜索。
记录完整的搜索行为链（每一步用了什么工具、为什么、结果是什么）。

完成后，输出报告到 test-results/{date}_run-{N}/T{NN}_{slug}.md
报告格式参考 vibrate-check-rag/report-template-v0.1.md（去掉 RAG 特有字段）
```

### Step 3: 收集报告

子代理完成后，读取所有报告。不要重新执行测试。关注搜索行为链的差异。

### Step 4: 主代理诚实演示

**这是最后一步。** 按 user 要求演示一个具体的搜索场景。

规则：
- **诚实**：如果搜索表现不理想，如实说明
- **Follow user**：用户可能要求测特定场景、换策略、或追问细节
- **Context free**：如果需要，可以在新的对话中演示（干净上下文）
