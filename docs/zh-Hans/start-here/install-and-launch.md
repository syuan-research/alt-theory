# 安装与启动 Alt Theory

Alt Theory 在本地电脑上运行。获取方式有两种。

## 打包好的应用

打包桌面版目前直接提供给测试者与合作者。支持的平台：

- **macOS**（Apple Silicon）
- **Windows**（x86）

其他平台组合未经测试，也不作承诺。

首次启动时，操作系统可能会提示「未识别的开发者」——在应用商店之外分发的软件常见如此。macOS 上请首次右键应用并选择「打开」；Windows 上在 SmartScreen 对话框中选「更多信息 → 仍要运行」。若不想走这一步，可改用下方从源码构建的方式，完全避开该提示。

## 从仓库构建

完整源码已公开。安装较新的 Node.js 与 npm 后：

```bash
git clone https://github.com/syuan-research/alt-theory
cd alt-theory
npm ci
npm --prefix alt-theory-app/frontend ci
npm run build:frontend-v6
```

然后用对应平台的启动脚本启动本地应用（当前命令见仓库 README）。应用会提供本地 Web 界面并在窗口中打开；不会托管到任何远端。

## 首次启动

第一屏就是应用本身——一条等待开始的对话。唯一需要先搞定的是：至少配置一个**模型提供商（model provider）**。Alt Theory 提供工作区与方法，模型由你接入。

- 若应用来自 Alt Theory 团队，提供商可能已配好——直接开始输入即可。
- 否则，首次运行设置会引导你添加提供商：填入你使用的 API 密钥，或通过支持的订阅登录。[模型、提供商与访问](../system-guide/models-providers-access.md) 覆盖全部选项；应用内 [Helper（帮助助手）](../system-guide/helper-and-guidance.md) 也能用平实语言逐步引导。

提供商就绪后即可开始：
[开始第一次对话](first-conversation.md)。
