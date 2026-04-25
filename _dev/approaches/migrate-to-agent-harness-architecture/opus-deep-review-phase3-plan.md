# Opus Deep Review: Phase 3 Plan + Spec v0.5

---
created: 20260425
reviewer: Claude Opus 4.6
scope: 前后端接口一致性、API 契约、抽象层、上游约束
---

## 1. 前后端接口一致性问题

### 1.1 `switch_kb` 的 payload 不一致

**Plan（Task 3 Step 2）**：
```javascript
ws.send(JSON.stringify({ type: "switch_kb", payload: { domain: e.target.value } }));
```

**Spec v0.5 §7.2 协议定义**：
```typescript
| { type: "switch_kb"; payload: { domain: string } }
```

这两个一致，没问题。

**但后端处理逻辑（Plan Task 1）没有定义 `switch_kb` 的处理**。Plan 的 server.ts 框架只处理了 `prompt` 和 `abort`，`switch_kb` 的后端逻辑缺失。dev session 需要自己推断，容易出错。

**修复**：Plan Task 1 Step 2 需要补充：
```typescript
case "switch_kb":
  currentDomain = msg.payload.domain;
  break;
// 在 prompt 处理时注入 context：
case "prompt":
  const contextPrefix = currentDomain !== "all"
    ? `[Context: Search in ./assets/kb/${currentDomain}/ unless user says otherwise.]\n`
    : "";
  await session.prompt(contextPrefix + msg.payload);
  break;
```

### 1.2 `SessionSnapshot` 类型两边都未定义

Spec v0.5 §7.2 的 `ServerMessage` 里有：
```typescript
| { type: "session_opened"; payload: SessionSnapshot }
| { type: "session_updated"; payload: SessionSnapshot }
| { type: "run_completed"; payload: SessionSnapshot }
```

但 `SessionSnapshot` 的结构在 spec 和 plan 里都没有定义。前端收到这个消息后不知道里面有什么字段，无法渲染。

**修复**：在 `websocket-protocol.ts` 里定义：
```typescript
interface SessionSnapshot {
  sessionId: string;
  status: "idle" | "running" | "error";
  currentDomain: string;       // 当前 KB 域
  profilePath?: string;        // 当前 profile
  messageCount: number;        // 消息数量（用于历史列表显示）
}
```

### 1.3 `tool_started` 的 `input` 字段暴露问题

Spec §7.2：
```typescript
| { type: "tool_started"; payload: { toolName: string; callId: string; input?: unknown } }
```

`input` 包含原始命令（如 `grep -r "ART" ./kb`），你明确说不想显示这些细节。但协议里还是传了 `input?: unknown`。

这不是 bug，但会给前端开发者造成困惑——到底要不要显示 `input`？

**建议**：要么删除 `input` 字段，要么在协议注释里明确写"前端不显示 input，仅供调试"。

---

## 2. 上游 PI SDK 约束未验证的风险点

### 2.1 `session.subscribe()` vs `session.on()`

Plan Task 1 的代码写：
```typescript
session.subscribe((event) => { ... });
```

但前端研究报告 §3.3 里 pi-web-ui 的示例写的是：
```typescript
agent.subscribe((event) => { ... });
```

`AgentSession`（来自 pi-coding-agent）和 `Agent`（来自 pi-agent-core）是不同的类。`createAltTheorySession()` 返回的是 `AgentSession`，不是 `Agent`。

**需要验证**：`AgentSession` 是否有 `subscribe()` 方法？还是用 `on()` 或其他 API？

查看方式：
```bash
grep -n "subscribe\|on(" alt-theory-app/node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.d.ts
```

如果 `AgentSession` 没有 `subscribe()`，Plan Task 1 Step 2 的整个事件监听代码都会报错。

### 2.2 `session.abort()` 是否存在

Plan 里写了：
```typescript
case "abort":
  session.abort();
  break;
```

同样需要验证 `AgentSession` 是否有 `abort()` 方法。PI SDK 的 abort 可能叫 `cancel()` 或 `stop()`。

### 2.3 `session.prompt()` 的返回值

Plan 里写：
```typescript
session.prompt(msg.payload);
```

没有 `await`。如果 `session.prompt()` 是 async 的（大概率是），不 await 会导致错误无法捕获，WebSocket 连接会在 agent 还在运行时就处理下一条消息。

