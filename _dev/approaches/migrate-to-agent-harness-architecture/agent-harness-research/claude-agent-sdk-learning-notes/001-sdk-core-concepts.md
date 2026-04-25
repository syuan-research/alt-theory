# Claude Agent SDK 核心概念学习笔记

**学习目标**: 理解 Claude Agent SDK 的架构和机制，为 Alt Theory 未来可能的迁移做准备。

**状态**: 预学习阶段 — 不涉及设计决策。

---

## 1. SDK vs Claude Code 关系

**核心洞察**: Claude Code 和 Claude Agent SDK 共享相同底层架构。

**待确认**: 这个"共享架构"的具体含义是什么？二进制相同？协议相同？

---

## 2. Session 管理

### 存储位置

```
~/.claude/projects/<sanitized-cwd>/<session-uuid>.jsonl
```

或 `$CLAUDE_CONFIG_DIR/projects/`（如果设置了环境变量）。

### 格式

**JSONL**（每行一个 JSON 对象）：

```json
{"type": "user", "uuid": "...", "parentUuid": null, "sessionId": "...", "message": {...}, "timestamp": "..."}
{"type": "assistant", "uuid": "...", "parentUuid": "...", "sessionId": "...", "message": {...}, "timestamp": "..."}
```

### Resume 机制

```python
# ClaudeAgentOptions 中的相关字段
ClaudeAgentOptions(
    resume="previous-session-uuid",  # 恢复指定 session
    session_id="custom-id",           # 自定义 session ID
    fork_session=True,                # 从 resume 的 session fork 新分支
)
```

底层：传递 `--resume`, `--session-id`, `--fork-session` 给 Claude Code CLI subprocess。

### Session 内容

- 对话历史（user/assistant 消息链）
- 元数据：`customTitle`, `aiTitle`, `summary`, `gitBranch`, `cwd`, `tag`
- 标记：`isSidechain`, `isMeta`, `isCompactSummary`

---

## 3. Agent 定义方式

### 两种等价方式

**文件系统** (`.claude/agents/*.md`):
```yaml
---
name: agent-name
description: ...
tools: Read, Grep
---
# Agent system prompt here
```

**程序化** (`AgentDefinition`):
```python
AgentDefinition(
    description="...",
    prompt="...",  # 等价于 markdown body
    tools=["Read", "Grep"]
)
```

### 加载优先级

1. 程序化 `agents={...}` 覆盖文件系统
2. `setting_sources=["project"]` 加载 `.claude/agents/*.md`

### AgentDefinition.memory 字段

**关键发现**: `memory` 不是"记忆"，而是**配置来源范围**。

```python
AgentDefinition(
    description="...",
    prompt="...",
    memory="project",  # 不是"记忆"，而是配置范围
)
```

| 值 | 含义 | 对应路径 |
|----|------|----------|
| `"user"` | 全局用户配置 | `~/.claude/settings.json` |
| `"project"` | 项目级配置（共享） | `.claude/settings.json` + `CLAUDE.md` |
| `"local"` | 本地配置（gitignore） | `.claude/settings.local.json` |

**这和 `setting_sources` 是同一套概念**：指定 subagent 从哪里读取配置。

---

## 4. 配置加载 (setting_sources)

| 值 | 加载内容 |
|----|----------|
| `None` (默认) | 不加载任何文件系统配置（完全隔离） |
| `["user"]` | `~/.claude/settings.json` |
| `["project"]` | `.claude/settings.json` + `CLAUDE.md` |
| `["local"]` | `.claude/settings.local.json` |

**关键**: SDK 默认隔离，必须显式指定才能加载 CLAUDE.md。

---

## 5. MCP Server

### 两种实现方式

**External (stdio/SSE/HTTP)**:
```python
mcp_servers={
    "rag": {
        "type": "stdio",
        "command": "python",
        "args": ["-m", "mcp_server.server"]
    }
}
```

**In-Process (SDK MCP)**:
```python
@tool("search", "Search KB", {"query": str})
async def search(args):
    return {"content": [...]}

server = create_sdk_mcp_server(name="kb", tools=[search])
mcp_servers={"kb": server}
```

### 差异

| 方案 | 优点 | 缺点 |
|------|------|------|
| External | 进程隔离；可复用 | 需要子进程；IPC 开销 |
| In-Process | 无子进程；性能好 | 只服务于当前 app |

---

## 6. Hooks

### Hooks 可访问的数据

`BaseHookInput` 提供给所有 hooks：

```python
{
    "session_id": str,           # 当前 session ID
    "transcript_path": str,      # transcript 文件路径
    "cwd": str,                  # 当前工作目录
    "permission_mode": str,      # 权限模式
}
```

### Hook 事件

| 事件 | 触发时机 |
|------|----------|
| `PreToolUse` | 工具执行前 |
| `PostToolUse` | 工具执行后 |
| `UserPromptSubmit` | 用户提交 prompt |
| `SubagentStart` / `SubagentStop` | Subagent 开始/停止 |
| `PermissionRequest` | 需要权限决策 |

### 注入上下文 (additionalContext)

```python
async def inject_context(input_data, tool_use_id, context):
    return {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "你的上下文内容",
        }
    }
```

### 读取外部状态

Hooks 是普通 async Python 函数，可以：
- 读取文件（JSON, YAML, markdown）
- 访问数据库
- 调用 API
- 读取 `transcript_path` 分析对话历史

