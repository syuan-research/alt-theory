# Alt Theory on PI — Executable Spec (v0.3)

---
created: 20260425
updated: 20260425
status: v0.3 — ready for dev Phase 1
replaces: pi-alt-theory-architecture-tentative.md
---

## 1. 概述

Alt Theory 是一个基于 PI (pi-coding-agent) 的 standalone AI cognitive mentor for environmental psychology。
本 spec 定义从当前 Claude Code prototype 到 PI standalone app 的完整架构映射、数据层设计、前端方案、依赖关系和开发线路。

**核心原则**：
- 所有内容（prompts、KB、profiles、rules）都是文件系统中的文本文件
- Agent 层只做读取和注入，不硬编码业务逻辑
- 三种前端（TUI / pi-web-ui / Electron）共用同一后端核心，但**串行开发**

**Phase 4 打包方案**：Electron + 内嵌 PI SDK（参考 pi-gui 架构的简化版）

---

## 2. 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontends (串行开发)                     │
│  ┌──────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ PI TUI   │  │ pi-web-ui server │  │ Electron Desktop │  │
│  │ (native) │  │ (Node + WS)      │  │ (Phase 4)        │  │
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

---

## 3. 开发线路与依赖关系

### Phase 1: Core（串行，阻塞一切）

```
[1.1] PI SDK 环境搭建 --→ [1.2] 跑通 01-minimal.ts
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

**Phase 1 阻塞原因**：Core 层定义了所有前端共享的 createAltTheorySession() API。

**Phase 1.2 关键验证项**（P0）：
- 打印完整 system prompt，确认 appendSystemPromptOverride 的实际 Block 顺序
- PI 自动注入的 tools 列表位置
- AGENTS.md 加载时机：session 开始时一次 vs 每次 turn
- 连续两次 system prompt 对比，确认是否一致（影响 token 成本）

### Phase 2: 数据层（可与 Phase 1.3-1.4 并行）

**可并行原因**：数据层只依赖路径约定，不依赖 Core 层代码实现。

### Phase 3: 前端（串行，依赖 Phase 1.5）

```
[3A] TUI --→ [3B] pi-web-ui --→ [3C] Electron Desktop (Phase 4)
(配置即可用)   (Node + WS)         (Electron + PI SDK embed)
     |            |                  |
     ▼            ▼                  ▼
