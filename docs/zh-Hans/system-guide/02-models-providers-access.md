# 模型、提供方与访问

AI 模型来自你配置的提供方。Alt Theory 提供环境、方法与界面。

## 模型标记

输入框旁的模型标记显示本场对话使用的模型，并显示其思考强度（已设置时）。悬停查看提供方与用量详情。点击以切换本场对话的模型，变更从下一轮生效。第一条消息前选定的模型保持生效，对话开始时使用。

## 配置提供方

配置位于设置中的模型，同时也充当首次启动设置界面。两类访问：

- API 密钥，来自 OpenAI、Anthropic、Xiaomi MiMo 等提供方或任何兼容端点。把密钥粘贴到对应提供方条目。密钥本地存储，保存后不再回显。
- 订阅登录。受支持的提供方（OpenRouter、xAI/Grok 与 OpenAI Codex）通过其自身登录流程连接。Anthropic 走 API 密钥，不走订阅登录。

至少有一个有效且激活的提供方才能开始对话。配置多个，按对话选择。密钥属于设置，不属于聊天消息。

如果以上不熟悉，[助手](16-helper-and-guidance.md)会用日常语言逐步引导提供方配置。

Alt Theory 不会自动读取 Pi 的提供方配置。迁移现有 Pi 设置是一次性的引导复制，详见[共享配置与资产](../advanced/03-shared-configuration-and-assets.md)。

### 当前提供方路径

| 入口 | 协议 / 端点 |
|---|---|
| OpenCode Go（OpenAI 兼容） | OpenAI chat completions：`https://opencode.ai/zen/go/v1` |
| OpenCode Go（Anthropic 兼容） | Anthropic messages：`https://opencode.ai/zen/go` |
| 小米 MiMo Token Plan（中国） | OpenAI 兼容：`https://token-plan-cn.xiaomimimo.com/v1` |
| 小米 MiMo API（中国 / 全球） | OpenAI 兼容；粘贴 MiMo 对应区域的端点 |
| Qwen 3.7 Max（百炼） | OpenAI responses：`https://dashscope.aliyuncs.com/compatible-mode/v1` |
| OpenRouter | OpenAI 兼容：`https://openrouter.ai/api/v1` |
| OpenAI API | OpenAI responses：`https://api.openai.com/v1` |
| Anthropic API | Anthropic messages：`https://api.anthropic.com` |

设置也支持自定义 OpenAI 兼容或 Anthropic 兼容端点。密钥可由 Alt Theory 保存，也可引用你填写的环境变量名；应用不会假定某个固定的提供方变量。

### 磁盘上的文件

`~/.alt-theory/pi-agent/` 下：

```text
models.json    providers.<name> = { baseUrl, api, apiKey, models[] }
auth.json      <provider> = { type: "api_key", key }
settings.json  { defaultProvider, defaultModel, ... }
```

`models.json` 中的 `apiKey` 可以是环境变量标记，而非密钥本身。普通修改请使用设置页；这里保留结构，是为了让助手和高级用户无需反向阅读代码也能检查或迁移配置。

### 用聊天机器人配置模型

设置页是常规途径，应用内的[帮手](16-helper-and-guidance.md)也能带你走完。如果你更想把这件事交给已经在用的聊天机器人——ChatGPT、Kimi、DeepSeek、Gemini——在应用的设置页打开「让聊天机器人编写配置」，复制那里的提示词，连同设置页的表单截图一起发给它即可。

```text
我要在一个桌面应用里添加一个 AI 服务商，下面是它给我的配置指南：

要填的表单一共四项 （若有附图，见附图）：名称、基础 URL（baseUrl）、API 类型（openai-completions / openai-responses / anthropic-messages 三选一）、API 密钥。

询问用户：
1. 若用户没有说，先问准备使用哪些服务商，如 Deepseek，Opencode Go 等等。若已说明，跳过。
2. 若用户没有说，问是否需要讲解去哪个页面找到 API key，若需要，尽可能协助用户，要使用即使没有使用过api的人也能理解的语言，减少术语。
3. 如果用户有 api key，提供除 API key之外的三项信息，如果你不确定 baseUrl 或该选哪种 API 类型，以这家服务商官方文档当前的推荐为准，如果不能联网就按你的内部知识。模型列表在应用里可以自己拉取，思考强度也有自动拉取，但你若后续联网搜索，请帮助用户找到最新的思考强度列表。

解释时不要一次堆太多术语；如果要分多轮解决，每轮只讲几个要点，逐步推进。
```

