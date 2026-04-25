# 采用度

- **PI (badlogic/pi-mono)**：目前公开已知的主要用户是 OpenClaw。OpenClaw 直接将 PI 的 `pi-agent-core` 嵌入其消息网关，通过 `createAgentSession()` 启动 AI 编码代理【31†L153-L161】。除 OpenClaw 外，暂无公开报道其他公司或项目在生产环境中使用 PI 的资料。

- **Claude Agent SDK**：Anthropic 官方产品之外，已有多个第三方集成案例。例如，微软 VS Code Copilot 的文档指出在 VS Code 中提供了“Claude agent sessions”，其“由 Anthropic 的 Claude Agent SDK 驱动”【22†L9-L12】。JetBrains 也在 2025 年发布的公告中提到，其 IDE 内置的 Claude Agent 功能“构建于 Claude Agent SDK”之上【25†L111-L119】。

- **OpenCode SDK**：该 SDK 主要由 OpenCode 自身产品（如 OpenCode CLI/Web/App）使用。社区项目方面，有开发者为 Vercel AI SDK 创建了 OpenCode 提供者，通过 `@opencode-ai/sdk` 调用 OpenCode 服务【28†L276-L284】。目前尚无公开报道其他公司在生产环境中使用该 SDK。  

# 技术差异

## 架构与集成方式

- **PI**：PI 是一个 TypeScript 单体仓库，包含多包结构。核心组件是 `@mariozechner/pi-agent-core`（Agent 运行时、工具调用和事件循环）以及 `@mariozechner/pi-coding-agent`（内置工具和会话管理的 CLI 代理）【31†L179-L183】。集成方式为代码嵌入：其他应用可通过 `createAgentSession()` 等 API 导入并启动 PI 代理，整个 Agent 在同一进程内运行【31†L153-L161】。PI 的架构极简，设计为用户可直接编程配置模型、工具和提示。

- **Claude Agent SDK**：这是 Anthropic 提供的闭源 SDK（前称 Claude Code SDK），支持 Python 和 TypeScript。它内嵌了 Claude Code 的代理循环和工具系统，启动时会加载一个可执行的 Claude Code 二进制。开发者通过调用 SDK 提供的 `query()`（或 `run()`）接口创建 Agent 实例【39†L123-L132】。该 Agent 运行在宿主进程或子进程中，提供完整的会话管理和工具调用。集成方式为以库形式引入：比如在代码中 `import { query } from "@anthropic-ai/claude-agent-sdk"`，设置提示和选项后开始交互。SDK 也支持通过插件或 CLI 交互等方式嵌入到 IDE/应用中（如 VS Code、JetBrains 插件等）。

- **OpenCode SDK**：这是 OpenCode 官方的 JS/TS 客户端，用于与 OpenCode 后端交互【27†L119-L127】。调用时通常先执行 `createOpencode()` 启动并连接到本地或远程 OpenCode 服务，然后通过返回的 `client` 调用各种 API（会话、文件、事件等）。因此架构上分为前端 SDK 和后台服务两部分：SDK 只是一个 HTTP 客户端；实际代理逻辑运行在 OpenCode 服务器或 CLI 进程中。开发者可在任意 JS/TS 应用中引用 SDK，或通过 CLI/命令行方式启动 agent；二者通过网络请求通讯。

## 扩展机制

- **PI**：PI 的扩展方式以“工具和插件”驱动。用户可以通过编程定义任意工具（遵循 AgentTool 接口）并注入到 `pi-agent-core` 中【3†L445-L453】【46†L49-L53】。此外，PI 支持自定义 TUI 组件和“扩展”(extensions)，允许在会话中持久化状态（如分支、热加载代码等）【46†L49-L53】【46†L101-L110】。Armin Ronacher 指出，PI 的哲学是让代理通过“编写代码”自我扩展，而不是依赖闭源技能：尽管可以下载或编写扩展，但更鼓励用户让代理自行改写/加载工具【46†L68-L77】【46†L102-L110】。PI 内置仅最基础工具（读、写、编辑、bash）；其他高级功能如 MCP 需要用户自行实现或通过外部工具辅助。

- **Claude Agent SDK**：提供了丰富的扩展机制。开发者可以编写自定义“插件”（钩子函数）拦截 Agent 生命周期的各个事件（如调用工具前后）【40†L31-L34】。SDK 支持将外部服务作为 *MCP* 服务器接入（例如 Anthropic 官方示例中有 Playwright 浏览器自动化 MCP）【40†L13-L21】。此外，支持 `Agent` 和 `Skill` 等内置工具：用户可在选项中启用 `"Skill"` 工具，然后放置 SKILL.md 文件，Claude 会在适当时机自动加载这些技能【41†L126-L134】【41†L135-L143】。系统提示可通过代码配置和空间嵌入（.claude/配置目录）动态修改。总之，Claude SDK 允许程序化地定义和扩展工具、子代理、插件、以及通过 MCP 访问任意外部服务【40†L13-L21】【41†L126-L134】。