AGENTS.md     Express server     Electron Main
+ .pi/        + pi-web-ui        + PI SDK
配置文件      components         + IPC (preload)
```

**串行原因**：
- 3B 后端与 Electron 主进程都 embed PI SDK，逻辑可复用
- WebSocket 协议（3B）和 IPC 协议（Electron）需在 3B 阶段定义
- 3C（Electron）仅在需要桌面分发时才开发；6月展示可用 3B

### Phase 4: 打包与分发（Electron）

**方案**：Electron + 内嵌 PI SDK（参考 pi-gui 架构的简化版）

**参考**：pi-gui (minghinmatthewlam/pi-gui) 使用 Electron 34 + React 19 + Vite，主进程直接 embed PI SDK，通过 preload IPC 与渲染层通信。已 clone 到 _dev/research/pi-gui/。

**Alt Theory 简化版**：
- 不需要 workspaces、多 session UI、catalogs
- 只需要：聊天界面 + KB 选择器 + Profile 选择器 + API key 配置
- Electron 自动处理原生模块（.node 文件打包为应用资源，启动时解压）

---

## 4. 脆弱点与风险（12 项）

| # | 脆弱点 | 影响 | 缓解策略 |
|---|--------|------|----------|
| 1 | API Key 配置对非技术用户是门槛 | 用户下载后无法启动 | Electron 安装向导内置 OAuth / API key 输入 |
| 2 | systemPromptOverride 会丢失 PI 原生工具说明 | Agent 不会用 read/grep/find | 明确使用 appendSystemPromptOverride，保留 PI 默认内容 |
| 3 | Profile 注入时机：session 级 vs turn 级 | 性能 vs 灵活性权衡 | 默认 session 开始时注入；切换 profile = 新 session |
| 4 | KB 搜索路径：PI readOnlyTools 的 cwd 绑定 | 搜索不到 KB | Core 层接受 kbDir 参数，用 createReadOnlyTools(kbDir) |
| 5 | pi-web-ui 需要 server-side Node.js | 官方示例纯前端无文件系统 | 搭 Express + WebSocket 后端（参考 Zetaphor 的 Pi Web UI） |
| 6 | 多种前端维护成本 | 工作量重复 | Core 层统一，前端串行；长期只保留 Electron |
| 7 | Question Classifier 在 PI 中表现可能不同 | Thinking mode 失效 | Phase 1.5 必须验证测试 |
| 8 | 长 system prompt 的 token 成本 | Profile + AGENTS.md 很长 | 监控 token；必要时 know_theo/alt_theo 做成 skill 按需加载 |
| 9 | PI SDK 版本锁定风险 | 无 SemVer，breaking change | package.json 用精确版本，升级前 TUI 验证 |
| 10 | AGENTS.md 加载时机不确定 | 每次 turn 读取则 token 翻倍 | Phase 1.2 验证：打印 system prompt 确认 |
| 11 | Windows 文件系统权限 | C:\Program Files 下无法读 KB | Electron 打包时 assets 放在用户目录（%APPDATA%） |
| 12 | Prompt 文件相对路径失效 | 路径依赖 cwd | AGENTS.md 中用绝对路径，Core 层注入绝对路径 |

---

## 5. 文件结构（目标状态）

```
alt-theory-app/                     # 开发完成后创建，目前不写
├── core/
│   └── alt-theory-core.ts
├── tui/
│   ├── AGENTS.md
│   └── .pi/
│       ├── prompts/
│       ├── skills/
│       └── extensions/
├── web-server/
│   ├── server.ts
│   ├── websocket-protocol.ts
│   └── package.json
├── web-ui-pi/
│   └── client/
│       └── index.ts
└── package.json

