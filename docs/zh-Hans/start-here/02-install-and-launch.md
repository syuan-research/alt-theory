# 安装与启动

Alt Theory 在本机运行，获取方式有两种。

## 打包应用

Beta 可从 [GitHub Release](https://github.com/syuan-research/alt-theory/releases/tag/v1.3.0-beta.1) 下载。Windows 下载 `AltTheory-b1-win.zip`，完整解压 `AltTheory` 文件夹，然后运行 `AltTheory.exe`；macOS 下载 `AltTheory-b1-mac.zip`，解压出 `AltTheory.app` 并移到「应用程序」。使用打包应用不需要安装 Node.js 或 npm。

支持以下平台：

- Windows x64：提供 Beta 文件夹 ZIP
- Apple Silicon macOS：提供 Beta 应用 ZIP

其他组合（含 Intel Mac）未经测试，不作保证。

Beta 尚未签名，两个系统首次打开时都会拦一下。Windows 可能警告该应用来自未识别的开发者：选择「更多信息 → 仍要运行」。macOS 请先在「下载」中完整解压文件夹，再任选一种方法解除下载隔离：右键 ZIP 附带的 `Fix-Open.command` 并选择「打开」；或在终端运行 `xattr -dr com.apple.quarantine "$HOME/Downloads/AltTheory/AltTheory.app"`。若实际路径不同，请替换命令中的路径。若仍被拦截，请前往「系统设置 → 隐私与安全性 → 仍要打开」，验证身份后确认「打开」。仅在 ZIP 来自本仓库 GitHub Release 时才这样操作。


## 从仓库构建 （需一定编程经验）

完整源码公开。当前 Windows 构建使用 Node.js 24 与 npm 11 测试。

```bash
git clone https://github.com/syuan-research/alt-theory
cd alt-theory
npm ci
npm --prefix alt-theory-app/frontend ci
npm run build:electron
```
Windows 未打包目录输出到 `dist/win-unpacked/`。打包与验证步骤见仓库 README 和标准桌面 bundle 指南。

## 首次启动

第一屏就是应用本身，一段等待开始的对话。应用至少需要配置一个模型提供方，之后才能开始对话。Alt Theory 提供工作目录与方法，模型由用户配置的提供方提供。

- 若应用来自 Alt Theory 团队，提供方可能已配置好。
- 否则应用仍停留在正常主界面，输入区会说明需要模型；点击提示即可进入「设置 → 模型」，添加 API 密钥或使用受支持的订阅登录。详见[模型、提供方与访问](../system-guide/02-models-providers-access.md)。应用内的[助手](../system-guide/16-helper-and-guidance.md)可逐步引导。

## 费用

本软件免费。模型按用量、按提供方定价收费。推荐默认是 MiMo 2.5 Pro。它不是最新模型，但贴合本产品的行为要求，且性价比高。MiMo 2.5 Pro 搭配 OpenCode Go 订阅，中高强度使用每月约 10 美元。直接使用 MiMo API 轻度使用每月不到 5 美元。Codex 订阅也可用。GPT 系列模型在反思性研究工作中比 MiMo 2.5 Pro 更被动。价格会变，请查阅模型页获取当前数字。

## 数据去向

- 对话保留在本机。
- 用户配置的模型会收到对话文本，方式与任何 AI 模型相同。这正是它能回复的原因。
- 除非用户选择导出，否则没有其他内容离开本机。

对话数据是单一应用数据目录下的普通本地文件。复制该目录即可备份全部内容，把它放到另一台机器上，应用会自动识别。

提供方激活后，可进入[开始第一次对话](03-first-conversation.md)。
