# Dev Session — Core 层快速验证

## 任务

验证 `alt-theory-app/core/alt-theory-core.ts` 能成功创建 session，并在 TUI 中完成 Class 3 对话。

## 前置条件

- PI SDK 已安装：`npm install` 完成
- `.env` 文件有 `MINIMAX_CN_API_KEY` 或 `MINIMAX_API_KEY`
- `alt-theory-app/tui/AGENTS.md` 和 `.pi/prompts/` 已存在

## 验证步骤

1. **运行 Core 测试脚本**
   ```bash
   npx tsx alt-theory-app/core/test-core.ts
   ```
   期望输出：session created successfully，无报错。

2. **TUI 对话测试（Class 3）**
   ```bash
   cd alt-theory-app/tui && pi
   ```
   输入以下问题，验证响应：
   - "Hello" → 期望：简短问候，可能给出 4 Questions
   - "What can you do?" → 期望：解释 Alt Theory 的 Value Proposition
   - "What is your role?" → 期望：回答 "AI cognitive mentor for environmental psychology"

3. **检查 system prompt 加载**
   确认 TUI 中 AGENTS.md 内容已加载（agent 知道自己的身份和 workflow）。

## 完成标准

- [ ] `test-core.ts` 运行成功
- [ ] TUI 中 Class 3 问题得到合理响应
- [ ] 无报错、无路径问题、无 API key 问题

## 不做什么

- **不验证 Class 1/2**（know_theo / alt_theo）—— prompt 和 KB 集成方式待 design session 确认
- **不验证 KB 搜索**—— KB 目录为空，且 KB 集成方式待确认
- **不改 prompt 内容**—— v0.6 prompt 的占位符处理是 design decision

## 如果失败

记录错误信息，回报给 design session。不要自行修改 Core 层接口。
