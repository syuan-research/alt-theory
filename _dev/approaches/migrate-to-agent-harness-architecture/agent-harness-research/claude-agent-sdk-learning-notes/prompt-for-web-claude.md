# Prompt for Web Claude

## 背景

Claude Code (CLI) 有两种扩展机制：
- **Skills** — 静态知识/指令，无 hooks
- **Plugins** — 支持 hooks，可拦截和修改行为

用户想用 plugin 实现动态回答策略调整（基于用户特点）。

---

## Prompt

```
I'm learning about Claude Code's extension mechanisms. I understand there are two types:

1. **Skills** — Static knowledge/instructions loaded into context
2. **Plugins** — Support hooks that can intercept and modify behavior

My questions:

## 1. Skill vs Plugin Architecture

What exactly are the architectural differences between Skills and Plugins in Claude Code?

Specifically:
- Can Skills define hooks, or is that exclusive to Plugins?
- What can a Plugin do that a Skill cannot?
- How do hooks in Plugins work? What events can they intercept?

## 2. Dynamic Behavior with Plugins

I want to implement a plugin that adjusts response strategy based on user characteristics (like learning style, expertise level, preferences).

The desired behavior:
- Periodically inject user profile information into context
- Adjust response style based on stored user traits
- Track conversation state (turn count, topics discussed)

Questions:
- Can Plugin hooks read external files (like a user_profile.json)?
- Can hooks maintain state across conversation turns?
- How to implement "every N turns, inject X context" pattern?
- Is there a recommended pattern for user personalization via plugins?

## 3. Hook Events and Capabilities

What hook events are available in Claude Code Plugins?
- PreToolUse, PostToolUse, UserPromptSubmit, etc.?
- Can hooks access conversation history/transcript?
- Can hooks return additionalContext to inject into Claude's context?

## 4. Example Pattern

Could you provide a concrete example of a Plugin that:
- Reads user profile from a file
- Tracks turn count
- Injects personalized context every N turns

---

Context: I'm exploring this for a future project where an AI mentor adapts its teaching style based on individual learner characteristics. I want to understand the technical capabilities before designing the system.
```

---

## 可能的追问

如果 web Claude 的回答不够具体，可以追问：

1. "Can you show me the hook API signature in a Plugin?"
2. "What's the difference between `additionalContext` and modifying `system_prompt`?"
3. "How do I register a Plugin with Claude Code? Is it via `.claude/plugins/`?"
4. "Is there official documentation for Plugin hooks that I can reference?"