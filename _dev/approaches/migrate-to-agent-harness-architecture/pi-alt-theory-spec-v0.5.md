# Alt Theory on PI — Executable Spec (v0.5)

---
created: 20260425
updated: 20260425
status: v0.5 — consensus reached, ready for v0.5 spec write
replaces: pi-alt-theory-spec-v0.4.md
---

## 1. 概述

Alt Theory 是一个基于 PI (pi-coding-agent) 的 standalone AI cognitive mentor for environmental psychology。

**当前阶段**：Phase 1 Core 层已验证通过。进入 Phase 3 全栈 MVP 开发（前后端通信）。

**核心意图**：先搞前后端通信，确定全栈 MVP "技术上可实现"。

**已知局限（不阻塞工程）**：
- KB 内容未导入（数据层问题，和工程解耦）
- Prompt v0.6 有占位符（未适配 PI 检索机制）
- Class 2（alt_theo）未测试（需要 KB 数据）

以上归入 thinking mode 开发和搜索策略，由用户主导更新。工程部分（前后端通信）不依赖这些问题解决。

---

## 2. Phase 1 验证结果（完整记录）

### 2.1 Core 层 API 验证

**测试脚本**：`alt-theory-app/core/test-core.ts`
**运行结果**：通过

**最终 API 接口**：
```typescript
export interface AltTheoryConfig {
  rootDir: string;    // session cwd
  kbDir: string;      // 工具搜索路径（kb/ 根目录）
  profilePath?: string;
  readOnly: boolean;
}

export async function createAltTheorySession(config: AltTheoryConfig)
  : Promise<{ session: AgentSession }>;
```

**Plan 原代码的 3 个 bug 及修正**：

| Plan 原代码 | 问题 | 修正 |
|---|---|---|
| `createReadOnlyTools(kbDir)` | 返回 Tool[]，与 customTools 类型不匹配 | 改用 `tools: string[]` 白名单 |
| `tools: toolDefinitions` | tools 是 string[]（工具名白名单），不是 ToolDefinition[] | 改用 `tools: ["read", "ls", "grep", "find"]` |
| `const cwd = config.kbDir` | cwd 应为 rootDir（父目录），不是 kbDir | 拆分 rootDir 和 kbDir |

**验证细节**：
- Session ID 示例：`019dc3d1-c0cb-727e-8da2-80a8b2b3e55a`
- System prompt 包含只读工具列表：`read, ls, grep, find`
- `appendSystemPromptOverride` 追加位置：PI 原生 → appendOverride → AGENTS.md → Skills

### 2.2 TUI 手动测试

**测试环境**：`cd alt-theory-app/tui && pi`

| 测试项 | 输入 | 结果 |
|--------|------|------|
| Class 3（问候） | "hi say hi" | 正确识别为 Class 3，简短问候 + 4 Questions |
| Class 1（知识检索） | "i want to know more about theories" | 正确分类为 Class 1，尝试读取 know_theo.md，基于内部知识回答 ART、SRT、Biophilia |
| AGENTS.md 加载 | "What is your role?" | Agent 回答 "Alt Theory, an AI cognitive mentor..." |
| bash 工具 | "What files are in the current directory?" | Git Bash 配置后正常工作 |
| PowerShell 支持 | 切换 shellPath 为 pwsh.exe | 失败（命令返回空） |

### 2.3 Provider 配置发现

**PI 内置 MiniMax Provider 结构**：

| Provider ID | Base URL | 协议 | Env Var |
|---|---|---|---|
| `minimax` | `api.minimax.io/anthropic` | Anthropic | `MINIMAX_API_KEY` |
| `minimax-cn` | `api.minimaxi.com/anthropic` | Anthropic | `MINIMAX_CN_API_KEY` |

两个都走 Anthropic 协议（不是 OpenAI）。

**Coding Plan Key (`sk-cp-`)**：
- 用户的 `sk-cp-` key 是 MiniMax coding plan 专用
- 可用于 PI 内置的 `minimax-cn` provider（Anthropic 协议）
- 与 opencode 的 `@ai-sdk/openai-compatible`（走 `/v1` OpenAI 协议）是同一 key 的不同接入方式

**最终配置方案**：
- `~/.pi/agent/settings.json`：`defaultProvider: "minimax-cn"`, `shellPath: "D:\Program Files\Git\bin\bash.exe"`
- `~/.pi/agent/models.json`：自定义 provider `minimaxcn-coding-plan`（已创建，当前未使用）
- `~/.pi/agent/auth.json`：`{}`（推荐优先用 models.json 的 env var 方式）

