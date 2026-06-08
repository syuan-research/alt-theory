# PI (pi-mono) Capabilities

---
created: 20260424
sources: https://github.com/badlogic/pi-mono, https://pi.dev/docs

## 官方文档存档

| 文件 | 来源 |
|------|------|
| [pi-sdk-doc.md](pi-sdk-doc.md) | [packages/coding-agent/docs/sdk.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md) — 完整 SDK 文档 |
| [pi-sdk-examples-readme.md](pi-sdk-examples-readme.md) | [packages/coding-agent/examples/sdk/README.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/README.md) — 13 个 SDK 示例 |
| [gemini-deep-research-prompt.md](gemini-deep-research-prompt.md) | Agent harness 三元对比研究提示词 |
---

## 概述

PI (badlogic/pi-mono) 是 TypeScript monorepo，MIT license，作者 Mario Zechner。
核心哲学："按需适配工作流，而非迫使工作流适配工具"——提供 primitives，不预设 features。

## 包结构

| 包 | 职责 |
|---|------|
| `pi-ai` | 统一多 provider LLM API（15+ providers, 数百个模型） |
| `pi-agent-core` | Agent runtime：stateful agent、tool execution、event streaming |
| `pi-coding-agent` | 终端 coding agent CLI + SDK 入口 |
| `pi-tui` | 终端 UI 库（差分渲染） |
| `pi-web-ui` | Web 组件库（AI chat interfaces） |

## SDK 核心 API

### createAgentSession()

主工厂函数，创建单个 AgentSession。

```typescript
import { createAgentSession, AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const { session } = await createAgentSession({ authStorage, modelRegistry });
```

### AgentSession 接口

```typescript
interface AgentSession {
  prompt(text: string, options?: PromptOptions): Promise<void>;
  steer(text: string): Promise<void>;       // 流式时中断
  followUp(text: string): Promise<void>;    // 流式完成后追加
  subscribe(listener: (event) => void): () => void;
  setModel(model: Model): Promise<void>;
  compact(customInstructions?: string): Promise<CompactionResult>;
  abort(): Promise<void>;
  dispose(): void;
  // state access
  agent: Agent;
  messages: AgentMessage[];
  isStreaming: boolean;
}
```

### createAgentSessionRuntime()

用于需要替换 active session 的场景（new / resume / fork / clone）。OpenClaw 等嵌入应用使用此层。

## 四种运行模式

| 模式 | 用途 | API |
|------|------|-----|
| **Interactive** | 完整 TUI 体验（开发/高级用户） | `InteractiveMode` |
| **Print/JSON** | 单次执行，输出结果后退出（脚本/自动化） | `runPrintMode()` |
| **RPC** | JSON-RPC over stdin/stdout（非 Node 集成） | `runRpcMode()` |
| **SDK** | 嵌入到其他应用（Web/桌面/移动） | `createAgentSession()` 直接使用 |

## 扩展机制

### Skills（SKILL.md progressive disclosure）

- 目录：`.pi/skills/*/SKILL.md` 或 `.agents/skills/`（从 cwd 向上到 git root 查找）
- 启动时只加载 name + description（~100 token）
- 模型判断相关时按需加载完整内容
- 与 Claude Code 的 `.claude/skills/` 机制概念相同

### Extensions（TypeScript modules）

- 发现路径：`~/.pi/agent/extensions/`、`.pi/extensions/`
- 能力：注册 tools、订阅事件（25+ 种）、添加 commands、状态持久化
- 事件示例：`agent_start`, `tool_execution_start/end`, `message_update`, `turn_start/end`
- 通过 `pi.registerTool()` / `pi.on()` 使用
- 工具覆盖：可注册同名工具覆盖内置行为

### Custom Tools

```typescript
import { defineTool, Type } from "@mariozechner/pi-coding-agent";

const myTool = defineTool({
  name: "my_tool",
  description: "Does something",
  parameters: Type.Object({ input: Type.String() }),
  execute: async (_id, params) => ({
    content: [{ type: "text", text: `Result: ${params.input}` }],
    details: {},
  }),
});
```

### Prompt Templates

- 文件型命令：`.pi/prompts/*.md`
- 用户输入 `/name` 时展开为 prompt content
- 支持 `!`command`` 嵌入（执行命令并插入结果）

## Context Files

- `AGENTS.md`：从 cwd 向上目录查找，项目级上下文
- `~/.pi/agent/AGENTS.md`：全局上下文
- 系统提示词由 AGENTS.md + 内置最小 system prompt 组成
- 可通过 `agentsFilesOverride` 编程注入虚拟上下文文件

## Session 管理

- 格式：tree-structured JSONL（每条记录有 id/parentId）
- 持久化：`SessionManager.create(cwd)` 写入 cwd 下的 session 文件
- 内存模式：`SessionManager.inMemory()`（测试用）
- 分支：`/fork`（从任意历史点分叉）、`/clone`（复制路径）
- 导航：`/tree` 浏览所有分支，跳转到任意点继续
- 导出：`/export`（HTML）、`/share`（GitHub gist + 可分享 URL）
- 压缩：`/compact`（自动摘要，保留文件操作轨迹）

## 模型支持

- 15+ providers：Anthropic, OpenAI, Google, Azure, Bedrock, Mistral, Groq, Cerebras, xAI, Hugging Face, Kimi, MiniMax, OpenRouter, Ollama 等
- 中途切换：`/model` 或 `Ctrl+L`，保留上下文
- 自定义 provider：通过 `models.json` 或 extension
- API key 优先级：runtime override → `auth.json` → 环境变量 → fallback resolver

## MCP 支持

- 通过 extension 实现（非原生内置）
- 有官方 MCP extension 示例：`examples/extensions/mcp/`
- 作者的哲学：用 CLI tools + README 的 skills 替代 MCP，但社区 extension 已覆盖 MCP 场景

## 多 Agent

- 无 built-in subagent
- 通过 `pi-subagents` extension 实现（spawn 独立 pi 进程）
- 或通过 tmux / 自行编排
- Extension 可配置不同模型给不同子 agent

## 内置 Tools

| 工具集 | 包含 |
|--------|------|
| `codingTools` | read, bash, edit, write |
| `readOnlyTools` | read, grep, find, ls |
| 单独引用 | `readTool`, `bashTool`, `editTool`, `writeTool`, `grepTool`, `findTool`, `lsTool` |

Custom cwd 需要 factory：`createCodingTools(cwd)` / `createReadTool(cwd)`。
