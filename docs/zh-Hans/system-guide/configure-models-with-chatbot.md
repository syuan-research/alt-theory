# 用聊天机器人配置模型

你可以用任何认真的聊天机器人或编程代理（ChatGPT、Kimi、DeepSeek、Gemini、豆包、Claude、Codex 等）起草 Alt Theory 的模型配置。结果与「设置 → 模型」界面写入的是同一套文件。

## 配置在哪里

- 目录：**`~/.alt-theory/pi-agent/`**（Windows：`%USERPROFILE%\.alt-theory\pi-agent\`）
- **`models.json`** — 提供商、Base URL、模型 id、thinking 级别、上下文窗口等元数据
- **`auth.json`** — API 密钥与 OAuth 令牌（尽量不要把密钥贴进公开聊天）

Alt Theory **不会**读取 `~/.pi/agent/`。格式与 Pi 兼容，可以复制，但路径有意分开。详见 [模型、提供商与访问](models-providers-access.md) 与 [共享配置与资产](../advanced/shared-configuration-and-assets.md)。

## 可复制提示词

把下面提示词复制到聊天机器人，替换方括号内容。若已有 `models.json`，先去掉密钥再粘贴片段。

```text
我使用 Alt Theory（本地研究应用）。模型配置与 Pi 兼容，且只位于 ~/.alt-theory/pi-agent/（不是 ~/.pi/agent/）。

请帮我生成一份可用的 models.json，以便使用 [提供商名称，例如 DeepSeek / OpenRouter / xAI / 本地 OpenAI 兼容服务]。

约束：
1. 除非提供商要求其他 api 类型，否则优先 openai-completions。
2. 使用该提供商当前真实的 model id，不要编造已下线的 id。
3. 在已知时为每个模型填写 contextWindow、maxTokens、reasoning，以及可用的 thinking 级别。
4. 不要把 API 密钥写入 models.json。单独说明密钥应放在哪里（设置 → 模型，或 auth.json 惯例）。
5. 输出完整 models.json，并给出 Windows/macOS 简短步骤：创建目录、保存文件、重开 Alt Theory、打开设置 → 模型、Fetch model list（若可用）、Test connection，然后用页面顶部的「设为默认」（在提供商卡片内点选模型本身不会静默变成默认）。

我的系统是 [Windows / macOS / Linux]。
我的目标是 [例如日常用 Grok，草稿用 DeepSeek]。
现有配置（已去掉密钥）：[粘贴或写 none]。
```

## 拿到答复之后

1. 如无目录则创建 `~/.alt-theory/pi-agent/`。
2. 保存 `models.json`（密钥只放在指引或设置允许的位置）。
3. 重开「设置 → 模型」。
4. 优先 **Fetch model list**，使 id 与提供商当前列表一致。
5. 用顶部的 **设为默认** 指定新对话默认模型。
6. **Test connection** 通过后再做长研究。

## Helper vs 聊天机器人

应用内 **Helper**（Toolbox →「问 Alt 怎么用，或修设置」）可在本机走同一路径。想在打开 Alt 之前先有一份草稿文件，或在远程机器上配置时，用聊天机器人更合适。