### 2.4 System Prompt 机制验证

**顺序**：
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
- `know_theo.md`：`{{#sys.query#}}` → `[Insert retrieved knowledge base results here]`
- `alt_theo.md`：同上；修了 3 个拼写错误
- AGENTS.md 路径修正：`prompts/know_theo.md` → `.pi/prompts/know_theo.md`

**已知问题**：v0.6 清理版只是删除了 Dify 变量，但 prompt 内的 `<context>[Insert retrieved KB results]</context>` 仍是占位符。PI agent 没有自动检索 KB 的机制。

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
| 20260425 | Core 层 API 修正：用 `tools: string[]` 白名单 | `customTools` 类型不匹配，白名单更稳定 |
| 20260425 | 拆分 `rootDir`（cwd）和 `kbDir`（搜索路径） | 避免 agent 根目录就是 KB 目录 |
| 20260425 | Prompt 升级到 v0.6（删除 Dify 变量） | 适配 PI 的纯文本 prompt |
| 20260425 | KB/Profile 切换不需要新 session | soft 注入，通过 user message 或 steer 动态传入 |
| 20260425 | System prompt 开头加 Conflict Resolution 声明 | 解决用户中途切换设置时的冲突 |
| 20260425 | 允许 write 工具，预留写总结/讨论内容的能力 | system prompt 约束不覆盖系统文件，具体实现作为未来 skill |
| 20260425 | Profile 注入预留多条拼装能力 | 类似 Gemini web app，用户可勾选哪些 profile 条目生效 |
| 20260425 | 全栈 MVP 优先 | 确认技术上可实现，再完善业务逻辑 |

---

## 4. 开发线路（更新）

### 已完成
- Phase 1: Core 层
- Phase 1.5: Question Classifier（Class 3 + Class 1 基础验证）

### Phase 2: 数据层（placeholder，用户主导，不阻塞工程）

Phase 2（KB 导入、prompt 最终适配、Class 2 测试）由用户主导，与工程开发解耦。

原因：
- KB 内容未导入
- Prompt v0.6 有占位符，需要用户更新 thinking mode 和搜索策略
- Class 2 测试需要 KB 数据

工程部分不依赖这些问题解决。Phase 2 可以在全栈 MVP 完成后并行进行。

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
- write 工具 skill 开发（写总结/讨论的命名和存储规范）

---

## 5. KB/Profile 切换机制（关键更新）

### 5.1 核心原则

**切换 KB 或 Profile 不需要重建 session。**

原因：
- Prompt cache 时效短（通常 5-60 分钟），用户切换时大概率已过期
- 用户指令优先于 system prompt 中的默认设置
- 通过 soft 注入（user message 前加 context）实现，不需要修改 system prompt

### 5.2 Conflict Resolution 声明

System prompt 开头加：
```
## Conflict Resolution
If the user explicitly changes their profile, KB domain, or preferences during the conversation, follow their latest instruction. Earlier settings in this prompt are defaults, not constraints.
```

### 5.3 工具路径绑定

**固定为 kb/ 根目录**，不随域切换改变：
```typescript
const kbRootDir = resolve(rootDir, "assets", "kb");
const tools = ["read", "ls", "grep", "find"];  // 白名单，搜索范围 = kbRootDir
```

Agent 自己加路径前缀搜索子目录（如 `grep "ART" kb/urban/`），提示词约束即可。

### 5.4 切换实现方式

**后端维护 `currentDomain` 状态**：
- UI dropdown 切换 KB 域（ep-core / urban / all）
- Server 更新内部状态，不重建 session
- 下一次用户消息发送前，在 message 前注入隐藏 context：
  ```
  [Context: User has selected knowledge base domain "urban". Prioritize searching in ./assets/kb/urban/ unless user requests otherwise.]
  ```

**隐藏注入的实现**（待验证）：
- 首选：PI `steer()` 方法或 `before_agent_start` 的 `message` 注入（`display: false`）
- 备选：WebSocket 后端直接拼接文本前缀（不完美，用户复制消息时可见）
- **Dev session 需验证**：PI 的隐藏消息注入在 pi-web-ui 组件中是否真的不显示

### 5.5 Profile 注入预留

当前：单条 profile 文件注入 system prompt。

