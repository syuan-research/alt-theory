# Alt Theory on PI — Executable Spec (v0.1-draft)

---
created: 20260425
status: draft — pending opus review
replaces: pi-alt-theory-architecture-tentative.md
---

## 1. 概述

Alt Theory 是一个基于 PI (pi-coding-agent) 的 standalone AI cognitive mentor for environmental psychology。
本 spec 定义从当前 Claude Code prototype 到 PI standalone app 的完整架构映射、数据层设计、前端方案、依赖关系和开发线路。

**核心原则**：
- 所有内容（prompts、KB、profiles、rules）都是文件系统中的文本文件
- Agent 层只做读取和注入，不硬编码业务逻辑
- 三种前端（TUI / pi-web-ui / custom-web-ui）共用同一后端核心，但串行开发

## 2. 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontends (3 variants)                  │
│  ┌──────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ PI TUI   │  │ pi-web-ui server │  │ custom-web-ui    │  │
│  │ (native) │  │ (Node + WS)      │  │ (Node + WS)      │  │
│  └────┬─────┘  └────────┬─────────┘  └────────┬─────────┘  │
└───────┼─────────────────┼─────────────────────┼────────────┘
        │                 │                     │
        └─────────────────┼─────────────────────┘
                          ▼
        ┌─────────────────────────────────────┐
        │      Alt Theory Core (TypeScript)    │
        │  ┌─────────────────────────────────┐ │
        │  │ createAltTheorySession()        │ │
        │  │ - systemPrompt assembly         │ │
        │  │ - profile injection             │ │
        │  │ - KB path binding               │ │
        │  └─────────────────────────────────┘ │
        └─────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │      PI SDK (pi-coding-agent)        │
        │  ┌─────────────────────────────────┐ │
        │  │ createAgentSession()            │ │
        │  │ DefaultResourceLoader           │ │
        │  │ read/grep/find tools            │ │
        │  │ SessionManager (JSONL tree)     │ │
        │  └─────────────────────────────────┘ │
        └─────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   ┌─────────┐    ┌─────────────┐    ┌──────────┐
   │   KB/   │    │  profiles/  │    │ sessions/│
   │  *.md   │    │  *.md       │    │ *.jsonl  │
   └─────────┘    └─────────────┘    └──────────┘
```

## 3. 开发线路与依赖关系

### Phase 1: Core（串行，阻塞一切）

```
[1.1] PI SDK 环境搭建 ──→ [1.2] 跑通 01-minimal.ts
                                │
                                ▼
                    [1.3] Alt Theory Core 抽象层
                    (systemPrompt assembly + profile injection)
                                │
                                ▼
                    [1.4] AGENTS.md 迁移（agent.md → AGENTS.md）
                                │
                                ▼
                    [1.5] Question Classifier 验证
                    (确认 Class 1/2/3 在 PI 中正常工作)
```

**Phase 1 阻塞原因**：Core 层定义了三种前端共享的 `createAltTheorySession()` API。前端只是不同的 UI 包装。

### Phase 2: 数据层（与 Phase 1 后半部分可并行）

```
[2.1] KB 目录结构确定 ──→ [2.2] KB v0.2 YAML → MD 迁移评估
                                      │
                                      ▼
                          [2.3] Profile schema + default.md
                                      │
                                      ▼
                          [2.4] Session 持久化配置
```

**可并行条件**：Phase 2 可以在 Phase 1.3 之后开始（Core 层需要知道 KB 路径和 Profile 路径）。

### Phase 3: 前端（串行，依赖 Phase 1.5）

```
[3A] TUI ──→ [3B] pi-web-ui ──→ [3C] custom-web-ui (仅按需)
(配置即可用)   (Node + WS)         (Node + WS)
     │            │                  │
     ▼            ▼                  ▼
AGENTS.md     Express server     Express server
+ .pi/        + pi-web-ui        + vanilla HTML
配置文件      components         + JS WebSocket
                               client
