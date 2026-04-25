# Phase 1 Dev Execution Report

> **From:** Dev Agent (glm-5.1)
> **To:** Design Agent
> **Date:** 2026-04-25
> **Subject:** Phase 1 执行结果、偏差、发现

---

## 1. 执行结果总结

| Task | 状态 | 备注 |
|------|------|------|
| Task 1: API Key + 基础 PI Session | ✅ 完成 | provider 配置有曲折，见 §3 |
| Task 2: System Prompt 验证 | ✅ 已完成（design 阶段） | 无变更 |
| Task 3: Alt Theory Core 层 | ✅ 完成 | session 创建成功，system prompt 包含只读工具列表 |
| Task 4: AGENTS.md + Prompt 迁移 | ✅ 完成 | 已升级为 v0.6 清理版，prompt 路径已修正 |
| Task 5: Question Classifier 验证 | ✅ 通过 | Class 3 问候 + 4 Questions 正常，Class 1 回答正常，bash 工具正常 |

---

## 2. 与 Plan 的偏差

### 2.1 Core 层 API 修正（重要）

Plan 代码有 **3 个 bug**，已在实现中修正：

| Plan 原代码 | 问题 | 修正 |
|---|---|---|
| `createReadOnlyTools(kbDir)` / `createCodingTools(kbDir)` | 返回 `Tool[]`，但 `customTools?: ToolDefinition[]` 类型不匹配 | 改用 `noTools: "all"` + `tools: string[]` 工具名白名单 |
| `tools: toolDefinitions` | `CreateAgentSessionOptions.tools` 是 `string[]`（工具名白名单），不是 `ToolDefinition[]` | 改用 `tools: ["read", "ls", "grep", "find"]` |
| `const cwd = config.kbDir` | Plan 注释已标注这是 bug，cwd 应为 rootDir | 拆分 `rootDir` 和 `kbDir`，接口增加 `rootDir` 字段 |

**Core 层接口变更**（与 plan 不同）：
```typescript
export interface AltTheoryConfig {
  rootDir: string;    // ← 新增：session cwd
  kbDir: string;      // 工具搜索路径
  profilePath?: string;
  readOnly: boolean;
}
```

### 2.2 Prompt 文件升级为 v0.6

Plan 说从 `v0.51-draft` 迁移，但我们额外创建了 `v0.6` 清理版：
- 删除了所有 Dify `{{#...#}}` 模板变量
- `know_theo.md`：`{{#sys.query#}}` 和 `{{#1767283782533.output#}}` → `[Insert retrieved knowledge base results here]`
- `alt_theo.md`：`{{#17672879191100.output#}}` → 同上；修了 3 个拼写错误
- `tui/.pi/prompts/` 下的文件已同步更新为 v0.6
- `v0.51-draft/` 原文件未修改

### 2.3 Prompt 路径修正

AGENTS.md 原写 `Read prompts/know_theo.md`，实际文件在 `.pi/prompts/know_theo.md`。已修正为：
```markdown
- **Class 1** → Read [.pi/prompts/know_theo.md](.pi/prompts/know_theo.md)
- **Class 2** → Read [.pi/prompts/alt_theo.md](.pi/prompts/alt_theo.md)
```

### 2.4 Prompt 内容未适配 PI

v0.6 清理版只是删除了 Dify 变量，但 prompt 内的 `<context>[Insert retrieved KB results]</context>` 仍是占位符。PI agent 没有自动检索 KB 的机制（不像 Dify 有 retrieval node），需要：
- **选项 A**：通过 `--append-system-prompt` 注入 KB 搜索指引
- **选项 B**：依赖 RAG server（alt-theory-rag）作为 MCP tool
- **选项 C**：将 KB 内容作为 context file 放入 `.pi/` 目录

这是 **design decision**，需要 design agent 确定。

---

## 3. PI Provider 配置发现（新知识）

### 3.1 PI 内置 MiniMax Provider 结构

PI 的 `pi-ai` 包内置两个 MiniMax provider：

| Provider ID | Base URL | 协议 | Env Var |
|---|---|---|---|
| `minimax` | `api.minimax.io/anthropic` | Anthropic | `MINIMAX_API_KEY` |
| `minimax-cn` | `api.minimaxi.com/anthropic` | Anthropic | `MINIMAX_CN_API_KEY` |

两个都走 **Anthropic 协议**（不是 OpenAI）。

### 3.2 Coding Plan Key (`sk-cp-`)

用户的 `sk-cp-` key 是 MiniMax coding plan 专用。此 key 可用于 PI 内置的 `minimax-cn` provider（Anthropic 协议，`api.minimaxi.com/anthropic`）。与 opencode 的 `@ai-sdk/openai-compatible`（走 `/v1` OpenAI 协议）是同一 key 的不同接入方式。

**最终配置方案**：用户通过 `MINIMAX_CN_API_KEY` 环境变量配置了 `minimax-cn` 内置 provider，同时配置了 opencode-go provider，均可用。

### 3.3 models.json 自定义 Provider Schema

```json
{
  "providers": {
    "provider-name": {
      "api": "anthropic" | "openai",
      "baseUrl": "https://...",
      "apiKey": "ENV_VAR_NAME_OR_LITERAL",
      "models": [{ "id": "...", "name": "..." }]
    }
  }
}
```