未来（路线图）：
- 用户可维护多条 profile 条目（学术背景、语言偏好、沟通风格等）
- UI 提供勾选框，选择哪些条目生效
- 勾选的条目拼装成完整 profile，注入方式同上（soft 注入或 system prompt）
- 抽象层预留：`profilePaths: string[]` + `activeProfiles: string[]`

---

## 6. Write 工具预留（路线图）

### 6.1 当前状态

白名单只含 read 工具：`["read", "ls", "grep", "find"]`

### 6.2 未来启用 write

**条件**：system prompt 明确约束 write 的用途和边界。

**约束示例**：
```
## Write Tool Policy
You have access to a `write` tool. Use it ONLY for:
1. Writing session summaries or discussion notes initiated by the user
2. Creating new files in the `./notes/` directory
3. NEVER overwrite or modify existing system files (kb/, profiles/, .pi/, code/)

File naming convention: `{session-id}-{topic}-{timestamp}.md`
```

**实现方式**：
- 短期：直接启用 `write` 工具，靠 system prompt 约束
- 长期：做成 skill（`write-notes/SKILL.md`），只在用户要求总结/导出时激活，包含详细的命名、格式、存储路径规范

### 6.3 与工程的关系

Write 工具的启用/约束和前后端通信开发**解耦**。可以在 MVP 完成后随时启用，不需要修改前端架构。

---

## 7. 前后端通信设计

### 7.1 架构

```
Browser (pi-web-ui components)
  │  WebSocket
  ▼
Express Server (Node.js)
  │  PI SDK (createAgentSession with Alt Theory Core)
  ▼
File System (kb/, profiles/, sessions/)
```

### 7.2 WebSocket 协议（基于 pi-gui SessionDriverEvent 简化）

**客户端 → 服务器**：
```typescript
type ClientMessage =
  | { type: "prompt"; payload: string }
  | { type: "abort" }
  | { type: "switch_kb"; payload: { domain: string } }      // ep-core / urban / all
  | { type: "switch_profile"; payload: { profilePath: string } }
  | { type: "new_session" };
```

**服务器 → 客户端**：
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

### 7.3 事件映射（PI SDK → WebSocket）

| PI SDK Event | ServerMessage Type | 说明 |
|--------------|-------------------|------|
| `agent_start` | `session_updated` | 开始运行 |
| `message_update` (text_delta) | `assistant_delta` | 流式文本 |
| `tool_execution_start` | `tool_started` | 工具开始 |
| `tool_execution_update` | `tool_updated` | 工具进度 |
| `tool_execution_end` | `tool_finished` | 工具完成 |
| `agent_end` (success) | `run_completed` | 运行成功 |
| `agent_end` (error) | `run_failed` | 运行失败 |

### 7.4 Session 管理策略

**当前**：单 session（最简单的 MVP）。

**切换 KB/Profile 的影响**：
- 不重建 session
- 只更新内部状态（`currentDomain`）
- 在下一条消息前注入 context

**未来**：多 session（树状分支 `/fork` / `/clone`），复用 PI 原生 JSONL session 文件。

---

## 8. 前端设计要点

### 8.1 布局

标准三栏：左侧边栏（会话历史 + KB/Profile 选择器）+ 主聊天区域。

### 8.2 样式

- 学术笔记风（类似 Notion）
- 灰度配色，非纯黑，不同灰度层次
- 只有一个强调色系
- 少数部分用衬线字体（学术感），大部分非衬线

### 8.3 消息渲染

- 用户消息：右对齐气泡
- Agent 回复：左对齐，Markdown 渲染
- 推理过程：折叠显示（默认收起）
- 工具调用：spinner + 人类可读文案（不显示命令细节）

---

## 9. 给 Opus 的 Review 问题

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

## 10. 关键参考文件

| 文件 | 内容 |
|------|------|
| `pi-alt-theory-spec-v0.4.md` | v0.4 完整 spec（架构、数据层、前端层详细设计） |
| `plans/2026-04-25-phase1.md` | Phase 1 实施计划 |
| `approach-notes-and-status/dev-report-2026-04-25-phase1.md` | Phase 1 执行报告 |
| `research/frontend-architecture-research-report.md` | 前端研究报告 |
| `_dev/research/pi-gui/` | pi-gui clone（Electron + PI SDK 参考实现） |
| `frontend-design-brief.md` | Opus 前端设计 brief |

---

*Spec v0.5 — consensus reached.*
*Next: Opus review → WebSocket backend dev → pi-web-ui frontend dev.*