```

**串行原因**：
- 3B 和 3C 的后端几乎相同（Express + WebSocket + PI SDK），并行意味着后端逻辑写两遍
- WebSocket 协议需要先定义一次，3B/3C 共用
- 3C 仅在 6 月展示前 3B 不满足需求时才启动

**启动时机**：
- 3A（TUI）：Phase 1.5 后立即启动，用于开发验证
- 3B（pi-web-ui）：TUI 验证通过后启动
- 3C（custom-web-ui）：仅按需

### Phase 4: 打包与分发（依赖 Phase 3 完成 + Gemini 研究结果）

```
[4.1] 非技术用户打包方案 ──→ [4.2] 安装器/单exe
          (Tauri / Electron / Bun compile)
```

**阻塞原因**：需要等 Gemini 的研究结果才能确定打包方案。

## 4. 脆弱点与风险

| # | 脆弱点 | 影响 | 缓解策略 |
|---|--------|------|----------|
| 1 | **API Key 配置对非技术用户是门槛** | 用户下载后无法启动 | Phase 4 安装向导内置 OAuth / API key 输入 |
| 2 | **`systemPromptOverride` 会丢失 PI 原生工具说明** | Agent 不会用 read/grep/find | **明确使用 `appendSystemPromptOverride`**，保留 PI 默认内容 |
| 3 | **Profile 注入时机：`before_agent_start` vs `createAgentSession` 时** | 如果每次对话前都重新读取 profile，性能差；如果只在 session 开始时注入，用户切换 profile 需要重启 session | 默认 session 开始时注入；UI 提供"切换 profile"按钮 = 创建新 session |
| 4 | **KB 搜索路径：PI `readOnlyTools` 的 cwd 绑定** | 如果 KB 路径不在 cwd 下，搜索不到 | Core 层 `createAltTheorySession()` 接受 `kbDir` 参数，用 `createReadOnlyTools(kbDir)` 确保工具搜索正确路径 |
| 5 | **pi-web-ui 需要 server-side Node.js** | 官方示例是纯前端，不能访问文件系统 | 必须搭 Express + WebSocket 后端（已有社区方案：Zetaphor 的 Pi Web UI） |
| 6 | **三种前端需要维护三套 UI 代码** | 工作量重复 | Core 层统一，前端只做消息渲染差异；长期看只保留一种 |
| 7 | **Question Classifier 在 PI 中的表现可能与 Claude Code 不同** | Thinking mode 失效 | Phase 1.5 必须做验证测试 |
| 8 | **长 system prompt 的 token 成本** | Profile + AGENTS.md + KB 声明可能很长 | 监控 token 使用；必要时将 know_theo/alt_theo 做成 skill 按需加载（Phase 2 优化） |
| 9 | **PI SDK 版本锁定风险** | 个人项目无 SemVer，breaking change 可能重写 Core | `package.json` 用精确版本，升级前 TUI 验证 |
| 10 | **AGENTS.md 加载时机不确定** | 如果每次 turn 都重新读取，token 成本翻倍 | Phase 1.2 验证：打印完整 system prompt，确认 session 开始时加载一次 |
| 11 | **Windows 文件系统权限** | 安装在 `C:\Program Files\` 下可能无法读取 KB | Phase 4 打包时，assets 放在用户目录（`%APPDATA%` 或 `~/Documents/AltTheory/`） |
| 12 | **Prompt 文件相对路径失效** | `prompts/know_theo.md` 路径依赖 cwd | AGENTS.md 中用绝对路径或环境变量，Core 层注入绝对路径 |

## 5. 文件结构（目标状态）

```
alt-theory-app/
├── core/
│   └── alt-theory-core.ts          # 统一后端：createAltTheorySession()
├── tui/                            # TUI workdir（隔离运行）
│   ├── AGENTS.md                   # PI 原生 TUI 的上下文
│   ├── .pi/
│   │   ├── prompts/                # Prompt templates (/know_theo, /alt_theo)
│   │   ├── skills/                 # Future skills
│   │   └── extensions/             # Profile injection extension
│   └── kb -> ../../assets/kb/      # 符号链接到 KB（隔离）
├── web-server/                     # 3B/3C 共用后端
│   ├── server.ts                   # Express + WebSocket + PI SDK
│   ├── websocket-protocol.ts       # 3B/3C 共用协议定义
│   └── package.json
├── web-ui-pi/                      # 3B: pi-web-ui 前端
│   ├── client/
│   │   └── index.ts                # pi-web-ui 组件入口
│   └── package.json
├── web-ui-custom/                  # 3C: custom-web-ui 前端（仅按需）
│   ├── public/
│   │   └── index.html              # Vanilla HTML + JS
│   └── package.json
└── package.json                    # Root: 共享依赖

