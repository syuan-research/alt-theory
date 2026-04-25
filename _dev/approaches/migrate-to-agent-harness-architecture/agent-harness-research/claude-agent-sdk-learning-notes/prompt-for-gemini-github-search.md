# Prompt for Gemini - GitHub Plugin Search

## 第一轮：学习最新知识 + 搜索 GitHub

```
I need your help researching Claude Code plugins. Your knowledge may be outdated, so please first learn the current architecture, then search GitHub.

---

## Part 1: Learn Current Architecture (2025-2026)

Please read and understand these concepts before searching:

### Claude Code Extension Mechanisms

**1. Skills** (Static)
- Markdown files with YAML frontmatter
- Located in `.claude/skills/` or `~/.claude/skills/`
- Contain instructions, workflows, reference materials
- NO hooks - purely static context loaded into prompt
- Triggered by description match or manual `skill(name)` call

**2. Plugins** (Dynamic)
- Support hooks that intercept events
- Located in `.claude/plugins/` or installed globally
- Hooks can:
  - Intercept tool calls (PreToolUse, PostToolUse)
  - Modify inputs/outputs
  - Inject additionalContext into conversation
  - Access session state (session_id, transcript_path)

**3. Agent Harness**
- Claude Code and Claude Agent SDK share the same architecture
- File system + CLI + skills + markdown as memory
- Prototyping in Claude Code = prototyping for SDK

### Hook Events Available
- PreToolUse
- PostToolUse
- PostToolUseFailure
- UserPromptSubmit
- SubagentStart / SubagentStop
- PermissionRequest

### Key Capability: additionalContext
Hooks can return `additionalContext` to inject text into Claude's context mid-conversation.

---

## Part 2: Search GitHub

Now search GitHub for Claude Code plugins that implement:

### Search Query 1: Memory/Personalization Plugins
```
repo: *claude* plugin memory OR personalization OR "user profile" OR "learning style"
```

Look for:
- Plugins that store user characteristics
- Plugins that adjust behavior based on conversation history
- Plugins that use hooks to inject context

### Search Query 2: Hook-based Context Injection
```
"claude code" plugin hook additionalContext OR "context injection" OR "turn counter"
```

Look for:
- Examples of `additionalContext` usage
- Turn counting or periodic injection patterns
- State persistence across conversation turns

### Search Query 3: Educational/Mentor Plugins
```
"claude code" plugin tutor OR mentor OR teaching OR learner
```

Look for:
- AI tutor implementations
- Adaptive teaching style
- User modeling for education

---

## What to Return

For each relevant repository found:

1. **Repo name and URL**
2. **Does it use hooks?** (Yes/No, which events)
3. **Does it update memory/user profile mid-conversation?** (Yes/No, how)
4. **Key implementation pattern** (brief description)
5. **Is it actively maintained?** (last commit date)

---

## Constraints

- Focus on repositories created in 2025 or later
- Prefer TypeScript/Python implementations
- Ignore abandoned projects (no commits in 6+ months)
```

---

## 后续轮：深入特定项目

```
Continuing research on Claude Code plugins for user personalization.

---

## Project Under Investigation

Repository: [REPO_NAME]
URL: [REPO_URL]

---

## Questions to Answer

### 1. Hook Usage Analysis

Search the codebase for hook implementation:

```bash
grep -r "PreToolUse\|PostToolUse\|UserPromptSubmit\|HookMatcher\|additionalContext" --include="*.ts" --include="*.js" --include="*.py"
```

Report:
- Which hook events are used?
- What triggers the hooks?
- What do the hooks do?

### 2. Memory/Profile Update Mechanism

Search for:
```bash
grep -r "memory\|profile\|preference\|user.*characteristic\|learning.*style" --include="*.ts" --include="*.js" --include="*.py" --include="*.json"
```

Report:
- Where is user data stored? (file path, format)
- When is it updated? (every turn, periodically, manually?)
- What data is tracked?

### 3. Context Injection Pattern

Search for:
```bash
grep -r "additionalContext\|injectContext\|context.*inject" --include="*.ts" --include="*.js" --include="*.py"
```

Report:
- How is context injected?
- What triggers injection? (turn count, event, user action?)
- What content is injected?

### 4. Architecture Summary

Draw a simple flow:
```
[Trigger] → [Hook] → [Action] → [Result]
```

Example:
```
[UserPromptSubmit] → [read_profile_hook] → [load user_profile.json] → [additionalContext: user traits]
```

---

## Output Format

### Hook Usage
| Event | Implementation | Purpose |
|-------|---------------|---------|
| ... | ... | ... |

### Memory Mechanism
- Storage: [file/db]
- Update timing: [when]
- Data tracked: [what]

### Context Injection
- Trigger: [what]
- Content: [what]
- Frequency: [how often]

### Code Snippets
Include key code snippets showing:
1. Hook registration
2. Memory read/write
3. Context injection
```

---

## 使用说明

### 第一轮
1. 复制"第一轮"部分的完整内容
2. 发送给 Gemini
3. 等待它学习知识并搜索 GitHub
4. 收集它找到的仓库列表

### 后续轮
1. 从第一轮结果中选择感兴趣的仓库
2. 复制"后续轮"模板
3. 填入 `[REPO_NAME]` 和 `[REPO_URL]`
4. 发送给 Gemini
5. 获取详细的代码分析

---

## 预期产出

| 轮次 | 目标 | 产出 |
|------|------|------|
| 第一轮 | 广泛搜索 | 5-10 个相关仓库列表 |
| 后续轮 | 深入分析 | 每个仓库的 hook/memory 实现细节 |

---

## 补充搜索方向

如果第一轮结果不理想，可以追加：

### 追加查询 A: Memory Storage Patterns
```
"claude code" plugin "json file" OR "sqlite" OR "localStorage" memory
```

### 追加查询 B: Turn Tracking
```
"claude code" plugin "turn count" OR "conversation length" OR "periodic"
```

### 追加查询 C: User Modeling
```
"claude code" plugin "user model" OR "adapt" OR "personalize"
```