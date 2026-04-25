# Alt Theory on PI — Executable Spec (v0.4)

---
created: 20260425
updated: 20260425
status: v0.4 — Core verified, ready for full-stack MVP
replaces: pi-alt-theory-architecture-tentative.md
---

## 1. 概述

Alt Theory 是一个基于 PI (pi-coding-agent) 的 standalone AI cognitive mentor for environmental psychology。

**当前阶段**：Phase 1 Core 层已验证通过，进入 **Phase 3 全栈 MVP 开发**（前后端通信）。

**核心意图**：先搞前后端通信，确定全栈 MVP "技术上可实现"。

**已知局限（不阻塞工程）**：
- KB 内容未导入（数据层问题，和工程解耦）
- Prompt v0.6 有占位符（`<context>[Insert retrieved KB results]</context>`），未适配 PI 的检索机制
- Class 2（alt_theo）未测试（需要 KB 数据才有意义）

以上问题归入 **thinking mode 开发和搜索策略**，由用户主导更新。工程部分（前后端通信）不依赖这些问题解决。

---

## 2. Phase 1 验证结果（完整记录）

### 2.1 Core 层 API 验证

**测试脚本**：`alt-theory-app/core/test-core.ts`
**运行结果**：✅ 通过

**最终 API 接口**（与 plan 有偏差，已修正）：
```typescript
export interface AltTheoryConfig {
  rootDir: string;    // session cwd（新增，替代 plan 中的 kbDir）
  kbDir: string;      // 工具搜索路径
  profilePath?: string;
  readOnly: boolean;
}

export async function createAltTheorySession(config: AltTheoryConfig)
  : Promise<{ session: AgentSession }>;
```

**Plan 原代码的 3 个 bug 及修正**：

| Plan 原代码 | 问题 | 修正 |
|---|---|---|
| `createReadOnlyTools(kbDir)` / `createCodingTools(kbDir)` | 返回 `Tool[]`，与 `customTools?: ToolDefinition[]` 类型不匹配 | 改用 `tools: string[]` 白名单 `["read", "ls", "grep", "find"]` |
| `tools: toolDefinitions` | `CreateAgentSessionOptions.tools` 是 `string[]`（工具名白名单），不是 `ToolDefinition[]` | 改用 `tools: ["read", "ls", "grep", "find"]` |
| `const cwd = config.kbDir` | cwd 应为 rootDir（父目录），不是 kbDir | 拆分 `rootDir` 和 `kbDir`，接口增加 `rootDir` 字段 |

**验证细节**：
- Session ID 示例：`019dc3d1-c0cb-727e-8da2-80a8b2b3e55a`
- System prompt 包含只读工具列表：`read, ls, grep, find`
- `appendSystemPromptOverride` 追加位置：PI 原生 → appendOverride → AGENTS.md → Skills

### 2.2 TUI 手动测试

**测试环境**：`cd alt-theory-app/tui && pi`

| 测试项 | 输入 | 结果 |
|--------|------|------|
| Class 3（问候） | "hi say hi" | ✅ 正确识别为 Class 3，简短问候 + 4 Questions |
| Class 1（知识检索） | "i want to know more about theories on that question" | ✅ 正确分类为 Class 1，尝试读取 know_theo.md（路径问题已修正），直接基于内部知识回答了 ART、SRT、Biophilia 等理论 |
| AGENTS.md 加载 | "What is your role?" | ✅ Agent 回答 "Alt Theory, an AI cognitive mentor for environmental psychology" |
| bash 工具 | "What files are in the current directory?" | ✅ Git Bash 配置后正常工作 |
| PowerShell 支持 | 切换 shellPath 为 pwsh.exe | ❌ 失败（LLM 生成 PowerShell 语法，但命令返回空） |

### 2.3 Provider 配置（新增知识）

**PI 内置 MiniMax Provider 结构**（发现于 dev session）：

| Provider ID | Base URL | 协议 | Env Var |
|---|---|---|---|
| `minimax` | `api.minimax.io/anthropic` | Anthropic | `MINIMAX_API_KEY` |
| `minimax-cn` | `api.minimaxi.com/anthropic` | Anthropic | `MINIMAX_CN_API_KEY` |

两个都走 **Anthropic 协议**（不是 OpenAI）。