assets/                             # 用户可编辑内容（与代码解耦）
├── kb/
│   ├── ep-core/
│   │   └── *.md                    # 理论文件（YAML frontmatter）
│   └── urban/
│       └── *.md
├── profiles/
│   └── default.md                  # 默认用户偏好
└── sessions/                       # PI 原生 JSONL（自动创建）
```

## 6. 关键决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 20260424 | 选择 PI 作为 agent runtime | 开源、轻量、SDK embed 成熟 |
| 20260425 | 三种前端串行（非并行） | 避免后端逻辑写两遍，WebSocket 协议先定义 |
| 20260425 | Profile 为 session 级注入，放 system prompt 最后 | 性能 + prompt caching；切换 profile = 新 session |
| 20260425 | KB 用 `kbDir` 参数绑定 | Core 层统一处理，前端无关 |
| 20260425 | 明确使用 `appendSystemPromptOverride` | 保留 PI 原生工具说明，避免 agent 不会用工具 |
| 20260425 | TUI workdir 隔离 | 避免 PI 加载项目开发文件作为上下文 |
| 20260425 | 非技术用户打包方案待定 | 等 Gemini 研究结果 |

---

## 7. 数据层详细设计

### 7.1 KB（知识库）

**格式**：Markdown with YAML frontmatter（继承现有 KB v0.2）

**文件结构**：
```
kb/
├── ep-core/                        # 环境心理学核心理论
│   ├── privacy_regulation_theory-altman-1976-core.md
│   ├── privacy_regulation_theory-altman-1976-details.md
│   └── ...
├── urban/                          # 城市心理等扩展领域
│   └── ...
└── README.md                       # KB 目录说明（可选）
```

**Schema（YAML frontmatter）**：
```yaml
---
title: "Theory Name"
theory: "Theory Canonical Name"
author: "Author Name"
year: 1976
type: core | details               # core = 理论核心，details = 案例/实证
topics: ["Topic A", "Topic B"]     # 搜索标签
environment: ["Urban", "Domestic"] # 适用环境
population: ["General Public"]     # 适用人群
---
```

**切换机制**：
- Core 层 `createAltTheorySession({ kbDir: "./kb/ep-core" })` 绑定搜索路径
- UI 提供下拉选择：ep-core / urban / none
- 切换 KB = 创建新 session（PI 原生 tree-structured session 支持多 cwd）
- 用户提示词覆盖："请搜索 urban/ 下的理论" → agent 自行调整搜索路径（因 readOnlyTools 绑定的是 kb 根目录，agent 可以用 `find kb/urban/`）

### 7.2 Profiles（用户偏好）

**格式**：Markdown 文件，用户可自由编辑

**文件结构**：
```
profiles/
├── default.md                      # 默认偏好（所有用户继承）
└── {username}.md                   # 用户特定偏好（可选）
```

**Schema（建议内容，不强制）**：
```markdown
# User Profile

## Academic Background
- Field: Environmental Psychology
- Level: Graduate
- Familiar theories: Privacy Regulation, Attention Restoration

## Language Preference
- Primary: English
- Can read: Chinese

## Communication Style
- Prefer: Concise, structured responses
- Avoid: Suggestions without asking, over-generalization

## Known Preferences (可开关)
- [ ] Do not suggest conclusions before I reach them
- [ ] Prefer inductive reasoning over deductive
- [ ] Include epistemological notes when relevant
```

**注入机制**：
- Session 启动时，Core 层读取 profile 文件，拼接到 system prompt 的 `## User Profile` 段
- 顺序固定：Base identity → User Profile → KB declaration → Additional rules
- 切换 profile = 新 session（UI 按钮触发）

### 7.3 Sessions（对话持久化）

**技术**：PI 原生 `SessionManager.create(cwd)` → tree-structured JSONL

**存储路径**：`./sessions/`（与代码解耦，可配置）

