# Phase 3 Dev Execution Report

> **From:** Dev Agent (glm-5.1)
> **To:** Design Agent
> **Date:** 2026-04-26
> **Subject:** Phase 3 执行结果、偏差、发现
> **Branch:** `feat/phase3-fullstack-mvp`

---

## 1. 执行结果总结

| Task | 状态 | 备注 |
|------|------|------|
| Task 1: Express + WebSocket 后端 | ✅ 完成 | API 验证在先，代码按实际 API 修正 |
| Task 2: Vanilla HTML 前端 | ✅ 完成 | 学术笔记风灰度 UI |
| Task 3: KB/Profile 切换验证 | ✅ 通过 | 无新文件，纯验证 |

**Commits:**
- `e59331c` feat(task1): Express + WebSocket backend with PI SDK event bridge
- `a7f221c` feat(task2): vanilla HTML frontend with academic-notes style

---

## 2. 与 Plan 的偏差

### 2.1 包管理策略：无单独 package.json（重要）

**Plan 原方案**：在 `alt-theory-app/web-server/` 创建独立 `package.json`，单独 `npm install` express/ws/pi-coding-agent。

**实际做法**：express/ws 安装到 root `package.json`，web-server 目录只放源码文件。

**原因**：
1. Core 层 (`alt-theory-app/core/alt-theory-core.ts`) 依赖 root 的 `pi-coding-agent`。如果 web-server 也有自己的 `node_modules/pi-coding-agent`，两份拷贝会导致类型不兼容（TypeScript `instanceof` 检查失败、`Symbol` 不匹配等）
2. `import "../core/alt-theory-core.js"` 跨 package.json 边界的模块解析不可靠
3. 运行方式改为 `npx tsx alt-theory-app/web-server/server.ts`（从 root 执行），无需 web-server 自己的 tsx

**Spec 影响**：Spec §7.1 架构图无需改，但运行指令从 `cd alt-theory-app/web-server && npx tsx server.ts` 变为 `npx tsx alt-theory-app/web-server/server.ts`。

### 2.2 agent_end 无 success/error 字段（重要）

**Plan 原方案**：用 `agent_end` 事件区分 success → `run_completed` vs error → `run_failed`。

**实际 API**：`agent_end` 的类型是 `{ type: "agent_end"; messages: AgentMessage[] }`，没有 success/error 字段。

**修正方式**：用 `session.state.errorMessage` 判断：
```typescript
case "agent_end": {
  const error = session.state.errorMessage;
  if (error) {
    send({ type: "run_failed", payload: { error } });
  } else {
    messageCount++;
    send({ type: "run_completed", payload: snapshot({ status: "idle" }) });
  }
  break;
}
```

**Spec 影响**：Spec §7.3 事件映射表里 `agent_end (success)` / `agent_end (error)` 的描述需更新为 "agent_end → 检查 state.errorMessage 判断 success/error"。Plan 的 event mapping 代码框架需要同步。

### 2.3 abort() 是 async

**Plan 原方案**：`session.abort()` 同步调用。

**实际 API**：`abort(): Promise<void>` — 异步方法，返回 Promise。

**修正方式**：加了 `await` 和 try/catch：
```typescript
case "abort":
  try {
    await session.abort();
  } catch (err: any) {
    send({ type: "error", payload: { error: err.message ?? String(err) } });
  }
  break;
```

**Spec 影响**：无 spec 影响，纯实现细节。

### 2.4 new_session 实现补充

**Plan 定义了** `ClientMessage` 的 `new_session` 类型，但 server.ts 框架代码中没有实现该 handler。

**实际做法**：在 server.ts 中添加了完整的 `new_session` handler：
- 取消旧 session 的 subscribe
- 创建新 session
- 重置 messageCount
- 发送 `session_opened`
- 用 `let session` 可变引用让 subscribe 闭包能访问新 session

**关键实现细节**：`session` 变量必须用 `let`（非 `const`），因为 `new_session` 需要重新赋值。subscribe 闭包捕获的是变量引用，不是值，所以重新赋值后闭包自动访问新 session。