**Coding Plan Key (`sk-cp-`)**：
- 用户的 `sk-cp-` key 是 MiniMax coding plan 专用
- 可用于 PI 内置的 `minimax-cn` provider（Anthropic 协议）
- 与 opencode 的 `@ai-sdk/openai-compatible`（走 `/v1` OpenAI 协议）是同一 key 的不同接入方式

**最终配置方案**：
- `~/.pi/agent/settings.json`：`defaultProvider: "minimax-cn"`, `shellPath: "D:\Program Files\Git\bin\bash.exe"`
- `~/.pi/agent/models.json`：自定义 provider `minimaxcn-coding-plan`（已创建，当前未使用）
- `~/.pi/agent/auth.json`：`{}`（推荐优先用 models.json 的 env var 方式）

### 2.4 System Prompt 机制验证

**顺序**（设计 session 已验证）：
```
[Block 1] PI 原生 system prompt（工具说明、Guidelines、Documentation）
[Block 2] appendSystemPromptOverride 追加内容
[Block 3] # Project Context
[Block 4] AGENTS.md（自动加载项目根目录）
[Block 5] Skills 列表
```

**AGENTS.md 加载时机**：session 创建时读取一次，非每次 turn。连续两次创建的 session，system prompt 完全一致（长度 11916），可命中 prompt cache。

### 2.5 Prompt 升级（v0.6）

**来源**：从 `v0.51-draft` 迁移，清理为 v0.6

**变更**：
- 删除所有 Dify `{{#...#}}` 模板变量
- `know_theo.md`：`{{#sys.query#}}` 和 `{{#1767283782533.output#}}` → `[Insert retrieved knowledge base results here]`
- `alt_theo.md`：`{{#17672879191100.output#}}` → 同上；修了 3 个拼写错误
- AGENTS.md 路径修正：`prompts/know_theo.md` → `.pi/prompts/know_theo.md`

**已知问题**：v0.6 清理版只是删除了 Dify 变量，但 prompt 内的 `<context>[Insert retrieved KB results]</context>` 仍是占位符。PI agent 没有自动检索 KB 的机制。如何获取 KB 内容：
- **选项 A**：通过 `--append-system-prompt` 注入 KB 搜索指引
- **选项 B**：依赖 RAG server（alt-theory-rag）作为 MCP tool
- **选项 C**：将 KB 内容作为 context file 放入 `.pi/` 目录

**决策**：推迟到 Phase 2（用户主导，不阻塞工程）。

### 2.6 未完成项

| 项 | 状态 | 说明 |
|---|---|---|
| Class 2（alt_theo）测试 | 未测 | 需要 KB 有数据才有意义 |
| KB 内容导入 | `kb/` 目录空 | 数据层问题，不阻塞工程 |
| PowerShell 支持 | 失败 | PI bash 工具只支持 bash，Windows 用户需要 Git for Windows |

---

## 3. 核心决策更新

| 日期 | 决策 | 原因 |
|------|------|------|
| 20260425 | Core 层 API 修正：用 `tools: string[]` 白名单，不用 `customTools` | `customTools` 类型不匹配，白名单更稳定 |
| 20260425 | 拆分 `rootDir`（cwd）和 `kbDir`（搜索路径） | 避免 agent 根目录就是 KB 目录 |
| 20260425 | Prompt 升级到 v0.6（删除 Dify 变量） | 适配 PI 的纯文本 prompt |
| 20260425 | KB/prompt 问题与工程解耦 | 前后端通信不依赖 prompt/KB 完善 |
| 20260425 | 全栈 MVP 优先 | 确认技术上可实现，再完善业务逻辑 |

---

## 4. 开发线路（更新）

### 已完成
- Phase 1: Core 层 ✅
- Phase 1.5: Question Classifier（Class 3 + Class 1 基础验证）✅

### Phase 2: 数据层（placeholder，用户主导，不阻塞工程）

Phase 2（KB 导入、prompt 最终适配、Class 2 测试）由用户主导，与工程开发解耦。

原因：
- KB 内容未导入（`kb/` 目录为空）
- Prompt v0.6 有占位符（`<context>[Insert retrieved KB results]</context>`），需要用户更新 thinking mode 和搜索策略
- Class 2（alt_theo）测试需要 KB 数据才有意义

工程部分（前后端通信）不依赖这些问题解决。Phase 2 可以在全栈 MVP 完成后并行进行。

