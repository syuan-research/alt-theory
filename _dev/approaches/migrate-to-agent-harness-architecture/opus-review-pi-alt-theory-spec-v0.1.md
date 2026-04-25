# Opus Review: pi-alt-theory-spec-v0.1.md

---
created: 20260425
reviewer: Claude Opus 4.6
status: review complete
---

## 总体评价

Spec 结构清晰，依赖关系图准确，数据层设计合理。但有几个关键问题需要在进入 dev 前解决，否则会在 Phase 1 卡住。

---

## 1. Prompt Caching 命中分析

**结论：当前设计大概率无法命中 prompt cache。**

### 问题所在

Spec 第 8.1 节定义的拼装顺序：

```
[Block 1] PI 原生最小 system prompt（PI 自动注入）
[Block 2] AGENTS.md 内容
[Block 3] User Profile（如加载）
[Block 4] KB 路径声明
[Block 5] Available tools 列表（PI 自动注入）
[Block 6] Skills 名称列表（PI 自动注入）
```

Anthropic prompt caching 的命中条件：**前缀必须完全一致**。Block 3（User Profile）是用户特定内容，如果不同用户有不同 profile，或者 profile 内容变化，Block 3 之后的所有内容都无法命中缓存。

更严重的问题：**Block 5 和 Block 6 是 PI 自动注入的**，你无法控制它们的内容和位置。如果 PI 在每次 session 时动态生成 tools 列表（例如包含 session ID 或时间戳），整个 system prompt 就永远不会命中缓存。

### 建议

1. **先验证 PI 的 tools 注入内容是否稳定**（Phase 1.2 时打印完整 system prompt，连续两次对比是否完全一致）
2. **如果要命中缓存，stable 内容必须在前，variable 内容在后**：
   ```
   [稳定] PI 原生 system prompt
   [稳定] AGENTS.md（Alt Theory identity，不变）
   [稳定] KB 路径声明（session 内不变）
   [可变] User Profile（放最后，或单独作为 user turn 注入）
   [稳定] Tools 列表（如果 PI 保证稳定）
   ```
3. **Profile 可以考虑作为第一条 user message 注入**（而非 system prompt），这样 system prompt 完全稳定，每次都命中缓存。代价是 profile 对 agent 的约束力略弱（user turn vs system turn）。

---

## 2. systemPromptOverride vs appendSystemPromptOverride

**结论：spec 的描述是正确的，但决策逻辑需要更明确。**

### 当前 spec 的问题

第 8.1 节说"或通过 `appendSystemPromptOverride` 只追加 Block 2+3+4，保留 PI 默认的 Block 1"，但这是两种互斥方案，spec 没有明确选哪个。

### 分析

| 方案 | 行为 | 风险 |
|------|------|------|
| `systemPromptOverride` | 完整替换 PI 的 system prompt | 必须手动包含 PI 原生工具说明（read/grep/find 的使用方式），否则 agent 不知道怎么用工具 |
| `appendSystemPromptOverride` | 追加到 PI 默认 system prompt 后 | PI 原生内容保留，但顺序是 PI 在前、你的内容在后，可能影响 agent 行为优先级 |

### 建议

**优先用 `appendSystemPromptOverride`**，原因：
- PI 原生 system prompt 包含工具使用说明，替换掉会导致 agent 不会用 read/grep 工具
- 追加方式更安全，PI 升级时不需要同步更新你的工具说明
- 如果发现 PI 默认内容干扰 Alt Theory 行为，再考虑 override

**必须验证的事**：Phase 1.2 时，用 `appendSystemPromptOverride` 打印完整 system prompt，确认 PI 原生内容 + 你的内容都在，且顺序符合预期。

---

## 3. 三种前端并行的隐藏成本

**结论：并行三条线的隐藏成本被低估了，建议调整策略。**

### 被低估的成本

**3A TUI 不是"零代码"**：
- TUI 需要 `tui/AGENTS.md` + `.pi/prompts/` + `.pi/extensions/`，这些文件需要从 Claude Code 的 `agent.md` 迁移和适配
- 如果 Core 层（Phase 1.3）还没稳定，TUI 的配置文件也会跟着变
- 实际成本：中等（不是零）

**3B 和 3C 的后端几乎相同**：
- 两者都是 Express + WebSocket + PI SDK
- 差异只在前端渲染层
- 并行开发意味着后端逻辑写两遍，或者需要抽象一个共享后端（又增加复杂度）

**WebSocket 协议未定义**：
- PI SDK 的消息格式（streaming tokens、tool calls、errors）需要序列化为 WebSocket JSON
- 这个协议需要定义一次，3B 和 3C 共用
- Spec 没有提到这个协议，是一个隐藏的设计工作

