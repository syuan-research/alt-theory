# Claude Code 开发者元工具

**核心洞察**: 这些不是"给项目用的功能"，而是**升级 Claude Code 自身能力**的工具。

---

## 三大元工具

### 1. agent-sdk-dev

**安装后 Claude Code 获得**：

| 新能力 | 说明 |
|--------|------|
| `/new-sdk-app` | 交互式创建 SDK 项目，自动验证 |
| `agent-sdk-verifier-py` | 验证 Python SDK 应用是否正确 |
| `agent-sdk-verifier-ts` | 验证 TypeScript SDK 应用 |

**验证内容**：
- SDK 安装和版本
- 环境配置（requirements.txt, tsconfig.json）
- 代码模式和最佳实践
- 安全检查（API key 不硬编码）
- 错误处理

**安装前 vs 安装后**：

| 安装前 | 安装后 |
|--------|--------|
| 我查 SDK 文档 | `/new-sdk-app` 直接创建项目 |
| 我学 `ClaudeAgentOptions`、hooks... | 验证 agent 自动检查 |
| 我猜最佳实践 | 验证报告告诉你问题 |

---

### 2. plugin-dev

**安装后 Claude Code 获得**：

| 组件 | 数量 | 说明 |
|------|------|------|
| **Command** | 1 | `/plugin-dev:create-plugin` — 8 阶段引导创建 |
| **Agents** | 3 | agent-creator, plugin-validator, skill-reviewer |
| **Skills** | 7 | hooks, MCP, structure, settings, commands, agents, skills |

**7 个 Skills 教 Claude Code**：

| Skill | 教什么 | 字数 |
|-------|--------|------|
| `hook-development` | 所有 hook 事件、prompt-based vs command-based、输出格式 | 1,619w |
| `mcp-integration` | stdio/SSE/HTTP/WebSocket 配置、认证模式 | 1,666w |
| `plugin-structure` | 目录结构、plugin.json、命名规范 | 1,619w |
| `plugin-settings` | .local.md 配置文件、YAML 解析 | 1,623w |
| `command-development` | slash command 格式、frontmatter | 1,535w |
| `agent-development` | agent 定义、description 写法、触发模式 | 1,438w |
| `skill-development` | progressive disclosure、写作风格 | 1,232w |

**总计**: ~11,000 字核心内容 + 10,000+ 字参考文档 + 12+ 示例 + 6 工具脚本

**安装前 vs 安装后**：

| 安装前 | 安装后 |
|--------|--------|
| 写 prompt 问 web Claude "怎么开发 plugin" | `/plugin-dev:create-plugin` |
| 查文档学 hooks 语法 | `hook-development` skill 已加载 |
| 猜 MCP 配置格式 | `mcp-integration` skill 已加载 |
| 手动测试 | `plugin-validator` agent 自动验证 |

---

### 3. hookify

**安装后 Claude Code 获得**：

| 组件 | 说明 |
|------|------|
| `/hookify` | 从自然语言创建 hook |
| `/hookify:list` | 列出所有规则 |
| `conversation-analyzer` agent | 分析对话，发现需要阻止的行为 |
| `writing-rules` skill | 规则语法指导 |

**如何工作**：

```
用户: "/hookify Warn me when I use rm -rf"
     ↓
hookify 创建 .claude/hookify.warn-rm.local.md
     ↓
规则立即生效（无需重启）
     ↓
下次用 rm -rf 时收到警告
```

**规则文件格式**：
```markdown
---
name: warn-dangerous-rm
enabled: true
event: bash
pattern: rm\s+-rf
action: warn
---

⚠️ Dangerous rm command detected!
```

**安装前 vs 安装后**：

| 安装前 | 安装后 |
|--------|--------|
| 写 hooks.json | 写 markdown 文件 |
| 学 hook API | 用自然语言描述 |
| 重启生效 | 立即生效 |
| 手动发现问题 | agent 分析对话找问题 |

---

## 对本次对话的反思

**如果一开始就安装了这些工具**：

| 我做的事 | 其实不需要 |
|----------|-----------|
| 让子代理探索 SDK 文档 | ❌ 安装 agent-sdk-dev 即可 |
| 查 Python SDK types.py | ❌ 安装 agent-sdk-dev 即可 |
| 写 prompt 问 web Claude | ❌ 安装 plugin-dev 即可 |
| 整理学习笔记 001-sdk-core-concepts.md | ❌ skills 已包含知识 |
| 研究 hooks 怎么用 | ❌ hook-development skill 已教 |

**真正需要做的**：

1. 安装 `agent-sdk-dev` + `plugin-dev`
2. 用 `/plugin-dev:create-plugin` 开始工作
3. 让 skills 教我，而不是自己查文档

---

## 安装命令

```bash
# Claude Code 内
/plugin install agent-sdk-dev
/plugin install plugin-dev
/plugin install hookify
```

---

## Alt Theory 下一步

**不需要再学习 SDK**，直接：

1. 安装 `agent-sdk-dev` → Claude Code 懂 SDK
2. 安装 `plugin-dev` → Claude Code 懂 plugin 开发
3. 用 `/plugin-dev:create-plugin` 创建 Alt Theory plugin
4. 用 `hook-development` skill 学习如何实现用户特点注入

---

## 元认知

这个文档本身可能都不需要了——安装 `plugin-dev` 后，Claude Code 已经有 7 个 skills 教它一切。

**学习模式变了**：

```
旧: 查文档 → 整理笔记 → 学习 → 实践
新: 安装工具 → 工具已懂 → 直接实践
```