assets/                             # 用户可编辑内容
├── kb/
│   ├── ep-core/
│   │   └── *.md
│   └── urban/
│       └── *.md
├── profiles/
│   └── default.md
└── sessions/
```

---

## 6. 关键决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 20260424 | 选择 PI 作为 agent runtime | 开源、轻量、SDK embed 成熟 |
| 20260425 | 三种前端串行（非并行） | 避免后端逻辑写两遍 |
| 20260425 | Profile 为 session 级注入 | 性能 + prompt caching |
| 20260425 | 明确使用 appendSystemPromptOverride | 保留 PI 原生工具说明 |
| 20260425 | Phase 4 打包方案：Electron + 内嵌 PI SDK | 参考 pi-gui；Electron 自动处理原生模块 |
| 20260425 | AGENTS.md 位置：暂时用项目根目录 | 原型阶段够用，不阻塞；TUI workdir 隔离后续处理 |
| 20260425 | **推迟决策**：appendSystemPromptOverride vs AGENTS.md 的 identity 位置 | 顺序不重要，只要一致且不重复；dev 阶段验证后再定 |

---

## 7. Phase 1.2 验证结果记录

**测试时间**：20260425
**测试方法**：PI SDK `createAgentSession()` + `appendSystemPromptOverride`

### 7.1 API Key 配置 ✅

MiniMax API key 有效，可用模型：`minimax/MiniMax-M2.7`

### 7.2 System Prompt Block 顺序 ✅

实测顺序：
```
[Block 1] PI 原生 system prompt（工具说明、Guidelines、Documentation）
[Block 2] appendSystemPromptOverride 追加内容
[Block 3] # Project Context
[Block 4] AGENTS.md（自动加载项目根目录）
[Block 5] Skills 列表
```

**关键发现**：appendSystemPromptOverride 追加在 PI 原生之后、AGENTS.md 之前。

**策略**：不纠结顺序，只要信息完整、不重复、有冲突解决策略（"User instructions override any initial prompts"）。

**推迟决策**：未来可能全部编入 appendSystemPromptOverride（更 robust），也可能继续用 AGENTS.md。不在 Phase 1 阻塞。

### 7.3 AGENTS.md 加载时机 ✅

连续两次创建的 session，system prompt 完全一致（identical: true，长度 11916）。

→ **AGENTS.md 在 session 创建时读取一次，不是每次 turn。**
→ **Prompt caching 可以命中。**

脆弱点 10 已验证，不是风险。

---

## 8. 数据层详细设计

### 8.1 KB（知识库）

**格式**：Markdown with YAML frontmatter（继承现有 KB v0.2）

**Schema**：
```yaml
---
title: "Theory Name"
theory: "Theory Canonical Name"
author: "Author Name"
year: 1976
type: core | details
topics: ["Topic A", "Topic B"]
environment: ["Urban", "Domestic"]
population: ["General Public"]
---
```

**切换机制**：Core 层 createAltTheorySession({ kbDir }) 绑定搜索路径。UI 提供下拉选择。切换 KB = 创建新 session。

### 8.2 Profiles（用户偏好）

**格式**：Markdown 文件，用户可自由编辑

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

**注入机制**：Session 启动时，Core 层读取 profile 文件，拼接到 system prompt 末尾。切换 profile = 新 session。

### 8.3 Sessions（对话持久化）

**技术**：PI 原生 SessionManager.create(cwd) → tree-structured JSONL

**存储路径**：./sessions/

**功能**：自动持久化、/fork 分支、/clone 复制、/compact 摘要、/export HTML/JSON

---

## 9. Agent 层详细设计

### 9.1 System Prompt 策略

**当前方案**（原型阶段）：
- AGENTS.md 放项目根目录，PI 自动加载
- appendSystemPromptOverride 只注入 variable 内容（profile、KB 路径）
- 冲突策略：AGENTS.md 中写明 "User instructions override any initial prompts"

**未来可能调整**：全部编入 appendSystemPromptOverride（更 robust）。推迟决策，不阻塞。

### 9.2 Question Classifier（Thinking Mode）

**当前实现**：嵌入 AGENTS.md 的 system prompt，不是独立 skill。

**在 PI 中的工作方式**：
1. 用户输入消息
2. Agent 根据 system prompt 中的 Classifier 规则自行判断 Class 1/2/3
3. Class 1 → agent 自行用 read 工具加载 prompts/know_theo.md
4. Class 2 → agent 自行用 read 工具加载 prompts/alt_theo.md
5. Class 3 → 遵循 General Principles

### 9.3 Extension：Profile Injector

**文件**：.pi/extensions/profile-injector.ts

**推荐**：Core 层注入（更可控、顺序固定、易于测试）。Extension 作为未来扩展点保留。

### 9.4 Skills

**当前**：无必需 skill。Question Classifier 和 Thinking Mode 都在 AGENTS.md 中。

**未来扩展**：
- .pi/skills/communication-style/SKILL.md
- .pi/skills/ep-contextual-thinking/SKILL.md

---

## 10. 前端层详细设计

### 10.1 TUI（PI 原生终端界面）

**实现方式**：配置即可，低代码。

**注意**：TUI 需在隔离 workdir 下运行，避免 PI 加载项目开发文件。TUI workdir 隔离方案后续处理，不阻塞 Phase 1。

**使用**：
```bash
cd alt-theory-app/tui && pi
```

### 10.2 pi-web-ui Server（官方组件 + Node.js 后端）

**技术栈**：Node.js + Express + ws + @mariozechner/pi-coding-agent

**WebSocket 协议**（待 Phase 3B 开始前定义，参考 Zetaphor 的 Pi Web UI）：
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

### 10.3 Electron Desktop（Phase 4）

**架构**（参考 pi-gui 简化版）：
```
Electron Main Process
  ├─ AppStateStore (状态管理)
  ├─ createAgentSession() (直接 embed PI SDK)
  └─ IPC Handlers
        ↑↓ preload.ts (contextBridge)
