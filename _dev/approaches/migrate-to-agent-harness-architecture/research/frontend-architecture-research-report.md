# Frontend Architecture Research Report

---
created: 20260425
session: frontend-research
status: draft
---

## 概述

本报告研究 Alt Theory 的前端架构，分析 pi-gui 的设计，梳理 PI SDK 事件类型，理解 pi-web-ui 的假设，并为 WebSocket 协议设计提供建议。

**研究范围**：
- PI SDK 事件类型（pi-agent-core）
- pi-gui 的 pi-sdk-driver 和 session-supervisor
- pi-web-ui 的组件假设
- Electron IPC 协议（preload.ts）

**不涉及**：实际的 spec/plan 修改，前端代码编写。

---

## 1. PI SDK 事件类型分析

### 1.1 核心事件（来自 `pi-agent-core/dist/types.d.ts`）

PI SDK 的 `Agent` 类发出以下事件：

```typescript
type AgentEvent = 
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean };
```

### 1.2 事件语义

| 事件 | 触发时机 | Payload |
|------|----------|---------|
| `agent_start` | Agent loop 开始 | 无 |
| `agent_end` | Agent loop 结束 | 最终 messages 数组 |
| `turn_start` | LLM call 开始 | 无 |
| `turn_end` | LLM call 结束 | assistant message + tool results |
| `message_start` | 新消息开始 | message 对象 |
| `message_update` | 流式更新 | message + assistantMessageEvent（含 delta） |
| `message_end` | 消息完成 | message 对象 |
| `tool_execution_start` | 工具开始执行 | toolCallId, toolName, args |
| `tool_execution_update` | 工具执行进度 | toolCallId, partialResult |
| `tool_execution_end` | 工具执行完成 | toolCallId, result, isError |

### 1.3 AssistantMessageEvent 类型

```typescript
// 来自 pi-ai
type AssistantMessageEvent = 
  | { type: "text_delta"; delta?: string }
  | { type: "tool_call"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_result"; toolCallId: string; result: any; isError: boolean };
```

### 1.4 AgentSession 扩展事件

`AgentSession`（来自 pi-coding-agent）扩展了核心事件：

```typescript
type AgentSessionEvent = AgentEvent | 
  | { type: "queue_update"; steering: readonly string[]; followUp: readonly string[] }
  | { type: "compaction_start"; reason: "manual" | "threshold" | "overflow" }
  | { type: "compaction_end"; reason: ...; result: CompactionResult | undefined; aborted: boolean; willRetry: boolean }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: "auto_retry_end"; success: boolean; attempt: number; finalError?: string };
```

---

## 2. pi-gui 架构分析

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  PiSdkDriver                                             ││
│  │    ├─ SessionSupervisor (session lifecycle)              ││
│  │    ├─ RuntimeSupervisor (runtime resources)              ││
│  │    └─ JsonCatalogStore (workspace/session catalog)       ││
│  └─────────────────────────────────────────────────────────┘│
│                           │                                  │
│                    IPC (preload.ts)                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Process (React)                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  DesktopAppState (global state)                          ││
│  │    ├─ workspaces                                         ││
│  │    ├─ sessions                                           ││
│  │    ├─ selectedSession                                    ││
│  │    └─ composer                                           ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 2.2 SessionDriver 接口

pi-gui 定义了 `SessionDriver` 抽象接口（`@pi-gui/session-driver`）：

```typescript
interface SessionDriver {
  createSession(workspace: WorkspaceRef, options?: CreateSessionOptions): Promise<SessionSnapshot>;
  openSession(sessionRef: SessionRef): Promise<SessionSnapshot>;
  archiveSession(sessionRef: SessionRef): Promise<void>;
  unarchiveSession(sessionRef: SessionRef): Promise<void>;
  sendUserMessage(sessionRef: SessionRef, input: SessionMessageInput): Promise<void>;
  cancelCurrentRun(sessionRef: SessionRef): Promise<void>;
  setSessionModel(sessionRef: SessionRef, selection: SessionModelSelection): Promise<void>;
  setSessionThinkingLevel(sessionRef: SessionRef, thinkingLevel: string): Promise<void>;
  renameSession(sessionRef: SessionRef, title: string): Promise<void>;
  compactSession(sessionRef: SessionRef, customInstructions?: string): Promise<void>;
  reloadSession(sessionRef: SessionRef): Promise<void>;
  getSessionCommands(sessionRef: SessionRef): Promise<readonly RuntimeCommandRecord[]>;
  respondToHostUiRequest(sessionRef: SessionRef, response: HostUiResponse): Promise<void>;
  subscribe(sessionRef: SessionRef, listener: SessionEventListener): Unsubscribe;
  closeSession(sessionRef: SessionRef): Promise<void>;
}
```

