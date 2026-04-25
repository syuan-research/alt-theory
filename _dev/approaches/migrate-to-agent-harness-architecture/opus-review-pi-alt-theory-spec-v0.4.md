# Opus Review: pi-alt-theory-spec-v0.4.md

---
created: 20260425
reviewer: Claude Opus 4.6
status: review complete
---

## 总体评价

V0.4 质量高。Phase 1 验证结果记录详细，前端研究报告扎实，WebSocket 协议设计有据可查。**可以进入全栈 MVP 开发**。以下是针对 spec 第 8 节 5 个问题的回答，加上我发现的额外问题。

---

## Q1: WebSocket 协议是否足够？

**结论：基本足够，但有 2 个遗漏需要补充。**

当前协议覆盖了核心流程。对照前端研究报告 §1.4 的 `AgentSessionEvent`，有两个事件值得暴露：

**1. `compaction_start/end`（建议加）**

PI 的 `/compact` 功能会在 context 接近上限时自动触发。如果前端不知道 compaction 正在发生，用户会看到 agent 长时间无响应，以为卡死了。

建议加：
```typescript
| { type: "compaction_started" }
| { type: "compaction_ended"; success: boolean }
```

**2. `auto_retry_start/end`（可选加）**

网络抖动时 PI 会自动重试。前端可以显示"正在重试..."提示，改善体验。MVP 阶段可以不加，但值得记录。

**`queue_update` 不需要暴露**：这是 PI 内部的 steering/followUp 队列，前端不需要感知。

**`turn_start/end` 不需要单独暴露**：已经被 `session_updated` 覆盖（参考 pi-gui 的映射逻辑）。

---

## Q2: pi-web-ui 接入方案

**结论：方案 B（绕过 pi-web-ui 事件系统，手动渲染）更可行。**

理由：

前端研究报告 §3.1 明确指出 pi-web-ui 假设"Agent 类直接在前端创建"，且使用 IndexedDB 存储。这两个假设与 Alt Theory 的架构（Node.js 后端 + 文件系统存储）根本冲突。

方案 A（facade）的问题：
- `Agent` 类不是简单的事件 emitter，它内部管理 LLM 调用、工具执行、session 状态。创建一个 facade 需要模拟整个 `Agent` 的状态机，工作量不亚于重写前端。
- pi-web-ui 的 `ChatPanel.setAgent()` 接受真实 `Agent` 实例，不是接口，无法注入 mock。

方案 B 的实际成本：
- 不用 `ChatPanel`，直接用 `MessageList` + `MessageEditor` 等底层组件（如果 pi-web-ui 暴露了这些）
- 或者完全不用 pi-web-ui，用 vanilla HTML + marked.js 渲染 markdown，成本约 200-300 行

**建议**：直接用 custom-web-ui（vanilla HTML），不要花时间在 pi-web-ui facade 上。理由：
- pi-web-ui 的高级功能（artifacts、attachments）Alt Theory 暂时不需要
- vanilla HTML 完全可控，不依赖 pi-web-ui 的版本更新
- 前端研究报告已经梳理了所有需要渲染的事件类型，实现成本明确

---

## Q3: Session 管理策略

**结论：MVP 阶段用单 session，但接口设计要为多 session 留口。**

单 session 的"切换 KB/Profile 需要重启 server 进程"这个描述不准确。正确的做法是：切换 KB/Profile = 创建新的 `AgentSession`（不是重启 server 进程）。server 进程持续运行，只是销毁旧 session、创建新 session。

**建议的 MVP session 管理**：
```
server 内存中维护一个 currentSession
收到 switch_kb / switch_profile / new_session → 销毁 currentSession，创建新 session
```

**为多 session 留口的方式**：`ClientMessage` 加一个可选的 `sessionId` 字段，MVP 阶段忽略它，未来多 session 时用它路由。

pi-gui 的多 session + SessionDriver 接口对 Alt Theory 来说过度设计。MVP 不需要。

---

## Q4: 前后端通信脆弱点

**WebSocket 断开恢复**：

PI 的 JSONL session 文件记录了完整对话历史。断开重连后，前端可以：
1. 重新连接 WebSocket
2. 发送 `{ type: "get_history" }` 请求
3. server 读取 JSONL 文件，返回历史消息

但 MVP 阶段可以更简单：断开就断开，用户刷新页面重新开始。JSONL 文件保留历史，用户可以通过"恢复会话"功能（未来）重新加载。

**用户刷新浏览器**：

session 状态在 server 内存中，刷新后丢失。MVP 阶段接受这个限制，在 UI 上加一行提示"刷新页面会丢失当前对话"即可。

**流式消息弱网**：

WebSocket 本身有重连机制。`assistant_delta` 是增量文本，断线重连后无法补发已发送的 delta。MVP 阶段不处理，接受部分消息丢失。

---

## Q5: Windows PowerShell 支持

**结论：方案 A（要求安装 Git for Windows）是短期最实际的方案。**

理由：
- 方案 B（自定义 PowerShell 工具）：PI 的 bash 工具不只是执行命令，还处理流式输出、超时、中断。重新实现一套 PowerShell 版本工作量大，且 Alt Theory 的核心功能（KB 搜索）不依赖 bash 工具，只用 read/grep/find。
- 方案 C（上游 feature request）：时间不可控。

**更重要的发现**：Alt Theory 的 KB 搜索用的是 `read/grep/find` 工具（只读工具白名单），不是 bash 工具。bash 工具只在 agent 需要执行命令时才用。对于 Alt Theory 的使用场景（学术 mentor），用户几乎不会触发 bash 工具。

**建议**：文档说明"需要 Git for Windows"，但在 UI 上不强制检测。如果用户没装 Git，只是 bash 工具不可用，其他功能正常。

---

## 额外发现：一个架构风险

**`SessionSnapshot` 类型未定义**

spec v0.4 的 WebSocket 协议中，`session_opened`、`session_updated`、`run_completed` 都返回 `SessionSnapshot`，但 spec 没有定义这个类型的内容。

前端需要知道 `SessionSnapshot` 包含什么才能渲染 UI（消息列表、session 状态、当前 KB/Profile 等）。

建议在 spec 或 `websocket-protocol.ts` 中明确定义：
```typescript
interface SessionSnapshot {
  sessionId: string;
  status: "idle" | "running" | "error";
  kbDir: string;
  profilePath?: string;
  messageCount: number;  // 或完整 messages 数组（MVP 阶段可以只传 count）
}
```

---

## 优先级总结

| 优先级 | 问题 | 建议行动 |
|--------|------|----------|
| P0（dev 前） | pi-web-ui facade 不可行 | 直接用 custom-web-ui（vanilla HTML） |
| P0（dev 前） | `SessionSnapshot` 类型未定义 | 在 websocket-protocol.ts 中定义 |
| P1（dev 中） | 加 `compaction_started/ended` 事件 | 避免用户以为 agent 卡死 |
| P2（MVP 后） | WebSocket 断开恢复 | MVP 接受丢失，未来加 get_history |
| 低 | PowerShell 支持 | 文档说明即可，不阻塞 |

---

## 结论

**V0.4 可以交给 dev session 开始全栈 MVP**。关键决策：

1. **前端用 vanilla HTML**，不用 pi-web-ui（facade 不可行，成本高于重写）
2. **MVP 用单 session**，接口预留 sessionId 字段
3. **WebSocket 协议加 compaction 事件**，定义 SessionSnapshot 类型

*Review by Opus 4.6, 20260425*
