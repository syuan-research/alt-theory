# Alt Theory

[![Release（发布版本）](https://img.shields.io/github/v/release/syuan-research/alt-theory?include_prereleases&label=Release)](https://github.com/syuan-research/alt-theory/releases)
[![License（许可）](https://img.shields.io/badge/License-MIT%20%2B%20CC%20BY%204.0-59636e)](LICENSE.md)
[![Windows x64（Windows 64 位）](https://img.shields.io/badge/Windows-x64-59636e?logo=windows11&logoColor=white)](https://github.com/syuan-research/alt-theory/releases)
[![macOS Apple Silicon](https://img.shields.io/badge/macOS-Apple%20Silicon-59636e?logo=apple&logoColor=white)](https://github.com/syuan-research/alt-theory/releases)

[English](README.md) · **简体中文** · [繁體中文（香港）](README.zh-Hant-HK.md)

> “Efficiency（效率）是把事情做对；effectiveness（有效性）是做对的事情。”
> — Peter Drucker

随着 AI 变得更加 autonomous（自主）、proactive（主动），也更善于给出 plausible answers（看似合理的回答），研究中仍有一些关键时刻需要你来主导方向，或需要 AI 真正理解并跟随你正在做的事。

**Alt Theory 帮助你有效地思考，并完成严肃的研究工作。**

Uncertainty（不确定性）是严肃研究的正常组成部分：有些需要用 evidence（证据）解决，有些需要随项目推进而管理，还有一些值得探索，因为新的问题和理论正从中产生。Alt Theory 试图区分这些情形，理解用户真正想完成什么，并支持社会科学及更广泛学术研究所需的 meta-level thinking（元层次思考）。

Alt Theory 可以识别不确定性、证据和相互竞争的解释；使用你的文件与研究工具；并行推进多个方向，而不把它们压缩成一个答案。你可以选择协作方式、知识来源和具体方法，也可以比较替代方案、探索支线问题，或向 Subagent（子代理）给出边界清楚的方向。

Alt Theory 基于 [Pi coding-agent runtime（Pi 编码代理运行时）](https://pi.dev)构建，并加入自己的 agent behavior（代理行为）、research assets（研究资产）、conversation architecture（对话架构）和 desktop interface（桌面界面）。当前 Public Beta（公开测试版）可以用于真实工作，但界面、配置与兼容性仍可能在版本间变化。

![Alt Theory 主对话](docs/assets/readme/alt-theory-main.png)

## 一个随 AI 演进的研究产品

Alt Theory 从社会科学研究者的视角出发，并随 AI 能力变化而演进。它长期关心的是：当 AI 承担越来越多研究执行与探索工作时，研究者如何继续塑造问题、运用判断、发展理论，并保存各自领域的知识传统。

它在 2025 年始于一个 environmental psychology knowledge base（环境心理学知识库）和 theory innovation（理论创新）的思考伙伴。随着 Agent（代理）开始能够操作文件和工具，2026 年版本支持一个连续的研究循环：理解问题、处理证据与文件、探索替代方向，并在不丢失探究连续性的前提下返回主线。它的行为、知识、方法与对话结构可以针对不同研究问题、理论兴趣和 Agent 使用经验继续扩展。

## Alt Theory 如何工作

### Alt 自动完成的部分

- System behavior（系统行为）与 **Soul（灵魂）**——一份可阅读的稳定原则文件——提供关于证据、不确定性、节奏与用户选择的持续立场。
- 所选 **Role（角色）**——一份规定 Alt 如何理解和沟通的可阅读指令——塑造持续性的研究关系或任务方式。
- **Skill（技能）**会在具体情境需要某种方法时自动激活，例如在方向性工作前对齐目标，或恢复导入对话中已经变化的上下文。

### 用户控制的部分

- 为对话选择、更换或清除 Role（角色）。
- 选择或关闭 knowledge base（知识库）：它是服务于某一领域或研究目的的策展材料，而不是临时搜索结果。
- 在需要特定工作方式时明确调用 Skill（技能）。
- 选择对话可用的工作边界、permissions（权限）和研究工具。
- 创建、比较、保留或舍弃不同的探究路线。

Knowledge base（知识库）可以保留一个领域的范围、provenance（来源脉络）与内部传统，同时让 Alt 考虑更广泛或更主流的知识。更容易的知识库制作和 community knowledge bases（社区知识库）是未来方向，不是当前 Beta（测试版）的既有承诺。

### 部分 Skills（技能）

| Skill（技能） | 适用情形 | 启动方式 |
|---|---|---|
| `adaptive-aligning` | 对情境、目标或方向尚未形成共同理解 | 自动或明确调用 |
| `adaptive-plan-record` | 多阶段工作需要持续更新的计划与记录 | 自动或明确调用 |
| `search-policy` | 论断需要实时核验和清楚的来源标记 | 自动 |
| `precise-edit` | 接近定稿的文本需要克制、精确的编辑 | 自动或明确调用 |
| `imported-session-context` | 导入的对话需要恢复上下文 | 自动 |
| `alt-theory-help` | 设置或产品使用需要帮助 | 通过 Helper（助手） |

当前可以通过 commands（命令）明确调用 Skill（技能）。常用情境 Skill 的直接 toolbar（工具栏）计划在 v1.3.1 Beta 周期提供。

## 探索不止一条路线

相比 Codex、Claude Code、OpenCode 和 ZCode，Alt Theory 在 Agent 工作之上增加了更灵活、由用户主导的探索界面。Message（消息）可以编辑为对照实验；问题可以进入 BTW（顺带问）对话；不同方向可以形成 Branch（分支）；有价值的侧边工作可以被提升。

| Control（控件） | 用途 |
|---|---|
| **Edit and compare（编辑并比较）** | 保留原始请求，并把编辑后的请求作为同级对照运行 |
| **Branch（分支）** | 沿不同方向继续，而不丢弃第一条路线 |
| **BTW（顺带问）** | 探索侧边问题而不带偏主线 |
| **Subagent（子代理）** | 把边界清楚的方向交给另一个真实、可检查的 Agent 对话 |
| **Show in conversation list（显示在对话列表）** | 把有价值的侧边工作提升为独立保留的对话 |

Subagent（子代理）可以同时与 Main agent（主代理）和用户沟通。被提升的侧边对话会保留原有关系与 provenance（来源关系），而不会变成无关的 transcript（对话记录）。

![比较主对话与 Branch（分支）](docs/assets/readme/alt-theory-branch-comparison.png)

## 适用人群

Alt Theory 首先面向社会科学领域的学生与研究者：从正在形成第一个研究问题的硕士生，到判断 AI 工具是否应进入研究计划的资深研究者。它也支持更广泛的研究型知识工作。

无需 Agent 工具经验。如果你主要需要讨论和有记录的反思，**Understand（理解）**会刻意限制 Agent 的操作范围，同时保留一个用于对话摘要和笔记的小型可写空间。产品和设置问题可以交给 **Helper（助手）**；详见[帮助与故障排除](#帮助与故障排除)。

当研究需要实时来源、文件、分析或文档制作时，当前对话可以切换到 **Work（工作）**，而不丢弃此前讨论。例如，Alt 可以进行探索性的 R 或 Python 分析，处理文献和文档，制作表格、幻灯片或协作材料，然后回到解释与判断。

熟悉 Agent 的用户可以带入既有 workspace（工作区），并继续从 Codex、Claude Code、Grok Build、Pi Coding Agent 与 OpenCode 导入的对话。参见 [Imports and cross-harness continuity（导入与跨工具连续性）](docs/en/system-guide/imports-and-continuity.md)。

## 其他功能

- 同时运行多个 Agent session（代理会话）和 related conversations（相关对话）。
- 导入受支持的对话历史，包括 compacted sessions（已压缩会话）以及受支持的图片与工具记录。
- 将 Branch（分支）、BTW（顺带问）和 Subagent（子代理）保留为独立、可检查的 session record（会话记录）。
- 在 Settings → Trash（设置 → 回收站）中恢复 30 天内删除的对话，或永久删除；比较用 Branch 仍可独立保留。
- 使用本地文件夹、附件、文档、图片、实时搜索、R/Python 分析和文件产出工具，并保持可见的权限边界。
- 在受支持的 model（模型）和 provider（提供商）之间选择，而不是绑定单一厂商。
- 使用 English、简体中文或繁體中文（香港）界面。

![导入并继续既有 Agent 对话](docs/assets/readme/alt-theory-import.png)

## 获取 Alt Theory

| Platform（平台） | Status（状态） |
|---|---|
| Windows x64（Windows 64 位） | **[下载 Beta](https://github.com/syuan-research/alt-theory/releases)** |
| macOS Apple Silicon | **[下载 Beta](https://github.com/syuan-research/alt-theory/releases)** |
| Linux、Intel Mac 与其他架构 | 当前未声明支持 |

### Windows：下载与启动

1. 从 [GitHub Release 页面](https://github.com/syuan-research/alt-theory/releases)下载 Windows Beta。
2. 完整解压 `AltTheory` 文件夹；这是 folder app（文件夹应用），不是 installer（安装程序）。若解压失败，请解压到路径更短的文件夹（Windows 有最大路径长度上限）。
3. 打开文件夹并运行 `AltTheory.exe`。

Beta（测试版）尚未进行 code signing（代码签名）。Windows SmartScreen 可能显示未知应用警告；只有在下载来自本仓库 GitHub Release 时，才选择 **More info → Run anyway（更多信息 → 仍要运行）**。Release（发布版本）同时提供 SHA-256 checksum（SHA-256 校验值）。下载版不需要 Node.js 或 npm。

### macOS：下载与启动

1. 从 [GitHub Release 页面](https://github.com/syuan-research/alt-theory/releases)下载 macOS Beta。
2. 在「下载」中完整解压 `AltTheory` 文件夹；里面有 `AltTheory.app` 和 `Fix-Open.command`。
3. 用任一方法解除 quarantine（下载隔离）：右键 `Fix-Open.command` 并选择 **Open（打开）**；或在终端运行 `xattr -dr com.apple.quarantine "$HOME/Downloads/AltTheory/AltTheory.app"`。若实际文件夹或 App 路径不同，请替换命令中的路径。
4. 把 `AltTheory.app` 移到「应用程序」并打开。若仍被拦截，请前往 **系统设置 → 隐私与安全性 → 仍要打开（Open Anyway）**，验证身份后确认 **打开（Open）**。

需要这些步骤是因为 Beta 尚未经过 Apple notarization（公证）。脚本和终端命令只会移除 macOS 的下载隔离标记。只有在 ZIP 来自本仓库 GitHub Release 时才这样操作，并对照 `BUILD-INFO-mac.txt` 校验 SHA-256。仅支持 Apple Silicon。

## 首次启动

Alt Theory 会直接进入对话。在第一次运行对话前，请在 **Settings → Models（设置 → 模型）**中配置至少一个 Model（模型）：使用 API key（API 密钥）或受支持的 subscription sign-in（订阅登录）。Alt Theory 提供 workspace（工作区）、行为和工具；Model 由你配置的 Provider 提供。软件免费，模型使用费按 Provider 条款结算。

- [Install and first launch（安装与首次启动）](docs/en/start-here/install-and-launch.md)
- [Models, providers, and access（模型、提供商与访问）](docs/en/system-guide/models-providers-access.md)
- [简体中文完整文档](docs/zh-Hans/README.md)

## 本地数据、权限与更新

对话和配置存储在 App folder（应用文件夹）之外的本地位置。所配置的 Model 会收到生成回复所需的对话内容；Search（搜索）会连接所选搜索服务。除非用户主动导出，否则不会导出其他内容。文件与命令操作保持可见，并受 Approval boundaries（批准边界）约束。

更新 folder app（文件夹应用）时：关闭 Alt Theory，把新 Release 解压到新文件夹，然后运行新的 `AltTheory.exe`。若解压失败，请解压到路径更短的文件夹（Windows 有最大路径长度上限）。替换 App folder 不会删除单独保存的对话与配置数据目录。

## 帮助与故障排除

从 Composer（输入区）的工具中打开 **Helper（助手）**，或调用 `/helper`。在空白界面中，它会启动 Help conversation（帮助对话）；在既有工作旁，它会以独立的新上下文打开。Helper 可以依据当前文档回答 Alt Theory 的使用问题，并协助排查 Provider、API key、Model 与缺失工具的设置。

- [Common questions（常见问题）](docs/en/help/common-questions.md)
- [Imports and cross-harness continuity（导入与跨工具连续性）](docs/en/system-guide/imports-and-continuity.md)
- [完整 English 文档](docs/en/README.md)
- [简体中文文档](docs/zh-Hans/README.md)

## 从源代码构建

这是为希望检查或自行打包 App 的开发者与用户准备的次要路径。Desktop artifact（桌面产物）应在对应操作系统上构建。当前 Windows build（构建）使用 Node.js 24 与 npm 11 测试。

```bash
git clone https://github.com/syuan-research/alt-theory.git
cd alt-theory
npm ci
npm --prefix alt-theory-app/frontend ci
npm run build:electron
```

Windows 的 unpacked app（未打包应用）位于 `dist/win-unpacked/`。打包步骤、已知编译诊断、必要产物检查与 macOS 命令见 [canonical desktop bundle guide（规范桌面 bundle 指南）](development/releases/desktop-friend-bundle.md)。

## Repository map（仓库地图）

- `alt-theory-app/` — session engine（会话引擎）、web server（Web 服务器）与 frontend（前端）。
- `agent-assets/` — runtime identity（运行时身份）、Roles、Skills、knowledge bases 与 guidance（指导文件）。
- `electron/` 与 `scripts/` — desktop runtime（桌面运行时）与打包。
- `docs/en/`、`docs/zh-Hans/` — 用户文档。
- `development/architecture/` — 当前 technical architecture（技术架构）。
- `development/releases/` — Release 与打包证据。

## License（许可）

Alt Theory 软件采用 MIT License。原创文档与 Agent assets（代理资产）采用 CC BY 4.0。路径范围和 Third-party notices（第三方声明）见 [LICENSE.md](LICENSE.md)。