**功能**：
- 自动持久化（每条消息追加到 JSONL）
- `/fork` 分支、`/clone` 复制
- `/compact` 自动摘要
- `/export` HTML/JSON 导出
- 无需额外工程

## 8. Agent 层详细设计

### 8.1 System Prompt 拼装顺序（固定，用于 prompt caching）

**决策**：使用 `appendSystemPromptOverride`，保留 PI 原生内容。

```
[Block 1] PI 原生 system prompt（自动注入，含工具说明）
[Block 2] AGENTS.md 内容（Alt Theory identity + workflow + style）
[Block 3] KB 路径声明
[Block 4] Available tools 列表（PI 自动注入）
[Block 5] Skills 名称列表（PI 自动注入，progressive disclosure）
[Block 6] User Profile（放最后，可变内容）
```

**原因**：
- `systemPromptOverride` 会替换掉 PI 原生工具说明，导致 agent 不会用 read/grep/find
- `appendSystemPromptOverride` 安全追加，PI 升级时无需同步更新工具说明
- Profile（可变内容）放在最后，前面的稳定内容可以命中 prompt cache

**替代方案**：Profile 也可作为第一条 user message 注入（非 system prompt），这样 system prompt 完全稳定，但每次对话多一轮 token。当前选择放在 system prompt 最后，因为 profile 是 session 级配置，session 内不变。

**验证项**：Phase 1.2 打印完整 system prompt，确认顺序符合预期，且 PI 原生工具说明存在。

### 8.2 Question Classifier（Thinking Mode）

**当前实现**：嵌入 AGENTS.md 的 system prompt，不是独立 skill。

**在 PI 中的工作方式**：
1. 用户输入消息
2. Agent 根据 system prompt 中的 Classifier 规则自行判断 Class 1/2/3
3. Class 1 → agent 自行用 `read` 工具加载 `prompts/know_theo.md`，然后遵循其协议
4. Class 2 → agent 自行用 `read` 工具加载 `prompts/alt_theo.md`，然后遵循其协议
5. Class 3 → 遵循 General Principles

**AGENTS.md 加载时机**：
- **假设**：PI 在 session 开始时读取一次 AGENTS.md，注入 system prompt
- **待验证**：Phase 1.2 打印完整 system prompt，连续两次对比是否完全一致
- 如果 PI 是每次 turn 都重新读取，token 成本会翻倍，需要考虑缓存策略

**与 Claude Code 的差异**：
- Claude Code 中 agent.md 在对话开始时加载一次
- PI 中 AGENTS.md 假设在 session 开始时加载一次（待验证）
- 行为一致，无需额外工程

### 8.3 Extension：Profile Injector

**文件**：`.pi/extensions/profile-injector.ts`

**职责**：
- 在 `before_agent_start` 事件中读取 `profiles/{active}.md`
- 将内容追加到 system prompt

**伪代码**：
```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "fs";

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const profilePath = ctx.settings.get("alt_theory.profile_path") || "./profiles/default.md";
    if (existsSync(profilePath)) {
      const profile = readFileSync(profilePath, "utf-8");
      return {
        systemPrompt: event.systemPrompt + "\n## User Profile\n" + profile,
      };
    }
  });
}
```

**注意**：如果 Core 层已经在 `createAgentSession` 时通过 `systemPromptOverride` 注入了 profile，Extension 可以省略。二选一即可。

**推荐**：Core 层注入（更可控、顺序固定、易于测试）。Extension 作为未来扩展点保留。

### 8.4 Skills

**当前**：无必需 skill。Question Classifier 和 Thinking Mode 都在 AGENTS.md 中。

**未来扩展**：
- `.pi/skills/communication-style/SKILL.md`
- `.pi/skills/ep-contextual-thinking/SKILL.md`（EP Contextual 3.1分方案）
- PI 的 progressive disclosure 自动管理加载时机

## 9. 前端层详细设计

### 9.1 TUI（PI 原生终端界面）

**实现方式**：配置即可，低代码。

**Workdir 隔离**：
TUI 必须在隔离的 workdir 下运行，避免 PI 加载项目开发文件（如 `_dev/`、`node_modules/`）作为上下文。