**Spec 影响**：无。Plan 已定义协议类型，只是实现代码框架里漏了 handler。

### 2.5 Task 3 无新文件

**Plan 预期**：Task 3 有验证步骤，但无新文件产出。

**实际**：完全符合预期。KB 切换逻辑（context prefix 注入）和 Profile 切换逻辑（serverState 更新）已在 Task 1 的 server.ts 中完整实现，Task 3 只是验证这些代码正确工作。

---

## 3. PI SDK API 验证结果（新知识）

以下 API 在 Task 1 Step 2 中验证，与 Plan 假设对比：

| API | Plan 假设 | 实际 API | 是否匹配 |
|---|---|---|---|
| 事件订阅 | `session.subscribe(cb)` | `subscribe(listener): () => void` | ✅ 匹配 |
| 发送 prompt | `session.prompt(text)` | `prompt(text, options?): Promise<void>` | ✅ 匹配 |
| 中止 | `session.abort()` | `abort(): Promise<void>` | ⚠️ async，plan 写成同步 |
| Session ID | `session.sessionId` | `get sessionId(): string`（getter） | ✅ 匹配 |
| 运行状态 | 未明确 | `get isStreaming(): boolean` | 新发现，已使用 |
| 完整状态 | 未明确 | `get state(): AgentState` | 新发现，用于 errorMessage 检查 |
| steer/followUp | 未提及 | `steer(text): Promise<void>` / `followUp(text): Promise<void>` | 未使用，留给未来 |

### 3.1 完整事件类型列表

**基础事件 (AgentEvent)**：
| 事件类型 | 字段 |
|---|---|
| `agent_start` | 无 |
| `agent_end` | `messages: AgentMessage[]` |
| `turn_start` | 无 |
| `turn_end` | `message, toolResults` |
| `message_start` | `message: AgentMessage` |
| `message_update` | `message, assistantMessageEvent` |
| `message_end` | `message: AgentMessage` |
| `tool_execution_start` | `toolCallId, toolName, args` |
| `tool_execution_update` | `toolCallId, toolName, args, partialResult` |
| `tool_execution_end` | `toolCallId, toolName, result, isError` |

**Session 扩展事件 (AgentSessionEvent)**：
| 事件类型 | 字段 | 用途 |
|---|---|---|
| `queue_update` | `steering, followUp` | 流式队列状态 |
| `compaction_start/end` | `reason, result, aborted` | 上下文压缩 |
| `auto_retry_start/end` | `attempt, maxAttempts, success` | 自动重试 |

MVP 阶段只映射了基础事件中的 6 种。`compaction_*` 和 `auto_retry_*` 未映射，前端不会显示这些状态。

### 3.2 AssistantMessageEvent 类型

`message_update` 事件的 `assistantMessageEvent` 字段是以下联合类型：

| type | 关键字段 | 用途 |
|---|---|---|
| `start` | `partial` | 消息开始 |
| `text_start` | `contentIndex, partial` | 文本块开始 |
| `text_delta` | `contentIndex, delta, partial` | **流式文本增量** |
| `text_end` | `contentIndex, content` | 文本块结束 |
| `thinking_start` | `contentIndex, partial` | 思考过程开始 |
| `thinking_delta` | `contentIndex, delta` | 思考过程增量 |
| `done` | `partial` | 完成 |
| `error` | `partial` | 错误 |

MVP 只处理 `text_delta`。`thinking_*` 事件可用于未来"折叠显示推理过程"功能。

---

## 4. 验证清单结果

| 检查项 | 方法 | 结果 |
|--------|------|------|
| 后端启动 | `npx tsx alt-theory-app/web-server/server.ts` | ✅ 无报错，端口 3000 |
| 前端连接 | WebSocket 测试脚本 | ✅ 连接成功，收到 `session_opened` |
| 基础对话 | 发送 "hi" | ✅ "Hey! 👋 How can I help you today?" |
| 流式文本 | 检查 `assistant_delta` 事件 | ✅ 多个 delta 拼接为完整回复 |
| 工具调用事件 | 触发 read/grep 工具 | ✅ `tool_started` → `tool_finished` 事件正常 |
| KB 切换 | 切换到 urban 后发送 "what domain am I in?" | ✅ Agent 回复 "You're in the **urban** domain" |
| Profile 切换 | 发送 `switch_profile` | ✅ 无报错，serverState 更新 |
| new_session | 发送 `new_session` 消息 | ✅ 新 session 创建，`session_opened` 发送 |

