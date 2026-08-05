# Alt Theory — Release Notes

User-facing changes only, written for researchers, not developers. Started
with v1.4.0-beta.1; earlier tags predate this file. Internal engineering
detail lives in commit history and `development/`.

---

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
