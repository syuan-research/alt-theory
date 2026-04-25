# Alt Theory on PI — Architecture Mapping (TENTATIVE)

---
created: 20260424
status: tentative — 细节未完整讨论
---

> 本文档记录 Alt Theory 各组件在 PI 中的映射位置和实现路径。
> 标记为 tentative：具体方案可能在后续 session 中调整。

## 决策记录

- **20260424**: 选择 PI (pi-coding-agent) 作为 agent runtime
- 原因：开源、轻量、OpenClaw 采用验证、SDK embed 成熟、pi-ai 15+ providers

## 前端

当前阶段：开源、用户自己下载、单用户。

选择：Web UI（pi-web-ui 组件或简单自定义 UI）

- 开发阶段可用 PI TUI 直接测试
- 产品形态用 Web UI（pi-web-ui 提供现成 Web chat 组件）
- 也可用 SDK embed 嵌入到任何 JS/TS 应用

## Agent 层映射

### System Prompt

PI 的 `systemPromptOverride` 注入 agent.md 内容：

```
agent.md 内容
├─ Identity: AI cognitive mentor for environmental psychology
├─ Thinking Mode = Question Classifier (Class 1/2/3)
└─ Style Guidelines
```

### Thinking Mode（Class 1/2/3）

Thinking mode 的当前实现就是 Question Classifier，嵌入 system prompt，不是独立 skill。

- Class 1 (理论检索/理解) → know_theo.md 的指令
- Class 2 (理论修改/创新) → alt_theo.md 的指令
- Class 3 (通用) → general principles

know_theo.md / alt_theo.md / general.md 作为 PI 的 **prompt templates**（`.pi/prompts/`），由 Question Classifier 选择加载。

未来的认知维度 profiles（EP Contextual 等）可能作为 **skills** 在 Class 1/2 下按需加载，但这是后续迭代。

### Skills

`.pi/skills/` — 按需加载（progressive disclosure）

- 当前：暂无必需 skill
- 未来可扩展：communication-style、更细的认知维度 profiles 等

### Tools

PI 内置 `readOnlyTools`（read / grep / find）→ 直接搜索 kb/*.yaml

不需要 RAG server。KB 通过原生搜索访问。

### Extensions

TypeScript modules，用于：
- 上下文注入（读取用户 profile md，按需注入 sys prompt）
- 未来可能的功能（对话分析、用户行为记录等）

## 数据层

### KB（知识库）

```
kb/
├── ep-core/           ← 核心环境心理学理论（YAML）
├── urban/             ← 城市心理等扩展领域
└── xxx/               ← 未来的扩展
```

- KB 切换 = 切换 `cwd` 指向不同 KB 文件夹，或创建新 session with different cwd
- 格式：YAML frontmatter（现有 KB v0.2 格式）
- 搜索：PI 内置 read/grep/find 工具，不依赖 RAG

### Profiles（用户偏好）

```
profiles/
├── default.md         ← 默认用户偏好（注入 sys prompt）
└── {username}.md      ← 用户特定偏好
```

- 本质是 markdown 文件
- Extension 在 session 开始时读取对应 profile，注入 sys prompt
- 包含：用户学术背景、语言偏好、交流风格、已掌握的理论等

### Sessions

PI 原生 tree-structured JSONL：
- 对话持久化、回溯、分支
- `/compact` 对话总结（PI 原生）
- `/export` 对话导出（PI 原生，HTML/JSON）
- `/share` 分享链接

### 项目规则

- `AGENTS.md`（项目根目录）→ 引用 CLAUDE.md，"必读"
- 不编辑 AGENTS.md，保持多 coding agent 通用

## 待决定

- [ ] KB 数据层的具体组织方式（多 KB 文件夹结构、切换 UI）
- [ ] Profile 的具体 schema（哪些字段、怎么读取和注入）
- [ ] 前端具体方案：pi-web-ui 直接用还是自定义简单 UI
- [ ] Extension 的具体实现（profile 注入的时机和方式）
- [ ] 开发环境：先在哪个环境跑通 `01-minimal.ts`