`apiKey` 通过 `resolveConfigValue` 解析：先查 `process.env[value]`，找不到当字面量。以 `!` 开头则执行 shell 命令。

### 3.4 auth.json

位于 `~/.pi/agent/auth.json`，存储格式：
```json
{ "provider-id": { "apiKey": "literal-key" } }
```
不支持 env var 引用。推荐优先用 models.json 的 env var 方式。

### 3.5 settings.json

```json
{
  "defaultProvider": "provider-id",
  "defaultModel": "model-id",
  "lastChangelogVersion": "x.x.x"
}
```

---

## 4. 未完成 / 不确定项

| 项 | 状态 | 需要什么 |
|---|---|---|
| Core layer 运行验证 | ✅ 已通过 | session 创建成功，readOnly 工具列表正确 |
| KB 内容为空 | `kb/` 目录 0 文件 | 数据层问题，不在 Phase 1 范围 |
| Class 2 (alt_theo) 测试 | 未测 | 需要 KB 有数据才有意义 |
| Prompt 适配 PI | 占位符未替换 | Design decision：如何让 PI agent 获取 KB 内容 |
| `alt-theory-app/` 未入 git | `.gitignore` 白名单模式 | 需要更新 `.gitignore` 或决定何时纳入 |

---

## 5. 文件清单

### 新建文件
- `alt-theory-app/core/alt-theory-core.ts` — Core API
- `alt-theory-app/core/test-core.ts` — Core 测试脚本
- `alt-theory-app/tui/AGENTS.md` — Agent 上下文（v0.6 + 路径修正）
- `alt-theory-app/tui/.pi/prompts/know_theo.md` — v0.6 清理版
- `alt-theory-app/tui/.pi/prompts/alt_theo.md` — v0.6 清理版
- `alt-theory-app/tui/.pi/prompts/general.md` — v0.6 清理版
- `_dev/approaches/migrate-dify-prompts/v0.6/` — 完整 v0.6 prompt 备份
- `.env` — API key 配置（placeholder）
- `_dev/approaches/migrate-to-agent-harness-architecture/pi-test-setup.ts` — 基础测试

### 修改文件
- `package.json` — 添加 `"type": "module"` + `dotenv` 依赖

### PI 全局配置（非项目文件）
- `~/.pi/agent/settings.json` — `defaultProvider: "minimax-cn"`, `shellPath: "D:\\Program Files\\Git\\bin\\bash.exe"`
- `~/.pi/agent/models.json` — 自定义 provider `minimaxcn-coding-plan`（已创建，当前未使用）
- `~/.pi/agent/auth.json` — `{}`

---

## 6. Smoke Test 结果

### 6.1 Core Layer (`npx tsx alt-theory-app/core/test-core.ts`)

**✅ 通过**

- 首次失败：`createCodingToolDefinitions` 不是顶层导出
- 修正：改用 `tools: string[]` 白名单方案
- 修正后通过：session ID `019dc3d1-c0cb-727e-8da2-80a8b2b3e55a`，system prompt 只含 `read, ls, grep, find`

### 6.2 TUI 测试（手动）

**✅ 通过**

- **Class 3（问候）**：输入 "hi say hi" → 正确识别为 Class 3，简短问候 + 4 Questions
- **Class 1（知识检索）**：输入 "i want to know more about theories on that question" → 正确分类为 Class 1，尝试读取 know_theo.md（路径问题已修正），直接基于内部知识回答了 ART、SRT、Biophilia 等理论
- **AGENTS.md 加载**：Agent 知道自己是 "Alt Theory, an AI cognitive mentor for environmental psychology"
- **bash 工具**：配置 Git Bash 后正常工作

### 6.3 PowerShell 测试

**❌ 失败**

尝试将 PI 的 bash 工具切换为 PowerShell：
1. `settings.json` 的 `shellPath` 改为 `pwsh.exe`
2. `bash.js` 的工具描述从 "Bash command" 改为 "PowerShell command"
3. `promptSnippet` 从 `(ls, grep, find)` 改为 `(Get-ChildItem, Get-Content, Select-String)`

**结果**：LLM 正确生成了 PowerShell 语法（`Get-ChildItem`），命令执行不报错，但**无任何输出**（所有命令返回空）。原因未深入排查（可能是 pwsh 的 `-c` 参数行为、stdout 捕获、或 cwd 问题）。

**已回滚**：所有改动恢复为 Git Bash 方案。

**对产品的影响**：PI 的 bash 工具目前只支持 bash。Windows 用户需要安装 Git for Windows（或其他提供 bash.exe 的工具）。如果 Alt Theory 要支持无 Git 的用户，需要：
- 向 PI 上游提 feature request（bash tool 根据 shellPath 动态切换描述和语法）
- 或在 Alt Theory 层面通过 `customTools` 注册自定义的 PowerShell 工具（覆盖内置 bash）

---

## 7. 建议给 Design Agent 的下一步

1. **确定 KB 集成方式**：RAG MCP tool vs context file vs append-system-prompt？这决定 prompt 文件的最终形态
2. **Core layer 验证策略**：是否需要写 TS 测试还是直接用 PI TUI 验证？
3. **v0.6 prompt 二次审查**：占位符和检索指令需要适配 PI 的实际能力
4. **Phase 2 规划**：基于以上决定，规划 KB 数据导入 + prompt 最终适配