粘贴之前记住两点：API 密钥等同于密码，只交给你信任的工具；提供方条目建好之后，设置页里的「获取模型列表」比任何聊天机器人对当前可用模型 id 的记忆都更可靠。

### 让能编辑文件的 agent 配置模型

如果你手边是可以直接读写本机文件的 agent——编码代理或办公代理——把下面这段整段发给它：它会自己侦察已有的配置和密钥，先与你确认再动手，动手前会备份原文件。

```text
我在用一个桌面应用，需要添加一个 AI 服务商。你没有读写本机文件的能力就直说，改为给我自己操作的步骤，到此为止。

目标文件：~/.alt-theory/pi-agent/models.json（不存在就由你创建）。目标结构：

{
  "providers": {
    "<服务商名称>": {
      "baseUrl": "<接口地址>",
      "api": "openai-completions" | "openai-responses" | "anthropic-messages",
      "apiKey": "<密钥明文，或环境变量名>",
      "models": [{ "id": "<模型 id>" }]
    }
  }
}

先问我三件事：
1. 打算接哪家服务商？
2. 它是订阅制还是 API key？订阅制（如 ChatGPT 订阅、Grok 订阅、Kimi Code 订阅）走 OAuth 登录，key 由我在应用里自己登录取得，你没有可写的——指引我完成登录即可。
3. 这家服务商我之前在哪些工具里已经配过？

然后侦察：到我点名的工具配置里取已配的服务商和 key；查这台机器环境变量里现成的 API key（只要变量名，值不需要）；读现有 models.json；查你所在 harness 的模型支持表。

模型 id 的获取顺序：先看应用记录的模型缓存，里面常已有这家服务商的真实 id（「获取模型列表」的结果就记在这里）；再看你所在 harness 的模型支持表；不够再联网调这家服务商的模型列表接口；还拿不到就留空数组，并告诉我两步收尾——应用里打开该服务商，点「获取模型列表」，保存。

侦察完向我汇报：找到了什么、缺什么、缺的部分我怎么补（现在去拿 / 稍后粘贴 / 换一家）。我确认用哪些之后你才写。

再问我分工：文件由你直接改，还是你给出步骤我自己改。

动手前把原文件复制成同目录的时间戳副本（如 models.json.bak-20260916-2130）；文件不存在就跳过备份。写完汇报改了什么、什么没做，让我在应用里点「测试连接」。

更仔细的说明见：{{docsRoot}}\docs\zh-Hans\system-guide\02-models-providers-access.md
```

## 每会话模型与思考强度

- 会话可携带自身模型覆盖，每次打开都胜出默认。清除即回到默认。
- 思考强度是对话状态，在输入框或模型菜单中从所选模型支持的等级中选择。
- 模型消失（从你的配置中移除，或被提供方下线）不会破坏重开。应用回退到你的默认并说明，原选择被记住，因此模型回来时，对话会拿回它。

## 费用与用量

模型使用按你的提供方与你的账号计费。应用不加价。输入框旁的上下文环（[见处理回复与控制](05-responses-and-controls.md)）显示上下文用量，其提示包含输入输出 token 数与截至当前的提供方报告费用。费用只在智能体正在回复或工作时累计。

## 故障排查：已配置但不能工作

1. 提供方是否已保存并激活？草稿条目（已保存但没有有效密钥）会被存储但不可用。
2. 重新打开对话。配置变更应用于新对话与重开的对话，不在轮次进行中悄然生效。
3. 仍卡住：[助手](16-helper-and-guidance.md)可检查你的配置，或见[常见问题](../help/01-common-questions.md)。