### 2.3 SessionDriverEvent 类型

pi-gui 将 PI SDK 事件映射为前端友好的 `SessionDriverEvent`：

```typescript
type SessionDriverEvent =
  | { type: "sessionOpened"; sessionRef: SessionRef; timestamp: Timestamp; snapshot: SessionSnapshot }
  | { type: "sessionUpdated"; sessionRef: SessionRef; timestamp: Timestamp; snapshot: SessionSnapshot }
  | { type: "assistantDelta"; sessionRef: SessionRef; timestamp: Timestamp; text: string }
  | { type: "toolStarted"; sessionRef: SessionRef; timestamp: Timestamp; toolName: string; callId: string; input?: unknown }
  | { type: "toolUpdated"; sessionRef: SessionRef; timestamp: Timestamp; callId: string; text?: string; progress?: number }
  | { type: "toolFinished"; sessionRef: SessionRef; timestamp: Timestamp; callId: string; success: boolean; output?: unknown }
  | { type: "runCompleted"; sessionRef: SessionRef; timestamp: Timestamp; snapshot: SessionSnapshot }
  | { type: "runFailed"; sessionRef: SessionRef; timestamp: Timestamp; error: SessionErrorInfo }
  | { type: "hostUiRequest"; sessionRef: SessionRef; timestamp: Timestamp; request: HostUiRequest }
  | { type: "extensionCompatibilityIssue"; sessionRef: SessionRef; timestamp: Timestamp; issue: ExtensionCompatibilityIssue }
  | { type: "sessionClosed"; sessionRef: SessionRef; timestamp: Timestamp; reason: "manual" | "ended" | "failed" };
```

### 2.4 事件映射（mapAgentEvent）

关键映射逻辑（`session-supervisor.ts:1289-1379`）：

| PI SDK Event | SessionDriverEvent | 说明 |
|--------------|--------------------|------|
| `agent_start` | `sessionUpdated` (status: running) | 开始运行 |
| `turn_start` | `sessionUpdated` (status: running) | LLM turn 开始 |
| `message_start` | `sessionUpdated` | 消息开始 |
| `message_end` | `sessionUpdated` | 消息完成 |
| `message_update` (assistant + text_delta) | `assistantDelta` | 流式文本 |
| `message_update` (其他) | `sessionUpdated` | 其他更新 |
| `tool_execution_start` | `toolStarted` | 工具开始 |
| `tool_execution_update` | `toolUpdated` | 工具进度 |
| `tool_execution_end` | `toolFinished` | 工具完成 |
| `turn_end` | `sessionUpdated` | LLM turn 结束 |
| `agent_end` (success) | `runCompleted` | 运行成功 |
| `agent_end` (error) | `runFailed` | 运行失败 |

### 2.5 HostUiRequest 类型

Extension 可以请求 UI 交互：

```typescript
type HostUiRequest =
  | { kind: "confirm"; requestId: string; title: string; message: string; defaultValue?: boolean; timeoutMs?: number }
  | { kind: "input"; requestId: string; title: string; placeholder?: string; initialValue?: string; timeoutMs?: number }
  | { kind: "select"; requestId: string; title: string; options: readonly string[]; allowMultiple?: boolean; timeoutMs?: number }
  | { kind: "editor"; requestId: string; title: string; initialValue?: string }
  | { kind: "notify"; requestId: string; message: string; level?: "info" | "warning" | "error" }
  | { kind: "status"; requestId: string; key: string; text?: string }
  | { kind: "widget"; requestId: string; key: string; lines?: readonly string[]; placement?: "aboveComposer" | "belowComposer" }
  | { kind: "title"; requestId: string; title: string }
  | { kind: "editorText"; requestId: string; text: string }
  | { kind: "reset"; requestId: string };
```

---

## 3. pi-web-ui 分析

### 3.1 架构假设

pi-web-ui 是**纯前端**组件库，假设：

1. **无文件系统访问**：浏览器环境，不能直接读文件
2. **IndexedDB 存储**：sessions、settings、API keys 存在浏览器
3. **Agent 类直接使用**：前端直接创建 `Agent` 实例
4. **事件订阅**：通过 `agent.subscribe()` 监听事件

### 3.2 核心组件