Renderer Process (React / HTML)
  ├─ Chat UI
  ├─ KB 选择器
  └─ Profile 选择器
```

**原生模块处理**：Electron 自动将 .node 文件打包为应用资源，启动时解压到临时目录。不需要 Node SEA 的 hack。
Alt Theory 依赖的原生模块：clipboard（来自 pi-coding-agent）。koffi（来自 pi-tui）仅在 TUI 时需要，Electron 形态可排除 pi-tui 包。

### 10.4 三种前端对比

| 维度 | TUI | pi-web-ui | Electron Desktop |
|------|-----|-----------|------------------|
| 开发成本 | 低 | 中 | 中 |
| 功能完整性 | 完整 | 高 | 高 |
| 非技术用户友好度 | 低 | 高 | 高 |
| 展示效果 | 差 | 好 | 好 |
| 原生模块处理 | N/A | 需 Node.js 后端 | Electron 自动处理 |

**策略**：
- Phase 3A（开发阶段）：TUI（快速迭代，验证 Core 层）
- Phase 3B（展示阶段）：pi-web-ui（TUI 验证通过后启动）
- Phase 3C（分发阶段）：Electron（仅桌面分发需要时）

---

## 11. 配置与环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| ALT_THEORY_KB | ./kb | KB 根目录 |
| ALT_THEORY_PROFILE | ./profiles/default.md | 默认 profile 路径 |
| ALT_THEORY_SESSIONS | ./sessions | Session 持久化目录 |
| ALT_THEORY_READONLY | false | 是否只读模式 |
| PORT | 3000 | Web UI 服务器端口 |

---

## 12. 测试策略

### Phase 1 测试

| 测试项 | 方法 | 通过标准 |
|--------|------|----------|
| PI SDK 安装 | npm install + npx pi --help | 无报错 |
| 01-minimal.ts | 配置 API key 后运行 | 能回答 "List files" |
| systemPrompt 拼装 | 打印最终 system prompt | 包含 AGENTS.md + profile + KB 声明 |
| Question Classifier | 输入 Class 1/2/3 示例问题 | 正确分类并执行对应行为 |

### 6月展示前测试

- Sim User 测试：复用现有的 sim-users profiles
- Expert Review：找 2-3 位环境心理学专家试用
- 非技术用户测试：找 1 位非技术朋友尝试安装和使用

---

## 13. 未解决问题与推迟决策

| 问题 | 状态 | 计划 |
|------|------|------|
| TUI workdir 隔离 | 未解决 | Phase 3A 开始时处理 |
| appendSystemPromptOverride vs AGENTS.md 的 identity 位置 | **推迟** | 不阻塞 Phase 1；dev 阶段验证后再定 |
| WebSocket 协议精确定义 | 未解决 | Phase 3B 开始前，参考 Zetaphor 的 Pi Web UI 和 pi-gui 的 IPC 协议 |
| Electron 具体实现细节 | 未解决 | Phase 4 开始时，参考 pi-gui 的 pi-sdk-driver |

---

## 14. Opus Review 整合记录

**Review 文件**：opus-review-pi-alt-theory-spec-v0.1.md, opus-review-pi-alt-theory-spec-v0.2.md

**已采纳的修改**：
1. 前端策略：并行 → 串行
2. System Prompt：明确选择 appendSystemPromptOverride
3. Prompt Caching：Profile 移到 system prompt 最后
4. 新增脆弱点 9-12
5. WebSocket 协议：3B/3C 共用
6. Phase 4 打包方案确定：Electron
7. 删除"等 Gemini 研究结果"

---

*Spec v0.3 — ready for dev handoff.*