### 建议

**调整为串行策略**：
1. Phase 3A（TUI）：Core 稳定后立即启动，用于开发验证
2. Phase 3B（pi-web-ui）：TUI 验证通过后启动，复用 Zetaphor 的后端实现
3. Phase 3C（custom-web-ui）：**仅在 6 月展示前 pi-web-ui 不满足需求时才启动**

这样避免同时维护三套代码，且 3B 的后端可以直接复用给 3C。

---

## 4. 遗漏的脆弱点

当前 8 个脆弱点覆盖了主要风险，但遗漏了以下几个：

### 脆弱点 9：PI SDK 版本锁定风险（严重性：高）

PI (`@mariozechner/pi-coding-agent`) 是个人开发者项目，没有 SemVer 保证。如果作者做了 breaking change（API 重命名、行为变更），你的整个 Core 层可能需要重写。

**缓解**：锁定具体版本号（`package.json` 中用精确版本，不用 `^`），升级前先在 TUI 验证。

### 脆弱点 10：AGENTS.md 在 PI 中的加载时机不确定（严重性：高）

Spec 第 8.2 节说"PI 中 AGENTS.md 在每次 `before_agent_start` 时注入 system prompt"，但这是**假设**，不是已验证的事实。

PI 的 `AGENTS.md` 加载机制需要验证：
- 是每次 turn 都重新读取，还是 session 开始时读取一次？
- 如果是每次 turn 读取，token 成本翻倍
- 如果是 session 开始时读取，修改 AGENTS.md 需要重启 session

**缓解**：Phase 1.2 时验证 AGENTS.md 加载时机。

### 脆弱点 11：非技术用户的文件系统权限问题（严重性：中）

PI 的 `readOnlyTools` 需要访问 `kb/` 目录。在 Windows 上，如果用户把 app 安装在 `C:\Program Files\` 下，文件系统权限可能阻止读取。

**缓解**：Phase 4 打包时，将 `assets/`（kb、profiles、sessions）放在用户目录（`%APPDATA%` 或 `~/Documents/AltTheory/`），而非 app 安装目录。

### 脆弱点 12：Question Classifier 的 prompt 文件路径硬编码（严重性：低-中）

第 8.2 节说 agent 会"自行用 `read` 工具加载 `prompts/know_theo.md`"，但这个路径是相对路径。如果 agent 的 cwd 不是 `tui/`，路径会失效。

**缓解**：在 AGENTS.md 中用绝对路径或环境变量引用 prompt 文件，或者在 Core 层注入 prompt 文件的绝对路径。

---

## 5. Profile 注入时机的权衡

**结论：Spec 的分析基本正确，但遗漏了一个重要场景。**

### Spec 的分析

- Session 级注入：性能好，切换 profile = 新 session ✓
- Turn 级注入：每次都读文件，性能差 ✗

### 遗漏的场景：Profile 热更新

如果用户在对话中途修改了 profile 文件（例如添加了新的偏好），session 级注入意味着这次修改在当前 session 内不生效，需要重启 session。

对于 Alt Theory 的使用场景（学术 mentor），这个限制是可以接受的，但需要在 UI 上明确告知用户（"修改 profile 后需要开始新对话"）。

### 另一个遗漏：多用户场景

如果未来 Alt Theory 支持多用户（例如 pi-web-ui 部署给多个学生），session 级注入需要确保每个 session 绑定正确的 profile，不能共享。

当前 spec 的 `createAltTheorySession({ profilePath })` 设计是正确的，但需要确认 PI SDK 的 session 隔离是否足够（每个 WebSocket 连接对应独立的 PI session）。

---

## 优先级建议

在进入 dev 之前，以下问题需要在 spec 中明确：

| 优先级 | 问题 | 建议行动 |
|--------|------|----------|
| P0 | `systemPromptOverride` vs `appendSystemPromptOverride` 选哪个 | 明确选 `appendSystemPromptOverride`，Phase 1.2 验证 |
| P0 | AGENTS.md 加载时机（每次 turn vs session 开始） | Phase 1.2 验证，结果影响 token 成本估算 |
| P1 | Prompt caching 策略 | 决定 profile 放 system prompt 还是 user turn |
| P1 | 三种前端改为串行策略 | 避免并行维护成本 |
| P2 | PI SDK 版本锁定 | package.json 用精确版本 |
| P2 | WebSocket 协议定义 | 3B/3C 共用，需要在 Phase 3 开始前定义 |

---

*Review by Opus 4.6, 20260425*
