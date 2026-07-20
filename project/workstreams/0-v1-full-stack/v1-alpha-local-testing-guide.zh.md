# Alt Theory v1-alpha 本机测试指南

适用对象：在当前源码工作树中自行使用和测试 v1-alpha 的项目成员。

## 最快启动

双击仓库根目录的：

```text
start-v1-alpha-local.cmd
```

脚本会启动本地服务器，等待服务可用后自动打开：

```text
http://127.0.0.1:3000/
```

运行期间请保留命令窗口。按 `Ctrl+C`，或关闭该窗口，即可停止服务。

## 现有配置和对话会怎样

脚本继续使用现有本机目录：

```text
%USERPROFILE%\.alt-theory\
  data\       Alt Theory 对话和 session records
  pi-agent\   Pi-native 模型、API key 和默认模型配置
  logs\       本地运行日志
```

不需要为了从此前 local run 进入 v1-alpha 而归档或迁移这个目录。当前
dev local 和 Windows Electron 路径本来就使用同一套位置，仓库的 Git
也不会跟踪其中内容。

如果希望在高风险实验前自己留一个恢复点，请先停止 Alt Theory，再复制
整个 `%USERPROFILE%\.alt-theory` 到仓库外的私人备份位置。不要把该目录
加入 Git，也不要分享其中的 `auth.json`、session JSONL 或日志。

## 第一次运行前

脚本要求本机已有 Node.js 和仓库依赖。如果窗口提示 dependencies are
missing，请在仓库根目录打开 PowerShell，仅运行一次：

```powershell
npm install
```

然后重新双击启动脚本。脚本不会自行安装或升级依赖。

## 模型设置

如果还没有可用模型，应用会进入 Model setup。也可以直接打开：

```text
http://127.0.0.1:3000/config
```

添加 provider、API key 和模型并设为 active。配置写入
`%USERPROFILE%\.alt-theory\pi-agent`，不会写入仓库。

## 建议测试顺序

1. 新建 Understand 对话并完成一次问答。
2. 导入一个参考文件，确认它只出现在 Understand 的 Files 流程中。
3. 新建 Work 对话，选择真实 working folder，完成一次受控文件修改。
4. 将已有对话在 Understand 与 Work 之间切换，确认历史和可写位置保留。
5. 重新启动脚本，确认左侧 catalog 和旧对话仍可打开。

Pi session import 当前只有后端接口，尚未接入前端选择界面，不属于这份
手工 UI 测试的可见入口。

## 常见问题

### Port 3000 is already in use

已有进程占用了默认端口。关闭旧的 Alt Theory/dev server 后重新双击。
脚本不会擅自终止其他进程。

### 页面没有自动打开

确认命令窗口仍显示服务器正在运行，然后手动打开：

```text
http://127.0.0.1:3000/
```

### 修改了 React 源码，但页面还是旧的

该启动器服务的是 `web-server/public-v6` 已构建前端。先运行：

```powershell
npm run build:frontend-v6
```

再重新启动。不要使用 `dist-bundle` 判断 v1-alpha 行为；它是旧的编译输出。

### 对话或模型设置似乎消失

确认没有设置自定义 `ALT_THEORY_DATA_DIR` 或 `PI_CODING_AGENT_DIR`。
默认数据应仍位于 `%USERPROFILE%\.alt-theory`。排查时不要粘贴完整 API key
或原始对话正文。
