# 模型、提供方与访问

AI 模型来自你配置的提供方。Alt Theory 提供环境、方法与界面。

## 模型标记

输入框旁的模型标记显示本场对话使用的模型，并显示其思考强度（已设置时）。悬停查看提供方与用量详情。点击以切换本场对话的模型，变更从下一轮生效。第一条消息前选定的模型保持生效，对话开始时使用。

## 配置提供方

配置位于设置中的模型，同时也充当首次启动设置界面。两类访问：

- API 密钥，来自 OpenAI、Anthropic、Xiaomi MiMo 等提供方或任何兼容端点。把密钥粘贴到对应提供方条目。密钥本地存储，保存后不再回显。
- 订阅登录。受支持的提供方（OpenRouter、xAI/Grok 与 OpenAI Codex）通过其自身登录流程连接。Anthropic 走 API 密钥，不走订阅登录。

至少有一个有效且激活的提供方才能开始对话。配置多个，按对话选择。密钥属于设置，不属于聊天消息。

如果以上不熟悉，[助手](helper-and-guidance.md)会用日常语言逐步引导提供方配置。

Alt Theory 不会自动读取 Pi 的提供方配置。迁移现有 Pi 设置是一次性的引导复制，详见[共享配置与资产](../advanced/shared-configuration-and-assets.md)。

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

## 每会话模型与思考强度

- 会话可携带自身模型覆盖，每次打开都胜出默认。清除即回到默认。
- 思考强度是对话状态，在输入框或模型菜单中从所选模型支持的等级中选择。
- 模型消失（从你的配置中移除，或被提供方下线）不会破坏重开。应用回退到你的默认并说明，原选择被记住，因此模型回来时，对话会拿回它。

## 费用与用量

模型使用按你的提供方与你的账号计费。应用不加价。输入框旁的上下文环（[见处理回复与控制](responses-and-controls.md)）显示上下文用量，其提示包含输入输出 token 数与截至当前的提供方报告费用。费用只在智能体正在回复或工作时累计。

## 故障排查：已配置但不能工作

1. 提供方是否已保存并激活？草稿条目（已保存但没有有效密钥）会被存储但不可用。
2. 重新打开对话。配置变更应用于新对话与重开的对话，不在轮次进行中悄然生效。
3. 仍卡住：[助手](helper-and-guidance.md)可检查你的配置，或见[常见问题](../help/common-questions.md)。