### 实现"每 N 轮注入"模式

```python
from collections import defaultdict

session_turn_counts = defaultdict(int)

async def periodic_reminder(input_data, tool_use_id, context):
    session_id = input_data["session_id"]
    session_turn_counts[session_id] += 1

    if session_turn_counts[session_id] % 3 == 0:
        # 读取用户特点文件
        profile = json.load(open("user_profile.json"))
        reminder = f"用户特点：{profile['traits']}"

        return {
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": reminder,
            }
        }
    return {}
```

**注册**:
```python
options = ClaudeAgentOptions(
    hooks={
        "UserPromptSubmit": [HookMatcher(hooks=[periodic_reminder])]
    }
)
```

---

## 7. Permissions vs Hooks

| 机制 | 形式 | 用途 |
|------|------|------|
| Permissions | 声明式 | 静态权限控制 |
| Hooks | 程序化 | 动态行为拦截 |

```json
{
  "permissions": {
    "allow": ["Bash(python -m pytest tests/)"]
  },
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{"type": "command", "command": "ruff check..."}]
    }]
  }
}
```

---

## 8. TodoWrite 工具

### 定义

```python
# Input
{
    "todos": [
        {
            "content": str,
            "status": "pending" | "in_progress" | "completed",
            "activeForm": str,
        }
    ]
}

# Output
{
    "message": str,
    "stats": {"total": int, "pending": int, "in_progress": int, "completed": int},
}
```

### 关键发现

**TodoWrite 是纯工具**，没有内置的 hook/reminder 机制。

用户提到的"OpenCode todo 会变成 hook 提醒"——这是 OpenCode 自己实现的行为，不是 SDK 原生功能。

**实现类似功能**：需要在 Hook 中读取 TodoWrite 的输出（或独立的 todo 文件），然后注入 `additionalContext`。

---

## 9. Commands (Slash Commands)

`.claude/commands/*.md` 定义斜杠命令：

```yaml
---
allowed-tools: Bash(git commit:*)
description: Create a git commit
---

## Context
- Current git status: !`git status`

## Your task
Create a single git commit.
```

**机制**: `/commit` → 加载 template → 执行 `!`command`` 并插入结果。

---

## 架构图

```
ClaudeAgentOptions
├── system_prompt          # 主 agent 的 system prompt
├── setting_sources        # 加载哪些文件系统配置
│   ├── ["project"]        # → .claude/settings.json + CLAUDE.md
│   └── None (default)     # → 完全程序化
├── agents                 # subagent 定义
│   ├── 程序化: {"name": AgentDefinition(...)}
│   └── 文件: setting_sources=["project"] + .claude/agents/*.md
├── mcp_servers            # MCP servers
│   ├── external: {"name": {type: "stdio", ...}}
│   └── in-process: create_sdk_mcp_server(...)
├── hooks                  # 行为拦截器
│   └── {"UserPromptSubmit": [HookMatcher(...)]}
└── allowed_tools          # 权限白名单

Session 存储
└── ~/.claude/projects/<cwd>/<uuid>.jsonl
    ├── 对话历史
    ├── 元数据 (title, summary, tag)
    └── Hooks 可通过 transcript_path 访问
```

---

## 已回答的问题

### Q1: Session 内部实现
- 存储位置：`~/.claude/projects/<cwd-hash>/<uuid>.jsonl`
- 格式：JSONL
- Resume：`ClaudeAgentOptions(resume=uuid)`
- Hooks 可访问：`session_id` + `transcript_path`

### Q2: Hooks 能否访问外部状态
- 可以读取任意文件、数据库、API
- 可以用 closure 或外部存储跟踪状态（如轮数）
- `additionalContext` 注入上下文给 Agent

### Q5: 提示词注入的现有例子
- `examples/hooks.py` 中的 `add_custom_instructions` 函数
- 支持 `SessionStart`, `UserPromptSubmit`, `PreToolUse` 等事件

### Q3: AgentDefinition.memory 字段
- 不是"记忆"，是"配置来源范围"
- 和 `setting_sources` 同一概念：`"user"` / `"project"` / `"local"`
- SDK 没有内置用户特点记忆机制

---

## 待探索问题

**Q4**: In-process vs External MCP 的实际性能差异？

**Q6**: Subagent 失败时，主 agent 的错误感知机制？

---

## 实现用户特点记忆的路径

**SDK 没有内置此功能**，需要自行实现：

```
用户特点文件 (user_profile.json)
         ↓
Hook 读取 + 轮数跟踪
         ↓
additionalContext 注入
         ↓
Agent 接收上下文
```

**示例**：
```python
# user_profile.json
{"traits": ["喜欢简洁", "偏好代码示例"], "level": "进阶"}

# Hook 实现
async def inject_user_profile(input_data, tool_use_id, context):
    turn_count = get_turn_count(input_data["session_id"])
    if turn_count % 3 == 0:  # 每 3 轮注入
        profile = json.load(open("user_profile.json"))
        return {
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": f"用户特点：{profile['traits']}"
            }
        }
    return {}
```

---

## 下一步

基于以上理解，可以探索：
1. 用户特点文件的结构设计
2. Hook 中如何分析 transcript 判断何时注入
3. Agent team 的具体实现模式