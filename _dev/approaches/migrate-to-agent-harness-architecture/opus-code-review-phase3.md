# Opus Code Review: Phase 3 Implementation

---
created: 20260426
reviewer: Claude Opus 4.6
scope: server.ts, websocket-protocol.ts, client.js, index.html, style.css
---

## 总体评价

代码质量明显高于预期（考虑到是 GLM 产出）。结构清晰，命名规范，与 spec v0.6 高度一致。主要问题集中在安全性和几个边缘情况，没有架构级别的问题。

---

## 1. 代码正确性

### 1.1 `new_session` 的 subscribe 闭包问题（中等风险）

`server.ts:92` 的 `unsubscribe` 是在第一次 session 创建时绑定的：
```typescript
const unsubscribe = session.subscribe(...)
```

`new_session` handler（line 188-201）调用了 `unsubscribe()` 取消旧订阅，然后重新赋值 `session`。但新 session 没有重新调用 `subscribe()`——新 session 的事件不会被转发到 WebSocket。

用户点击"New Session"后，新对话的流式文字不会显示在前端。

**修复**：`new_session` handler 里需要重新订阅：
```typescript
case "new_session": {
  unsubscribe();
  // ... 创建新 session ...
  // 重新订阅新 session 的事件
  // 但 unsubscribe 是 const，需要改为 let
  break;
}
```

`unsubscribe` 需要改为 `let unsubscribe`，在 `new_session` 时重新赋值。

### 1.2 `tool_finished` 把 `output` 发给前端（低风险）

`server.ts:127`：
```typescript
payload: { callId: event.toolCallId, success: !event.isError, output: event.result }
```

spec §7.2 和 plan 都明确说"不传 output"（原始工具输出不发给前端）。这里传了 `event.result`，包含原始文件内容。

前端 `client.js` 没有使用 `output` 字段，所以用户看不到，但数据在网络上传输了，浪费带宽，且调试时容易误导。

**修复**：删除 `output: event.result`，或改为 `output: undefined`。

### 1.3 `serverState` 是全局单例（设计问题，MVP 可接受）

`server.ts:42` 的 `serverState` 是模块级变量，所有 WebSocket 连接共享。如果两个浏览器标签同时打开，切换 KB 会影响另一个标签的下一条消息。

MVP 阶段单用户可以接受，但需要记录。

---

## 2. 安全性

### 2.1 JSON parse 有校验（已处理）

`server.ts:149-153` 有 try/catch，JSON 解析失败会返回 error 消息。✅

### 2.2 `msg.payload` 无类型校验（低风险）

```typescript
msg = JSON.parse(data.toString()) as ClientMessage;
```

TypeScript 的 `as` 是编译时断言，运行时不做任何检查。如果客户端发来 `{ type: "switch_kb", payload: null }`，`msg.payload.domain` 会抛 `TypeError: Cannot read properties of null`，导致 WebSocket 连接崩溃。

MVP 阶段（本地使用，自己控制客户端）可以接受，但如果未来暴露给外部用户需要加校验。

### 2.3 XSS 风险（前端，低风险）

`client.js:76`：
```javascript
currentAssistantEl.textContent += msg.payload.text;
```

用的是 `textContent`（不是 `innerHTML`），不会执行 HTML。✅

但未来如果加 Markdown 渲染（`innerHTML`），需要用 DOMPurify 消毒。现在没有 Markdown 渲染，所以 agent 的 `**bold**` 会显示为原始文字，不是加粗。这是功能缺失，不是安全问题。

### 2.4 WebSocket 无鉴权（已知，MVP 可接受）

本地运行，无需鉴权。记录即可。

---

## 3. Spec 一致性

| Spec §7.2 定义 | 实际代码 | 一致？ |
|---|---|---|
| `tool_started` 不传 `input` | server.ts:107-111 ✅ 没有 input | ✅ |
| `tool_finished` 不传 `output` | server.ts:122-129 ❌ 传了 `output: event.result` | ❌ |
| `SessionSnapshot` 结构 | websocket-protocol.ts ✅ 完全一致 | ✅ |
| 端口 3000 | server.ts:216 ✅ | ✅ |
| `switch_kb` 不重建 session | server.ts:178-181 ✅ | ✅ |
| `agent_end` 用 `state.errorMessage` | server.ts:132-142 ✅ | ✅ |

唯一不一致：`tool_finished` 传了 `output`。

---

## 4. 生产准备度（记录，不阻塞 MVP）

| 缺失项 | 影响 |
|--------|------|
| Markdown 渲染 | Agent 回复的格式（**bold**、列表、代码块）显示为纯文本 |
| `compaction_started/ended` 未映射 | 上下文压缩时前端无反馈，用户以为卡死 |
| `serverState` 全局共享 | 多标签页互相干扰 |
| WebSocket 断线无重连 | 断线后需要刷新页面 |
| `[Context: ...]` 前缀用户可见 | 复制消息时看到内部 context |

---

## 5. 代码风格

**好的地方**：
- `send()` helper 封装了 `readyState` 检查，避免向已关闭连接发消息
- `snapshot()` helper 集中构建 `SessionSnapshot`，不重复
- `serverState` 集中管理（采纳了 deep review 的 P2 建议）
- 注释清晰，结构分层合理

**可改进**：
- `client.js:55`：`JSON.parse(event.data)` 没有 try/catch，服务器发来非法 JSON 会抛未捕获异常
- `style.css` 的 `@media (max-width: 768px)` 直接隐藏 sidebar，移动端无法访问 KB/Profile 设置

---

## 需要修复的问题

| 严重性 | 问题 | 位置 | 修复 |
|--------|------|------|------|
| P0 | `new_session` 后新 session 事件不转发 | server.ts:188 | `unsubscribe` 改 `let`，new_session 后重新 subscribe |
| P1 | `tool_finished` 传了 `output`（违反 spec） | server.ts:127 | 删除 `output: event.result` |
| P2 | 前端 `JSON.parse` 无 try/catch | client.js:55 | 加 try/catch |

P0 是功能 bug（new session 后前端无响应），需要在 merge 前修复。

---

*Code review by Opus 4.6, 20260426*