### 进行中（全栈 MVP）
```
[3A] Express + WebSocket 后端
     ├── 封装 Core 层为 HTTP/WebSocket 服务
     ├── 定义 WebSocket 协议（client ↔ server）
     └── 管理 session 生命周期

[3B] pi-web-ui 前端
     ├── 接入 WebSocket，消费 server 事件
     ├── 渲染消息流（text_delta, tool_call, tool_result）
     └── 添加 KB/Profile 选择器 UI
```

### 后续（不阻塞 MVP）
- Electron 打包（Phase 4）
- Phase 2 数据层完善（用户主导）

---

## 5. 前后端通信设计

### 5.1 架构

```
Browser (pi-web-ui components)
  │  WebSocket
  ▼
Express Server (Node.js)
  │  PI SDK (createAgentSession with Alt Theory Core)
  ▼
File System (kb/, profiles/, sessions/)
```

### 5.2 WebSocket 协议（基于 pi-gui SessionDriverEvent 简化）

**客户端 → 服务器**（参考 `frontend-architecture-research-report.md` §5.2）：
```typescript
type ClientMessage =
  | { type: "prompt"; payload: string }
  | { type: "abort" }
  | { type: "switch_kb"; payload: { kbDir: string } }
  | { type: "switch_profile"; payload: { profilePath: string } }
  | { type: "new_session" };
```

**服务器 → 客户端**（参考 `frontend-architecture-research-report.md` §5.3）：
```typescript
type ServerMessage =
  | { type: "session_opened"; payload: SessionSnapshot }
  | { type: "session_updated"; payload: SessionSnapshot }
  | { type: "assistant_delta"; payload: { text: string } }
  | { type: "tool_started"; payload: { toolName: string; callId: string; input?: unknown } }
  | { type: "tool_updated"; payload: { callId: string; text?: string; progress?: number } }
  | { type: "tool_finished"; payload: { callId: string; success: boolean; output?: unknown } }
  | { type: "run_completed"; payload: SessionSnapshot }
  | { type: "run_failed"; payload: { error: string } }
  | { type: "error"; payload: { error: string } };
```

### 5.3 事件映射（PI SDK → WebSocket）

参考 `frontend-architecture-research-report.md` §2.4：

| PI SDK Event | ServerMessage Type | 说明 |
|--------------|-------------------|------|
| `agent_start` | `session_updated` | 开始运行 |
| `message_update` (text_delta) | `assistant_delta` | 流式文本 |
| `tool_execution_start` | `tool_started` | 工具开始 |
| `tool_execution_update` | `tool_updated` | 工具进度 |
| `tool_execution_end` | `tool_finished` | 工具完成 |
| `agent_end` (success) | `run_completed` | 运行成功 |
| `agent_end` (error) | `run_failed` | 运行失败 |

### 5.4 Session 管理策略

**当前**：单 session（最简单的 MVP）。

**未来**：多 session（树状分支 `/fork` / `/clone`），复用 PI 原生 JSONL session 文件。

---

## 6. pi-web-ui 接入方式

**关键问题**：pi-web-ui 是纯前端组件库，假设直接订阅 `Agent` 实例的事件。Alt Theory 需要 server-side PI SDK。

**方案**：
1. **WebSocket 桥接**：在浏览器端创建 `Agent` 的 mock/facade，把 WebSocket 消息转成 `Agent` 事件，喂给 pi-web-ui 组件。
2. **绕过 pi-web-ui 事件系统**：不用 pi-web-ui 的 `AgentInterface`，直接用底层 DOM 组件（`MessageList`, `MessageEditor`），手动渲染 WebSocket 消息。

**待决策**：
- 方案 1 更自然，但需要确认 pi-web-ui 的 `Agent` 类是否可以被 facade。
- 方案 2 更灵活，但放弃了 pi-web-ui 的高级功能（artifacts、attachments）。

**MVP 建议**：先尝试方案 1（facade），如果受阻退到方案 2（手动渲染）。

---

## 7. 文件结构（当前状态）

