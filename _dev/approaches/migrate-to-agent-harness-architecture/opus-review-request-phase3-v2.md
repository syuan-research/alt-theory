# Opus Review Request: Phase 3 Plan v2 + Spec v0.6

---
created: 20260425
purpose: 请 Opus review 更新后的 Phase 3 plan 和 spec v0.6
---

## 背景

上次 Opus 做了 deep review（`opus-deep-review-phase3-plan.md`），发现 P0-P3 共 9 个问题。

我们根据 review 修改了 plan 和 spec。请 review 修改后的版本，确认：
1. P0/P1 问题是否都已正确修复
2. 新引入的代码或设计是否有遗漏
3. 路线图提醒（R1-R5）是否完整记录

## 修改摘要

### Plan（`plans/2026-04-25-phase3.md`）

**P0 修复**：
- 加了 Step 2：验证 PI SDK API（subscribe/abort/prompt），dev agent 必须先查类型定义再写代码
- `session.prompt()` 加了 `.catch()` 错误捕获
- 补了 `switch_kb` 后端逻辑（更新 `serverState.currentDomain`，在 prompt 前注入 context prefix）

**P1 修复**：
- 加了 `websocket-protocol.ts`，定义 `SessionSnapshot`、`ClientMessage`、`ServerMessage`
- 删掉方案 A/B 选择，直接用 vanilla HTML + JS（决策已写死，dev agent 不做选择）
- WebSocket 共享 HTTP server，统一端口 3000

**P2/P3 → 路线图提醒**（不在 MVP 实现）：
- R1: EventMapper 抽象层
- R2: ServerState 正式化
- R3: 多 session 预留口
- R4: Profile 多条拼装
- R5: pi-web-ui 重新评估

### Spec（`pi-alt-theory-spec-v0.6.md`）

- §7.1 架构图：pi-web-ui → vanilla HTML + JS，附决策说明
- §7.2 协议：加了 `SessionSnapshot` 定义，`tool_started` 去掉 `input` 字段
- §5.4 隐藏注入：明确当前方案 + 未来可选
- §9 Opus 问题：Q2/Q3 标记已回答
- §3 核心决策表：加了 3 条新决策

## 请 Review 的文件

1. `plans/2026-04-25-phase3.md` — 更新后的完整 plan
2. `pi-alt-theory-spec-v0.6.md` — 更新后的完整 spec

## Review 要点

1. **P0/P1 修复是否到位**：还有没有会导致 dev session 卡住或返工的问题？
2. **plan 中的代码是否能直接执行**：dev agent（非高级模型）能否按 plan 写出可运行的代码，不需要自己做架构决策？
3. **路线图提醒是否完整**：有没有遗漏的上游约束或架构问题应该记录但没记录？
4. **spec 和 plan 的一致性**：两个文件是否矛盾？引用是否正确？

---

*Review request by spec designer, 20260425*
