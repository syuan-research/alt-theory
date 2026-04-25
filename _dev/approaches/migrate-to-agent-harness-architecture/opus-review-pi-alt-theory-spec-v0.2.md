# Opus Review: pi-alt-theory-spec-v0.2.md

---
created: 20260425
reviewer: Claude Opus 4.6
status: review complete
---

## 总体评价

V0.2 已整合 v0.1 review 的所有关键意见，结构清晰，决策有据可查。**可以进入 dev 阶段**，但有 3 个问题需要在 dev 开始前或 Phase 1.2 时明确。

---

## 1. 新发现：打包方案已可确定（不需要等 Gemini）

**当前 spec 状态**：Phase 4 写"等 Gemini 研究结果才能确定打包方案"。

**现在已知**：
- Bun compile：排除（`__dirname` 路径固化问题，2026 年 4 月仍未修复）
- Node SEA：可行但需要 hack（PI SDK 有 3 个原生模块：clipboard、koffi、canvas，需启动时解压到临时目录）
- Electron：**已验证可行**，pi-gui（84 star）和 pi-agent-dashboard（公司背书）都已成功打包 PI SDK

**建议**：Phase 4 直接写"选择 Electron"，删除"等 Gemini 研究结果"的表述。

**Electron 方案细节**（可加入 spec）：
- 参考 pi-gui 的 `packages/pi-sdk-driver` 层（适配 PI SDK 的接口层）
- 参考 pi-agent-dashboard 的 Electron standalone mode（自动捆绑 Node.js + 安装向导逻辑）
- 打包体积预估：80–150 MB
- assets/（kb、profiles、sessions）放 `%APPDATA%/AltTheory/`，避免 Windows 权限问题（已在脆弱点 11 中提到，打包时落实）

---

## 2. System Prompt 顺序有一个逻辑矛盾

**当前 spec 第 8.1 节**：

```
[Block 1] PI 原生 system prompt（自动注入，含工具说明）
[Block 2] AGENTS.md 内容
[Block 3] KB 路径声明
[Block 4] Available tools 列表（PI 自动注入）
[Block 5] Skills 名称列表（PI 自动注入）
[Block 6] User Profile（放最后，可变内容）
```

**矛盾**：`appendSystemPromptOverride` 的语义是"追加到 PI 默认 system prompt 后"。如果 PI 自动注入 Block 1 在前，你追加 Block 2+3+6，那么 Block 4+5（PI 自动注入的 tools 列表）在哪里？

可能的实际顺序：
```
[PI 自动] Block 1（原生 system prompt）
[PI 自动] Block 4（tools 列表）
[PI 自动] Block 5（skills 列表）
[你追加] Block 2（AGENTS.md）
[你追加] Block 3（KB 路径声明）
[你追加] Block 6（User Profile）
```

如果是这个顺序，prompt caching 的分析仍然成立（可变内容 Block 6 在最后），但 AGENTS.md 在 tools 列表之后，可能影响 agent 对工具使用的优先级判断。

**这是 Phase 1.2 必须验证的事**，不是假设。建议在 spec 的验证项里加一条：
> 打印完整 system prompt，确认 Block 顺序，特别是 AGENTS.md 相对于 tools 列表的位置。

---

## 3. WebSocket 协议定义时机需要明确

**当前 spec**：WebSocket 协议在 Phase 3B 开始前定义。

**问题**：spec 里已经有了协议草稿（第 9.4 节的 `ClientMessage` / `ServerMessage`），但这个草稿是基于假设写的，没有参考 PI SDK 的实际事件格式。

PI SDK 的事件类型（streaming tokens、tool calls、errors）决定了 `ServerMessage` 的实际结构。如果 Phase 3B 开始时才发现协议草稿和 PI SDK 实际格式不匹配，需要返工。

**建议**：在 Phase 1.5（Question Classifier 验证）完成后，design session 花半天 clone pi-gui，看它的 `pi-sdk-driver` 如何处理 PI SDK 事件，然后更新 spec 里的 WebSocket 协议定义，再开始 Phase 3B。

这个建议已在对话中确认，建议在 spec 的 Phase 3B 启动条件里明确写出：
> **3B 启动前置条件**：clone pi-gui，验证 PI SDK 事件格式，更新 WebSocket 协议定义。

---

## 4. 一个小问题：文件头版本号未更新

`pi-alt-theory-spec-v0.2.md` 第 1 行写的是 `# Alt Theory on PI — Executable Spec (v0.1-draft)`，应该是 `v0.2`。

---

## 优先级总结

| 优先级 | 问题 | 建议行动 |
|--------|------|----------|
| P0（dev 前） | Phase 4 打包方案已可确定 | 删除"等 Gemini"，写入"选择 Electron，参考 pi-gui" |
| P0（Phase 1.2） | System prompt 实际顺序未知 | 打印完整 system prompt，确认 Block 顺序 |
| P1（Phase 1.5 后） | WebSocket 协议需基于 PI SDK 实际事件格式 | clone pi-gui，更新协议定义，再开始 3B |
| 低（随手） | 文件头版本号 v0.1-draft → v0.2 | 改一行 |

---

## 结论

**V0.2 可以交给 dev session 开始 Phase 1**。上面的 P0 问题可以在 dev 开始的同时由 design session 更新 spec，不阻塞 Phase 1.1 和 1.2。

*Review by Opus 4.6, 20260425*