```
alt-theory-app/                     # 已创建
├── core/
│   ├── alt-theory-core.ts          # ✅ 已验证
│   └── test-core.ts                # ✅ 已通过
├── tui/
│   ├── AGENTS.md                   # ✅ v0.6
│   └── .pi/
│       └── prompts/
│           ├── know_theo.md        # ✅ v0.6（占位符未替换）
│           ├── alt_theo.md         # ✅ v0.6（占位符未替换）
│           └── general.md          # ✅ v0.6
└── web-server/                     # 🔄 待创建（Phase 3）
    ├── server.ts
    ├── websocket-protocol.ts       # 协议定义
    └── client/                     # pi-web-ui 接入
        └── index.ts

assets/                             # 待创建/导入
├── kb/                             # 🔄 空（数据层问题，不阻塞工程）
├── profiles/
│   └── default.md                  # 🔄 待创建
└── sessions/                       # PI 自动生成
```

---

## 8. 给 Opus 的 Review 问题

**背景**：Alt Theory 要基于 PI SDK 做全栈 MVP（Web UI）。前端研究报告（`frontend-architecture-research-report.md`）已梳理 PI SDK 事件、pi-gui 架构、WebSocket 协议建议。以下是待 review 问题：

### Q1: WebSocket 协议是否足够？

当前协议定义了 `assistant_delta` + `tool_started/finished` + `error` 等事件。是否有遗漏的 PI SDK 事件必须暴露给前端？（例如 `turn_start/end`、`queue_update`、`compaction_start/end`）

### Q2: pi-web-ui 接入方案选择

pi-web-ui 是纯前端组件库，期望直接订阅 `Agent` 实例的事件。我们的后端是 Node.js + WebSocket，需要把服务器事件桥接到前端。

- 方案 A：浏览器端创建 `Agent` facade，把 WebSocket 消息转成 `Agent` 事件，喂给 pi-web-ui 组件
- 方案 B：绕过 pi-web-ui 的事件系统，直接用底层 DOM 组件手动渲染

哪个更可行？有没有 pi-gui 或社区项目的先例？

### Q3: Session 管理策略

MVP 阶段用单 session 还是多 session？

- 单 session：简单，但用户切换 KB/Profile 时需要重启 server 进程
- 多 session：PI 原生支持 JSONL 树状 session，但后端需要管理多个 `AgentSession` 实例

pi-gui 用了多 session + SessionDriver 接口。Alt Theory 简化版是否值得一开始就做多 session？

### Q4: 前后端通信的脆弱点

- 如果 WebSocket 断开，如何恢复对话状态？（PI 的 JSONL session 文件可以恢复）
- 如果用户刷新浏览器页面，session 状态是否丢失？（需要 session ID + 恢复机制）
- 流式消息（`assistant_delta`）在弱网环境下的表现？

### Q5: Windows PowerShell 支持

PI 的 bash 工具目前只支持 bash（Git Bash）。Windows 用户如果不装 Git，无法使用。

- 方案 A：要求用户安装 Git for Windows（文档说明）
- 方案 B：在 Alt Theory 层面通过 `customTools` 注册 PowerShell 工具，覆盖内置 bash
- 方案 C：向 PI 上游提 feature request

哪个是短期最实际的方案？

---

## 9. 已知问题（不阻塞 MVP）

| 问题 | 原因 | 计划 |
|------|------|------|
| KB 目录为空 | 数据层未导入 | 用户主导，和工程解耦 |
| Prompt 占位符 | `<context>[Insert retrieved KB results]</context>` | 用户更新 prompt 后替换 |
| Class 2 未测试 | 需要 KB 数据 | KB 导入后测试 |
| PowerShell 支持 | PI bash 工具只支持 bash | Phase 4 或上游修复 |

---

## 10. 关键参考文件

| 文件 | 内容 |
|------|------|
| `pi-alt-theory-spec-v0.3.md` | v0.3 完整 spec（架构、数据层、前端层详细设计） |
| `plans/2026-04-25-phase1.md` | Phase 1 实施计划 |
| `approach-notes-and-status/dev-report-2026-04-25-phase1.md` | Phase 1 执行报告（含 Core 验证结果、provider 配置发现） |
| `research/frontend-architecture-research-report.md` | 前端研究报告（PI SDK 事件、pi-gui 架构、WebSocket 协议建议） |
| `_dev/research/pi-gui/` | pi-gui clone（Electron + PI SDK 参考实现） |

---

*Spec v0.4 — Core verified, ready for full-stack MVP.*
*Next: Opus review → WebSocket backend dev → pi-web-ui frontend dev.*
