# Release Headings

Status: the topic vocabulary for changelog `###` headings and the
in-app timeline's domain tags. One heading vocabulary, two uses. The
design record (considered and rejected names) lives in the private
development tree; this file carries only the result and the rules.

## Structure

Two levels. The four first-level groups are navigation and the landing
quarters for future features; headings and timeline tags always use the
heading words. English glosses are for the changelog (English), Chinese for
the timeline (Chinese).

| 一级 | heading 词（heading / 标签） |
|---|---|
| 与 AI 一起工作 Working with AI | 对话 Conversation · 代理分工 Coordination · 技能 Skills · 系统提示词 System prompt · 领域知识 Domain knowledge · 模型 Models |
| 安全与可靠 Safety and reliability | 权限与安全 Permissions and safety · 可靠性 Reliability |
| 内容与资料 Content and materials | 文件 Files · 导入 Imports · 项目与文件夹 Projects and folders |
| 使用体验 Using experience | 界面 Interface · 流畅 Smoothness |

There are currently 13 heading words, above the 5–10 guidance; System prompt and
Domain knowledge were added late and the excess is known and tolerated
for now. Note on the 使用体验 name: it is not a perfect fit
(everything is the user's experience); 「交互体验」 and 「界面与交互」
remain hard-to-decide alternates.

## Boundary rules

- 文件 vs 项目与文件夹: the verb's object decides — file content
  (convert, edit, preview, delete a file, the Conversation files page)
  is Files; containers and structure (adding or removing project and
  global folders, folder-gone notices, list and family arrangement) is
  Projects and folders.
- 代理分工（Coordination）is everything about working with multiple
  agents: how the user works with several agents at once — parallel
  subagents, branches, side conversations (BTW), peer conversations
  messaging each other (Session ID) — and how agents cooperate among
  themselves. The Related conversations panel belongs here. Not
  "delegation": the word covers user-led multi-agent work and peer
  cooperation, not only delegating to subagents.
- Spawning a role to do work is 代理分工 (the object is a subagent);
  the assets themselves (roles, souls, skills, knowledge bases — their
  configuration and content) belong to their asset word.
- 系统提示词 System prompt is the resident personality layer (Role,
  Soul, model-specific hooks): present in every turn. Skills and
  knowledge bases are loaded on demand and are NOT system prompt — they
  live under 技能 Skills and 领域知识 Domain knowledge. `agent profile`
  is a retained alternate name for this heading word.
- 技能 Skills and 领域知识 Domain knowledge are currently separate
  (skills are mostly procedure, knowledge bases mostly reference); the
  merge is a scheduled re-examination, not a settled question.
- 导入 Imports stays independent; it may later widen to import and
  export (cross-harness interchange, Markdown export).

## Catch-all

A change that fits no heading word goes under 「其他」 / 「其他修复」 (Other new
and fixed); never force it into a word. Large-scale removals may use
「移除和调整」 / Removed and reworked for that release.