---

## 5. 文件清单

### 新建文件
| 文件 | 说明 |
|---|---|
| `alt-theory-app/web-server/server.ts` | Express + WebSocket 服务器，PI SDK 事件桥接 |
| `alt-theory-app/web-server/websocket-protocol.ts` | 前后端共享协议类型 |
| `alt-theory-app/web-server/public/index.html` | 前端 HTML |
| `alt-theory-app/web-server/public/client.js` | 前端 WebSocket 客户端 |
| `alt-theory-app/web-server/public/style.css` | 学术笔记风样式 |

### 修改文件
| 文件 | 变更 |
|---|---|
| `package.json` (root) | 新增 `express`, `ws` 依赖 + `@types/express`, `@types/ws` 开发依赖 |

### 未创建
| 文件 | 原因 |
|---|---|
| `alt-theory-app/web-server/package.json` | 改用 root package.json，见 §2.1 |
| `alt-theory-app/web-server/tsconfig.json` | tsx 直接运行 TS，无需 tsconfig |

---

## 6. 已知问题（不阻塞 MVP）

| 问题 | 说明 | 来源 |
|---|---|---|
| KB 目录为空 | `assets/kb/` 无文件，agent 的 read/grep 工具搜索无结果 | Phase 1 遗留 |
| Prompt 占位符 | v0.6 prompt 有 `<context>[Insert retrieved KB results]</context>` 未替换 | Phase 1 遗留 |
| Context prefix 用户可见 | KB 切换注入的 `[Context: Search in ./assets/kb/urban/...]` 前缀在用户复制消息时可见 | Plan 已知，Roadmap R6 |
| Profile 切换无即时效果 | 切换 profile 只更新 serverState，当前 session 的 system prompt 不变 | Plan 已知，§5.5 |
| 未映射的事件 | `compaction_*`, `auto_retry_*`, `queue_update`, `thinking_*` 前端不会显示 | MVP 简化，Roadmap R1 |
| Windows 后台启动问题 | `Start-Process` 方式启动 tsx 不稳定，需用 `cmd /c` 间接启动 | 开发环境问题，不影响生产 |

---

## 7. 建议给 Design Agent 的 Spec 更新

以下基于 Phase 3 实现发现，建议更新 spec：

### 7.1 Spec §7.3 事件映射表

`agent_end` 行需更新：

**当前**：
```
| agent_end (success) | run_completed | 运行成功 |
| agent_end (error)   | run_failed    | 运行失败 |
```

**建议改为**：
```
| agent_end | run_completed 或 run_failed | 检查 session.state.errorMessage 判断。有错误 → run_failed，无错误 → run_completed |
```

### 7.2 Spec §7.1 架构补充

建议添加运行指令说明：
```
运行方式：从项目根目录执行 `npx tsx alt-theory-app/web-server/server.ts`
不需要 web-server 有独立 package.json
```

### 7.3 Roadmap 提醒确认

Phase 3 plan 的 R1-R6 路线图提醒仍然有效，优先级无需调整：
- R1 (EventMapper) 的触发条件 "server.ts 事件映射 switch 超过 10 个 case" 尚未达到（当前 6 个 case）
- R3 (多 session) 的 `new_session` handler 已实现基础版本，`sessionId` 在 `SessionSnapshot` 中已传递
- R6 (隐藏注入) 仍是 context prefix 方案，用户可见

### 7.4 PI SDK 事件类型参考

建议在 spec 附录中添加 §3 的完整事件类型列表，供后续开发者参考（当前 spec 未包含 `AgentSessionEvent` 的具体字段定义）。

---

*Report generated: 2026-04-26*
*Phase 3 status: Complete, ready for merge to main*