```typescript
// ChatPanel - 高级聊天界面
const chatPanel = new ChatPanel();
await chatPanel.setAgent(agent, {
  onApiKeyRequired: (provider) => ApiKeyPromptDialog.prompt(provider),
  onBeforeSend: async () => { /* save draft */ },
  toolsFactory: (agent, agentInterface, artifactsPanel, runtimeProvidersFactory) => {
    return [createJavaScriptReplTool()];
  },
});

// AgentInterface - 低级聊天界面
const chat = document.createElement('agent-interface') as AgentInterface;
chat.session = agent;
chat.enableAttachments = true;
chat.enableModelSelector = true;
```

### 3.3 Agent 创建方式

```typescript
import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';

const agent = new Agent({
  initialState: {
    model: getModel('anthropic', 'claude-sonnet-4-5-20250929'),
    systemPrompt: 'You are helpful.',
    thinkingLevel: 'off',
    messages: [],
    tools: [],
  },
  convertToLlm: defaultConvertToLlm,
});

// 发送消息
await agent.prompt('Hello!');

// 监听事件
agent.subscribe((event) => {
  switch (event.type) {
    case 'agent_start':
    case 'agent_end':
    case 'turn_start':
    case 'turn_end':
    case 'message_start':
    case 'message_update':
    case 'message_end':
    case 'tool_execution_start':
    case 'tool_execution_end':
      break;
  }
});
```

### 3.4 Alt Theory 的差异（参考 spec v0.3）

| pi-web-ui 假设 | spec v0.3 设计 |
|----------------|----------------|
| 纯前端（无文件系统） | Node.js + WebSocket 后端（§10.2） |
| IndexedDB 存储 | 文件系统存储（JSONL sessions，§8.3） |
| Agent 直接创建 | Core 层封装 createAltTheorySession()（§9） |
| 无 KB 搜索 | read/grep/find 工具绑定 KB 目录（§4） |
| 无 Profile 注入 | Profile 注入到 system prompt（§8.2） |

---

## 4. Electron IPC 协议分析

### 4.1 preload.ts 结构

pi-gui 的 preload.ts 使用 `contextBridge.exposeInMainWorld`：

```typescript
contextBridge.exposeInMainWorld("piApp", {
  platform: process.platform,
  versions: process.versions,
  
  // State
  getState: () => ipcRenderer.invoke(desktopIpc.stateRequest),
  onStateChanged: (listener) => { /* ... */ },
  
  // Session operations
  createSession: (input) => ipcRenderer.invoke(desktopIpc.createSession, input),
  selectSession: (target) => ipcRenderer.invoke(desktopIpc.selectSession, target),
  cancelCurrentRun: () => ipcRenderer.invoke(desktopIpc.cancelCurrentRun),
  
  // Composer
  submitComposer: (text, options?) => ipcRenderer.invoke(desktopIpc.submitComposer, text, options),
  updateComposerDraft: (draft) => ipcRenderer.invoke(desktopIpc.updateComposerDraft, draft),
  
  // Model/Thinking
  setSessionModel: (workspaceId, sessionId, provider, modelId) => ...,
  setSessionThinkingLevel: (workspaceId, sessionId, thinkingLevel) => ...,
  
  // Workspace
  addWorkspacePath: (path) => ...,
  selectWorkspace: (workspaceId) => ...,
  
  // Files (for diff view)
  listWorkspaceFiles: (workspaceId) => ...,
  getChangedFiles: (workspaceId) => ...,
  getFileDiff: (workspaceId, filePath) => ...,
});
```

### 4.2 IPC 通道命名

```typescript
// 来自 apps/desktop/src/ipc.ts
export const desktopIpc = {
  ping: 'pi-desktop:ping',
  stateRequest: 'pi-desktop:state-request',
  stateChanged: 'pi-desktop:state-changed',
  selectedTranscriptRequest: 'pi-desktop:selected-transcript-request',
  selectedTranscriptChanged: 'pi-desktop:selected-transcript-changed',
  appCommand: 'pi-desktop:app-command',
  workspacePicked: 'pi-desktop:workspace-picked',
  clipboardImagePasted: 'pi-desktop:clipboard-image-pasted',
  // ... 更多
};
```

### 4.3 Alt Theory 简化版 IPC

Alt Theory 不需要 pi-gui 的复杂功能（workspaces、多 session、catalogs、diff view）。

**最小 IPC 需求**：

| 操作 | IPC 通道 | 说明 |
|------|----------|------|
| `getState` | `alt-theory:state-request` | 获取当前状态 |
| `onStateChanged` | `alt-theory:state-changed` | 状态变化通知 |
| `sendPrompt` | `alt-theory:send-prompt` | 发送用户消息 |
| `abort` | `alt-theory:abort` | 取消当前运行 |
| `switchKB` | `alt-theory:switch-kb` | 切换 KB |
| `switchProfile` | `alt-theory:switch-profile` | 切换 Profile |
| `newSession` | `alt-theory:new-session` | 创建新 session |