**修复**：
```typescript
case "prompt":
  session.prompt(contextPrefix + msg.payload).catch((err) => {
    ws.send(JSON.stringify({ type: "run_failed", payload: { error: err.message } }));
  });
  break;
```

注意：不能直接 `await`，因为 `ws.on("message")` 的回调不是 async。需要用 `.catch()` 处理错误。

---

## 3. 抽象层缺失

### 3.1 缺少 `EventMapper` 层

当前 Plan 把 PI SDK 事件映射直接写在 `server.ts` 里（一个大 switch）。这有两个问题：

1. `server.ts` 会变得很长（WebSocket 管理 + session 管理 + 事件映射 + 状态管理全混在一起）
2. 未来加 `compaction_started/ended` 等事件时，需要修改 `server.ts`

**建议**：抽出一个 `event-mapper.ts`：
```typescript
// event-mapper.ts
export function mapAgentEvent(event: AgentSessionEvent): ServerMessage | null {
  switch (event.type) {
    case "message_update":
      if (event.assistantMessageEvent?.type === "text_delta") {
        return { type: "assistant_delta", payload: { text: event.assistantMessageEvent.delta ?? "" } };
      }
      return null;
    case "tool_execution_start":
      return { type: "tool_started", payload: { toolName: event.toolName, callId: event.toolCallId } };
    // ...
  }
}
```

这样 `server.ts` 只做 WebSocket 管理，`event-mapper.ts` 只做事件转换，职责清晰。

### 3.2 缺少 `SessionState` 管理层

当前 Plan 把 `currentDomain` 作为 server 内存中的裸变量。随着功能增加（currentProfile、sessionId、messageHistory），这些状态会散落在 `server.ts` 各处。

**建议**：用一个简单对象封装：
```typescript
interface ServerState {
  session: AgentSession | null;
  currentDomain: string;
  currentProfilePath: string;
}
const state: ServerState = {
  session: null,
  currentDomain: "ep-core",
  currentProfilePath: "./assets/profiles/default.md",
};
```

MVP 阶段不需要类，一个对象就够。但要集中管理，不要散落。

---

## 4. 路线图扩展的预留

### 4.1 多 session 的预留口

当前单 session，但 spec 提到未来多 session。Plan 里没有为此预留任何接口。

**最小预留**（不增加实现成本）：
- `ClientMessage` 加可选 `sessionId?: string` 字段，MVP 阶段忽略
- `ServerMessage` 的 `session_opened` payload 里包含 `sessionId`，前端存起来备用

这两行改动不影响 MVP 实现，但未来扩展时不需要改协议。

### 4.2 Profile 多条拼装的预留口

Spec §5.5 提到未来 `profilePaths: string[]`。当前 `createAltTheorySession` 只接受 `profilePath?: string`（单条）。

**最小预留**：Core 层的 `AltTheoryConfig` 改为：
```typescript
profilePath?: string;        // 当前（单条，向后兼容）
// profilePaths?: string[];  // 未来（多条，注释预留）
```

不需要实现，注释说明即可。

---

## 5. 总结：需要在 Plan 里修复的问题

| 严重性 | 问题 | 位置 | 修复方式 |
|--------|------|------|----------|
| P0 | `session.subscribe()` API 未验证 | Task 1 前 | 加验证步骤，查类型定义 |
| P0 | `session.prompt()` 未 await，错误无法捕获 | Task 1 Step 2 | 改用 `.catch()` |
| P0 | `switch_kb` 后端处理逻辑缺失 | Task 1 Step 2 | 补充 case + context 注入 |
| P1 | `SessionSnapshot` 类型未定义 | Task 1 前 | 在 websocket-protocol.ts 定义 |
| P1 | 方案 A（Agent facade）大概率失败 | Task 2 Step 1 | 删除方案 A，直接用 vanilla HTML |
| P1 | 端口不一致（3000 vs 3001） | Task 1/验证清单 | 统一用共享 HTTP server |
| P2 | 缺少 EventMapper 抽象层 | Task 1 Step 2 | 抽出 event-mapper.ts |
| P2 | ServerState 散落 | Task 1 Step 2 | 用 ServerState 对象集中管理 |
| P3 | 多 session 无预留口 | Task 1 协议 | ClientMessage 加可选 sessionId |

P0 问题会直接导致 dev session 卡住或产生 silent bug。P1 会导致返工。P2/P3 是架构质量问题，不阻塞 MVP 但影响后续扩展。

---

*Deep review by Opus 4.6, 20260425*
