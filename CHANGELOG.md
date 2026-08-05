# Alt Theory — Release Notes

User-facing changes only, written for researchers, not developers. Started
with v1.4.0-beta.1; earlier tags predate this file. Internal engineering
detail lives in commit history and `development/`.

---

## v1.4.1-beta — 2026-08-05

Bug fixes from 1.4.0 field testing. A conversation family now behaves like a
family: one working folder, and a survivor takes over when the mainline goes.

**Conversation families stay together / 会话家族不再散架**

- Moving a conversation to another working folder now moves its WHOLE
  family — every branch, branch-of-branch, and attached conversation —
  no matter which member you drag. Previously, dragging a promoted branch
  could leave part of the tree behind in the old folder (or with no folder
  at all).
  把会话拖进另一个工作文件夹时，现在整个家族一起移动——所有分支、
  分支的分支、附属会话，无论你拖的是哪一个成员。此前拖动"转正"后的
  分支可能把树的一部分留在旧文件夹（甚至变成无文件夹）。
- On every start the app now repairs families that older versions left
  inconsistent: members re-align to the family root's working folder, and
  a family that lost all its visible members gets one back.
  应用每次启动会自动修复旧版本留下的不一致家族：成员对齐到家族根的
  工作文件夹；整个家族在列表中"消失"的，会自动恢复一位代表。
- Deleting a mainline no longer scatters its branches into separate
  top-level rows: the oldest branch becomes the family's head in the list
  and the others stay nested under it.
  删除主对话后，分支不再散落成一堆独立会话：最老的分支成为家族在列表
  中的头，其余成员仍然收在它下面。
- "Make this the main conversation" works again in families whose mainline
  is gone: crown any other branch to make it the family's head. Previously
  these families lost the option entirely — there was no mainline left to
  step down, so the crown never appeared.
  主对话已删除的家族重新拥有"变成主对话"：给任一其他分支戴上皇冠，它
  就成为这个家族的头。此前这类家族会整体失去该选项——没有可退位的主
  对话，皇冠就永远不出现。

- Folders in the conversation list now sort by name and stay put;
  previously any click made the active folder jump to the top of the list.
  会话列表中的文件夹现在按名称排序、位置固定；此前任何点击都会让当前
  文件夹跳到列表最上面。

**Desktop app remembers your settings / 桌面版记住你的设置**

- Interface settings (thinking display, dark mode, panel sizes …) survive
  a restart of the desktop app. The app now keeps a stable local address
  across launches; previously each launch got a fresh address, which
  silently reset browser-stored settings every time.
  界面设置（thinking 显示、深色模式、面板宽度等）现在重启桌面版后仍然
  保留。桌面版启动地址此前每次随机变化，导致这些设置每次被静默清空。

**Steer / 引导区**

- Steer now offers Alt Theory's bundled skills only (they are written for
  steering; this may open up later).
  Steer 目前只提供 Alt Theory 自带的技能（它们为"引导"语义而写；
  未来可能放开）。
- Each steer button's tooltip now tells you what THAT skill does; the
  Steer toggle explains what steering is. A squeezed button shows its full
  name on hover.
  每个 steer 按钮的悬停提示现在说明该技能自己的作用；Steer 开关本身
  解释"引导"是什么。名字被压缩的按钮悬停时会展开显示全名。
- Switching between the role/knowledge card and Steer shows a one-line
  hint about what each card is for.
  在角色/知识卡片与 Steer 之间切换时，会显示一行提示说明各自的用途。
- The align-first skill now insists harder: the moment it is activated,
  the AI must stop and discuss before doing any work — some faster models
  used to skip straight to executing.
  "先对齐"技能的措辞更强硬：激活的当下 AI 必须先停下讨论，不得直接
  动手——此前部分较快的模型会跳过讨论直接执行。

## v1.4.0-beta.1 — 2026-08-04

This release makes long conversations fast and cleans out a season of
leftover machinery. Nothing about how you work changes.

**Faster where it matters / 该快的地方快了**

- Long conversations no longer slow down with age: sending, switching
  models or modes, and stopping a run now respond instantly regardless of
  how much history a conversation carries (previously every action re-read
  the whole conversation file — up to ~140 ms of added delay in heavy
  conversations).
  长对话不再"越用越慢"：发送、切换模型/模式、中止运行的响应速度不再随
  历史长度增长（此前每个操作都会重读整个会话文件，重会话中每次多等约
  0.1 秒以上）。
- While the AI is typing, the interface stays smooth in long
  conversations: each incoming word now redraws only the growing answer,
  not the entire transcript.
  AI 打字过程中界面保持流畅：新到的每个字只重绘正在生长的回答，不再
  重绘整个对话记录。
- The conversation list refreshes faster, and conversations you deleted
  permanently no longer slow anything down in the background.
  会话列表刷新更快；已永久删除的会话不再在后台拖慢任何操作。

**More trustworthy Trash / 回收站更可靠**

- The 30-day automatic Trash cleanup no longer silently stops if it meets
  one damaged conversation — it skips it and keeps cleaning the rest.
  30 天自动清理遇到单个损坏会话时不再整体静默停止，会跳过它继续清理
  其余会话。
- Temporary conversations created by "Compare responses" (A/B arms) are
  now deleted together with their parent conversation instead of lingering
  invisibly on disk.
  "对比回答"产生的临时 A/B 会话现在会随原会话一起删除，不再无形地残留
  在磁盘上。

**Housekeeping / 内部清理（对使用无影响）**

- Removed roughly 10,000 lines of retired machinery: the pre-v1 interface,
  an unreachable "projects" feature, an obsolete Chinese-docs pipeline,
  old debugging scripts, and two unused dependencies. The app you run is
  the only app in the box now.
  移除约一万行退役代码：v1 之前的旧界面、无法进入的 "projects" 功能、
  废弃的中文文档流水线、旧调试脚本与两个无用依赖。包里只剩你真正在
  用的应用。
