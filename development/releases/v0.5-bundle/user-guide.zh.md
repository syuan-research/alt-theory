# Alt Theory Windows 本地版测试指南（给非技术测试者）

适用版本：v0.5.x local bundle / `win-unpacked` 文件夹版。

## 你会收到什么

你应该收到一个压缩包，里面是完整的 `win-unpacked` 文件夹。请先解压，再运行：

```text
win-unpacked/AltTheory.exe
```

不要只复制或运行单独的 `AltTheory.exe`。它需要同一个文件夹里的 `resources/`、`node_modules/` 等文件。

## 第一次打开

1. 双击 `AltTheory.exe`。
2. 如果 Windows 弹出安全提醒，确认来源是 Shuai 发给你的测试包后再继续。
3. 打开后点击左上/侧边的 `Model setup`。
4. 添加一个 provider，填入你的 API key。
5. 保存后回到聊天页，发一句很短的问题测试是否能回复。

## Provider 怎么选

只需要选你实际拥有 key 的入口：

- `OpenCode Go (OpenAI-compatible)`：适合 OpenCode Go 里走 `/chat/completions` 的模型，例如 MiMo、DeepSeek、Kimi、GLM。
- `OpenCode Go (Anthropic-compatible)`：适合 OpenCode Go 里走 `/messages` 的模型，例如 Qwen 3.7、MiniMax。
- `Xiaomi MiMo Token Plan (CN)`：只适合小米 MiMo Token Plan 中国区 endpoint 的 key。
- `Xiaomi MiMo API (CN)` / `Xiaomi MiMo API (Global)`：普通 MiMo API。当前需要你从 MiMo 控制台/文档复制 Base URL；不要把 Token Plan endpoint 填进去。
- `Qwen 3.7 Max (Bailian)`：适合阿里百炼 / DashScope key。
- `OpenRouter`：适合 OpenRouter key。

如果不确定，先截图给 Shuai，不要反复乱改。

## Knowledge base 开关

输入框上方的 `Use EP knowledge base` 表示是否使用环境心理学知识库：

- 勾选：更适合环境心理学理论、概念、研究相关问题。
- 不勾选：更适合完全无关的普通对话，避免知识库带偏回答。

## Key 存在哪里

本地版不会把你的 key 存进 app 文件夹。保存 key 时，它会写到你电脑自己的本地配置目录，大致在：

```text
%USERPROFILE%\.alt-theory\pi-agent\auth.json
```

这是本地测试工具，不是云服务。不要把自己的 `.alt-theory` 文件夹发给别人。

## 反馈时请告诉我们

如果遇到不能打开、不能保存、不能回复、报错等问题，请先告诉我们这些诊断信息：

- 你运行的是哪个文件夹里的 `AltTheory.exe`？
- Windows 有没有安全弹窗？
- 是否进入了聊天界面？
- 选了哪个 provider / model？不要发完整 API key。
- 发消息时报错了吗？如果有，请截图或复制错误文字。

如果 app 能运行，也请单独告诉我们哪些地方不好用或容易误解：

- `Model setup` 哪一步让你困惑？
- 哪个 provider / model 名字看起来不清楚？
- `Use EP knowledge base` 开关是否容易理解？
- 哪些文字、按钮、流程让你觉得不懂？
- 你希望第一次打开时多给什么提示，或少显示什么内容？

## 不需要测试的事

这次主要测“非技术用户能不能打开、配置 key、发出第一条消息”。不用测试安装器、自动更新、代码签名、跨设备同步，也不用评价界面是否最终好看。