```
alt-theory-app/
├── tui/                    # TUI 运行目录（workdir）
│   ├── AGENTS.md           # Alt Theory 的上下文
│   ├── .pi/
│   │   ├── prompts/        # Prompt templates
│   │   ├── skills/         # Future skills
│   │   └── extensions/     # Profile injector
│   └── kb -> ../../assets/kb/     # 符号链接到 KB
```

**使用**：
```bash
# 在 tui/ 目录下运行，workdir 隔离
cd alt-theory-app/tui && pi
```

**配置**：
- `tui/AGENTS.md`：Alt Theory 的上下文
- `tui/.pi/prompts/know_theo.md`：Class 1 的详细协议
- `tui/.pi/prompts/alt_theo.md`：Class 2 的详细协议
- `tui/.pi/extensions/`：可选的 profile injector
- `tui/kb/`：符号链接到 `assets/kb/`，确保 PI 搜索的是 KB 而非项目文件

**优点**：低开发成本，PI 原生功能全部可用（fork/clone/compact/export）
**缺点**：非技术用户不友好，6月展示效果差

### 9.2 pi-web-ui Server（官方组件 + Node.js 后端）

**架构**：
```
Browser (pi-web-ui components: ChatPanel, AgentInterface)
  │  WebSocket
  ▼
Node.js Server (Express + ws)
  │  PI SDK (createAgentSession with Alt Theory Core)
  ▼
File System (kb/, profiles/, sessions/)
```

**技术栈**：
- 后端：Node.js + Express + `ws` + `@mariozechner/pi-coding-agent`
- 前端：`@mariozechner/pi-web-ui`（mini-lit Web Components + Tailwind CSS v4）
- 通信：WebSocket JSON 消息

**关键组件**：
- `ChatPanel`：完整聊天界面（消息流、工具显示、artifacts、附件）
- `AgentInterface`：低级组件，可自定义布局
- `ApiKeyPromptDialog`：API key 输入对话框

**定制点**：
- 在 ChatPanel 上方添加 KB 选择器和 Profile 选择器（dropdown）
- 选择器切换时，后端创建新 session（PI 原生支持）

**参考实现**：Zetaphor 的 Pi Web UI（~1,100 行 TypeScript，Express + WebSocket）

### 9.3 Custom Web UI（自制最简界面）

**架构**：与 pi-web-ui server 相同，但前端不用官方组件，自己写 HTML/CSS/JS。

**技术栈**：
- 后端：Node.js + Express + `ws` + `@mariozechner/pi-coding-agent`（与 9.2 相同）
- 前端：Vanilla HTML + CSS + JS（无框架）
- 通信：WebSocket JSON 消息

**界面**：
- 顶部：KB 选择器（dropdown）+ Profile 选择器（dropdown）+ 模型选择器
- 中间：消息列表（markdown 渲染、代码高亮）
- 底部：输入框 + 发送按钮

**优点**：完全可控，可自由定制 UI（例如添加 theory browser 侧边栏）
**缺点**：需要手动实现消息流、工具显示、流式渲染

### 9.4 三种前端对比

| 维度 | TUI | pi-web-ui | custom-web-ui |
|------|-----|-----------|---------------|
| 开发成本 | 零 | 中（组件现成，需搭后端） | 中（前端从零写） |
| 功能完整性 | 完整（PI 原生） | 高（官方组件） | 中（自己实现） |
| 定制自由度 | 低 | 中 | 高 |
| 非技术用户友好度 | 低 | 高 | 高 |
| 展示效果 | 差 | 好 | 好 |
| 长期维护成本 | 低 | 中（依赖官方更新） | 中 |

**策略**（串行）：
- **Phase 3A（开发阶段）**：TUI（快速迭代，验证 Core 层）
- **Phase 3B（展示阶段）**：pi-web-ui（TUI 验证通过后启动，复用 Zetaphor 的后端实现）
- **Phase 3C（仅按需）**：custom-web-ui（仅在 6 月展示前 pi-web-ui 不满足需求时才启动）

**WebSocket 协议**（3B/3C 共用，需在 Phase 3B 开始前定义）：
```typescript
// 客户端 → 服务器
interface ClientMessage {
  type: "prompt" | "abort" | "switch_kb" | "switch_profile" | "new_session";
  payload: string | { kbDir: string } | { profilePath: string };
}

// 服务器 → 客户端
interface ServerMessage {
  type: "text_delta" | "tool_call" | "tool_result" | "error" | "session_updated";
  payload: any;
}
```

