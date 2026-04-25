## 研究任务：Agent Harness 三元对比 — PI vs Claude Agent SDK vs OpenCode SDK

### 概念定义（严格按此理解，避免搜索错误）

**1. PI** — `badlogic/pi-mono` (https://github.com/badlogic/pi-mono)
TypeScript monorepo，MIT license，作者 Mario Zechner。核心包：`pi-ai`（统一LLM API）、`pi-agent-core`（agent runtime）、`pi-coding-agent`（终端 coding agent）。
不是 Pydantic AI，不是数学常数。

**2. Claude Agent SDK** (https://code.claude.com/docs/en/agent-sdk/overview)
Anthropic 闭源框架（原名 Claude Code SDK）。提供 agent loop、built-in tools、subagents、MCP、hooks、plugins、SKILL.md progressive disclosure。
不是 Claude 模型本身，不是 Claude Code 终端应用。

**3. OpenCode SDK** — `@opencode-ai/sdk` (https://open-code.ai/docs/sdk)
OpenCode 的 JS/TS 客户端 SDK。API 覆盖 Global / App / Project / Sessions / Files / Events 等。
不是 OpenClaw，不是 Crush。

**4. OpenClaw** — `openclaw/openclaw` (https://github.com/openclaw/openclaw)
基于 PI 构建的个人 AI 助手（直接嵌入 `pi-agent-core`）。仅作为 PI 的采用案例提及。

---

### Q1: 采用度

三者在生产环境中的采用情况。要求给出具体项目名、GitHub repo 链接或公司名，不接受"许多开发者"等无法验证的说法。

- 除 OpenClaw 外，有哪些项目或公司在生产环境使用 PI（`pi-agent-core` 或 `pi-coding-agent`）？
- 除 Anthropic 自家产品外，有哪些第三方项目公开使用 Claude Agent SDK？
- OpenCode SDK 是否被 OpenCode 以外的项目或应用集成？

### Q2: 技术差异

- 三者的 agent runtime 架构各是什么？各自如何暴露给外部集成（如嵌入到另一个应用中）？
- 三者的扩展机制分别是什么？各自如何让用户扩展 agent 的行为和能力？
- 三者分别如何实现 multi-agent / subagent？
- 三者对 MCP 的支持情况分别是什么？

### 输出要求

- 每个事实标注来源 URL 和日期
- 如搜索结果与上述定义矛盾（如把 PI 当成 Pydantic AI，或混淆 Claude Agent SDK 与 Claude 模型），明确标注并纠正
- 优先使用 2026 年的数据
