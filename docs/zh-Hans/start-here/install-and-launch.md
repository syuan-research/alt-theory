# 安装与启动

Alt Theory 在本机运行，获取方式有两种。

## 打包应用

在内部测试阶段，打包后的桌面应用直接发给测试者与协作者 （现阶段），公开测试阶段在 github release 可获取。

支持以下平台：

- 配备 Apple Silicon 的 macOS
- x86 架构的 Windows

其他组合未经测试，不作保证。

首次启动时，操作系统可能警告该应用来自未识别的开发者，因为它未经平台应用商店分发。在 macOS 上，首次打开请右键点击应用并选择「打开」。在 Windows 上，于 SmartScreen 对话框中选择「更多信息，然后仍要运行」。下面从源码构建可避开此提示。


## 从仓库构建 （需一定编程经验）

完整源码公开，使用当前版本的 Node.js 与 npm。

```bash
git clone https://github.com/syuan-research/alt-theory
cd alt-theory
npm ci
npm --prefix alt-theory-app/frontend ci
npm run build:frontend-v6
```
用平台启动脚本启动本机应用（当前命令见仓库 README）。应用提供一个本地 Web 界面并在窗口中打开，不托管在任何服务器上。

## 首次启动

第一屏就是应用本身，一段等待开始的对话。应用至少需要配置一个模型提供方，之后才能开始对话。Alt Theory 提供工作目录与方法，模型由用户配置的提供方提供。

- 若应用来自 Alt Theory 团队，提供方可能已配置好。
- 否则首次启动的设置界面会引导用户添加提供方，例如一个 API 密钥，或用受支持的订阅登录。详见[模型、提供方与访问](../system-guide/models-providers-access.md)。应用内的[助手](../system-guide/helper-and-guidance.md)可逐步引导。

## 费用

本软件免费。模型按用量、按提供方定价收费。推荐默认是 MiMo 2.5 Pro。它不是最新模型，但贴合本产品的行为要求，且性价比高。MiMo 2.5 Pro 搭配 OpenCode Go 订阅，中高强度使用每月约 10 美元。直接使用 MiMo API 轻度使用每月不到 5 美元。Codex 订阅也可用。GPT 系列模型在反思性研究工作中比 MiMo 2.5 Pro 更被动。价格会变，请查阅模型页获取当前数字。

## 数据去向

- 对话保留在本机。
- 用户配置的模型会收到对话文本，方式与任何 AI 模型相同。这正是它能回复的原因。
- 除非用户选择导出，否则没有其他内容离开本机。

对话数据是单一应用数据目录下的普通本地文件。复制该目录即可备份全部内容，把它放到另一台机器上，应用会自动识别。

提供方激活后，可进入[开始第一次对话](first-conversation.md)。