## 10. 配置与环境变量

### 10.1 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ALT_THEORY_KB` | `./kb` | KB 根目录 |
| `ALT_THEORY_PROFILE` | `./profiles/default.md` | 默认 profile 路径 |
| `ALT_THEORY_SESSIONS` | `./sessions` | Session 持久化目录 |
| `ALT_THEORY_READONLY` | `false` | 是否只读模式（生产环境建议 true） |
| `PORT` | `3000` | Web UI 服务器端口 |

### 10.2 配置文件（可选）

**`alt-theory.config.json`**（与代码解耦，用户可编辑）：
```json
{
  "kb": "./kb/ep-core",
  "profile": "./profiles/default.md",
  "sessions": "./sessions",
  "readOnly": true,
  "ui": {
    "port": 3000,
    "theme": "light"
  }
}
```

**加载优先级**：环境变量 > config.json > 默认值

## 11. 测试策略

### 11.1 Phase 1 测试（Core 层）

| 测试项 | 方法 | 通过标准 |
|--------|------|----------|
| PI SDK 安装 | `npm install` + `npx pi --help` | 无报错 |
| 01-minimal.ts | 配置 API key 后运行 | 能回答 "List files" |
| systemPrompt 拼装 | 打印最终 system prompt | 包含 AGENTS.md + profile + KB 声明 |
| Question Classifier | 输入 Class 1/2/3 示例问题 | 正确分类并执行对应行为 |

### 11.2 Phase 2 测试（数据层）

| 测试项 | 方法 | 通过标准 |
|--------|------|----------|
| KB 搜索 | 问 "What is Privacy Regulation Theory?" | 能读到 kb/ep-core/ 下的正确文件 |
| KB 切换 | 选择 urban/ 后问相关问题 | 能搜索到 urban/ 下的文件 |
| Profile 注入 | 加载带 profile 的 session，问 "What's my background?" | Agent 能引用 profile 内容 |

### 11.3 Phase 3 测试（前端）

| 测试项 | 方法 | 通过标准 |
|--------|------|----------|
| TUI 启动 | `pi` in tui/ | 正常进入终端对话 |
| pi-web-ui 启动 | `npm run dev` in pi-web-ui-server/ | 浏览器打开 localhost:3000，能对话 |
| custom-web-ui 启动 | `npm run dev` in custom-web-ui/ | 浏览器打开，能对话 |
| KB/Profile 选择器 | 在 Web UI 中切换 | 切换后新对话使用新配置 |

### 11.4 6月展示前测试

- **Sim User 测试**：复用现有的 sim-users profiles，让 agent 模拟对话
- **Expert Review**：找 2-3 位环境心理学专家试用，收集反馈
- **非技术用户测试**：找 1 位非技术朋友尝试安装和使用

---

## 12. Opus Review 整合记录

**Review 文件**：`opus-review-pi-alt-theory-spec-v0.1.md`

**已采纳的修改**：
1. **前端策略**：并行 → 串行（TUI → pi-web-ui → custom-web-ui 仅按需）
2. **System Prompt**：明确选择 `appendSystemPromptOverride`，保留 PI 原生工具说明
3. **Prompt Caching**：Profile 移到 system prompt 最后（可变内容在后），稳定内容在前可命中缓存
4. **TUI Workdir 隔离**：添加 `tui/kb` 符号链接，避免 PI 加载项目开发文件
5. **新增脆弱点 9-12**：版本锁定、AGENTS.md 加载时机、Windows 权限、路径硬编码
6. **WebSocket 协议**：3B/3C 共用，需在 Phase 3B 开始前定义
7. **文件结构**：合并 3B/3C 后端为 `web-server/`，添加 `websocket-protocol.ts`

**待验证项（Phase 1.2）**：
- PI 的 tools 注入内容是否稳定（打印 system prompt 对比）
- `appendSystemPromptOverride` 的实际效果（顺序是否符合预期）
- AGENTS.md 加载时机（session 开始时一次 vs 每次 turn）

---

*Spec v0.2 — Opus review integrated. Ready for dev handoff.*