- **OpenCode SDK**：扩展点主要包括“插件”和“技能”。OpenCode 支持通过 `.opencode/plugins/` 目录或配置文件加载自定义插件【49†L113-L122】【49†L179-L188】。插件可以监听内置事件（如工具执行前后）并改变行为，如注入环境变量、记录日志、实现编译钩子等【49†L208-L227】。此外，OpenCode 支持类似 Claude 的 SKILL.md 机制：在项目或全局配置下放置 `.opencode/skills/<name>/SKILL.md`，代理即可通过内置 `skill` 工具按需加载这些技能指令【48†L95-L104】【48†L203-L212】。工具系统本身可以配置（`.opencode/tools`），且支持添加自定义工具或接入第三方工具。MCP 机制上，OpenCode 有专门配置（`mcp` 节点）允许定义本地或远程 MCP 服务器，并将其加入代理上下文【50†L103-L112】【50†L127-L136】。总之，OpenCode 用户可以通过插件、技能文件和配置文件灵活扩展代理能力。

## 多 Agent / 子 Agent 支持

- **PI**：设计上不提供内建的子代理（subagent）或多代理框架。正如 PI 创始人所述，“pi 没有专门的子代理工具”【34†L13-L21】。如果需要让 PI 启动子任务，通常需要用户在提示中手动调用代码或命令行启动新会话。例如可以编写自定义 slash 命令让代理自行复刻自身（spawn）作为子代理。因无独立子代理体系，PI 的上下文隔离和并行化能力有限，所有操作都在单一会话中完成；用户可以利用会话分支和持久化等功能弥补这一不足【46†L49-L53】【46†L101-L110】。

- **Claude Agent SDK**：内置对子代理的全面支持。用户可在 `query()` 调用的选项中通过 `agents` 参数定义多个子代理，每个子代理都有独立的提示和工具集【37†L131-L139】。主代理会根据描述自动调用或用户指令触发子代理，且不同子代理可并行运行【37†L155-L164】。每个子代理拥有独立会话，上下文隔离，完成后返回摘要给主代理【37†L151-L160】。此外，Claude Code 及 SDK 在 2026 年引入了“Agent Teams”概念，允许多个模型同时协作（例如一个负责人代理 spawn 多个并行工作者），OpenCode 社区已有类似实现【44†L55-L59】。因此 Claude 生态支持多代理并行和层级子代理模型。

- **OpenCode SDK**：本身支持多代理协作（Agent Teams）。OpenCode 社区在 2026 年发布了“Agent Teams”功能，使一个“负责人”代理可以 spawn 多个同级代理，各自拥有独立的会话上下文并通过消息总线（inbox 文件+会话注入）进行通信【44†L55-L59】【44†L64-L72】。这些代理间可以并行工作、互相交流任务，且支持跨模型（多供应商）协同。此架构与 Claude Code 的多代理类似，但 OpenCode 采用同进程消息注入方式，无需文件轮询【44†L69-L78】。总结来说，OpenCode 原生支持构建代理团队并行解决问题。

## MCP 和 Skill 支持

- **PI**：没有原生 MCP 支持（Model-Connected Protocol）。如 Armin 所述，PI 核心不内置 MCP；如果需要，可通过外部工具（如开源的 mcporter）自行集成【46†L68-L77】。PI 也不使用 Claude 式的 “Skill” 机制；它的扩展更多依赖编程工具和环境。  

- **Claude Agent SDK**：全面支持 MCP 和 Skills。通过配置，用户可将任意外部 MCP 服务（如 GitHub、浏览器、数据库等自动化接口）接入代理环境【40†L13-L21】。技术上，SDK 可启动和管理 MCP 服务器（本地或远程）并将工具调用透传给它们。Skill 方面，Claude Agent SDK 加载和识别 `.claude/skills/` 下的 SKILL.md 文件，开发者只需将 `"Skill"` 加入 `allowed_tools`，Claude 会在合适时机主动调用这些技能【41†L126-L134】【41†L135-L143】。Skills 可以包含自定义脚本、说明和示例，用于扩展代理的高阶功能。  

- **OpenCode SDK**：同样支持 MCP 和 Skills。配置文件中 `mcp` 部分允许用户添加本地或远程 MCP 服务器，一旦启用，代理即可直接调用这些服务【50†L103-L112】【50†L127-L136】。OpenCode 的 Skills 机制与 Claude 类似：`.opencode/skills/`（或兼容路径）中的 SKILL.md 会被自动发现，代理通过内置的 `skill` 工具按需加载并执行这些指令【48†L95-L104】【48†L203-L212】。总之，OpenCode 可以无缝集成外部服务（MCP）和自定义技能，通过工具链大幅扩展代理能力。  

**参考资料：** PI 官方仓库及文档【31†L179-L183】【46†L49-L53】；OpenClaw 与 PI 集成说明【31†L153-L161】；Claude Agent SDK 文档【37†L155-L164】【41†L126-L134】；JetBrains 官方公告【25†L111-L119】；VS Code 文档【22†L9-L12】；OpenCode 官方文档【27†L119-L127】【48†L95-L104】；社区项目代码【28†L276-L284】【44†L55-L59】等。