---

## 5. WebSocket 协议建议

### 5.1 设计原则

1. **与 PI SDK 事件对齐**：WebSocket 事件应映射 PI SDK 的 AgentEvent
2. **与 SessionDriverEvent 兼容**：参考 pi-gui 的设计，但简化
3. **支持流式传输**：assistantDelta 需要高频发送
4. **支持中断**：abort 命令需要立即响应

### 5.2 客户端 → 服务器

```typescript
interface ClientMessage {
  type: "prompt" | "abort" | "switch_kb" | "switch_profile" | "new_session";
  payload: 
    | string  // prompt: 用户输入文本
    | { kbDir: string }  // switch_kb
    | { profilePath: string }  // switch_profile
    | null;  // abort, new_session
}
```

### 5.3 服务器 → 客户端

```typescript
interface ServerMessage {
  type: 
    | "session_opened"
    | "session_updated"
    | "assistant_delta"
    | "tool_started"
    | "tool_updated"
    | "tool_finished"
    | "run_completed"
    | "run_failed"
    | "error";
  payload: 
    | SessionSnapshot  // session_opened, session_updated, run_completed
    | { text: string }  // assistant_delta
    | { toolName: string; callId: string; input?: unknown }  // tool_started
    | { callId: string; text?: string; progress?: number }  // tool_updated
    | { callId: string; success: boolean; output?: unknown }  // tool_finished
    | { error: SessionErrorInfo }  // run_failed, error;
}
```

### 5.4 与 spec v0.3 的对比

spec v0.3 §10.2 定义了初步协议：

```typescript
// spec v0.3
interface ClientMessage {
  type: "prompt" | "abort" | "switch_kb" | "switch_profile" | "new_session";
  payload: string | { kbDir: string } | { profilePath: string };
}

interface ServerMessage {
  type: "text_delta" | "tool_call" | "tool_result" | "error" | "session_updated";
  payload: any;
}
```

**对比 pi-gui SessionDriverEvent**：

| spec v0.3 事件 | pi-gui SessionDriverEvent 对应 |
|----------------|--------------------------------|
| `text_delta` | `assistantDelta` |
| `tool_call` | `toolStarted` |
| `tool_result` | `toolFinished` |
| `session_updated` | `sessionUpdated` |
| `error` | `runFailed` |
| 缺少 | `sessionOpened`, `runCompleted`, `toolUpdated` |

---

## 6. 关键发现总结

### 7.1 PI SDK 事件与 OpenCode 的差异

| 维度 | PI SDK | OpenCode |
|------|--------|----------|
| 事件命名 | `tool_execution_start/end` | `tool_call/tool_result` |
| 流式文本 | `message_update` + `assistantMessageEvent.text_delta` | `text_delta` |
| Turn 概念 | `turn_start/turn_end` | 无显式 turn 事件 |
| Agent 概念 | `agent_start/agent_end` | 无显式 agent 事件 |

**结论**：PI SDK 事件更细粒度，需要映射为前端友好的 SessionDriverEvent。

### 7.2 pi-web-ui 架构假设

pi-web-ui 是纯前端组件库，假设：
- 无文件系统访问（浏览器环境）
- IndexedDB 存储（sessions、settings、API keys）
- Agent 类直接在前端创建

### 7.3 pi-gui 功能范围

pi-gui 支持：workspaces、多 session、catalogs、diff view、extension UI。

---

## 附录 A：关键文件路径

| 文件 | 内容 |
|------|------|
| `node_modules/@mariozechner/pi-agent-core/dist/types.d.ts` | AgentEvent 类型定义 |
| `node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.d.ts` | AgentSession 类型定义 |
| `_dev/research/pi-gui/packages/pi-sdk-driver/src/pi-sdk-driver.ts` | PiSdkDriver 实现 |
| `_dev/research/pi-gui/packages/pi-sdk-driver/src/session-supervisor.ts` | SessionSupervisor + 事件映射 |
| `_dev/research/pi-gui/packages/pi-sdk-driver/src/vendor/session-driver.d.ts` | SessionDriverEvent 类型定义 |
| `_dev/research/pi-gui/apps/desktop/electron/preload.ts` | Electron IPC 实现 |
| `node_modules/@mariozechner/pi-web-ui/README.md` | pi-web-ui 使用文档 |

---

*Report created: 2026-04-25*
*Session: frontend-research*