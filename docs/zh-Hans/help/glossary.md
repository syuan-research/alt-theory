# 术语

本产品的术语集中定义。交叉引用指向每个术语的完整页面。

**理解模式**，谨慎对话的能力模式，触及范围受限，不执行命令、不访问实时网络、不挂载项目文件夹。是完整的使用方式，而非工作模式的预览。
[→ 理解模式与工作模式](../start-here/understand-and-work.md)

**工作模式**，具备实际触及范围的能力模式，包括工作目录、实时检索与抓取、文档生成、命令，均在可见的授权下进行。
[→ 理解模式与工作模式](../start-here/understand-and-work.md)

**对话**，使用 Alt Theory 的基本单位。一条讨论与行动的线索，各自带有历史、模式、模型与材料。持久、可接续、可移植。
[→ 对话与历史](../system-guide/conversations-and-history.md)

**分叉**，从某条消息分出的一场相关对话，携带到该点为止的所有内容，原线保持完整。用于对比回复的控制之一。
[→ 处理回复与控制](../system-guide/responses-and-controls.md)

**对比面板**，分叉或同提示重试后，中央区域按 50/50 比例开启的视图，便于并排阅读两个版本的回复。顺带、助手与工作者保持在窄侧栏。
[→ 处理回复与控制](../system-guide/responses-and-controls.md)

**顺带（BTW）**，主对话旁的侧边对话，携带当前上下文，用于发散话题。
[→ 处理回复与控制](../system-guide/responses-and-controls.md)

**助手**，应用内置的助理，用于回答关于 Alt Theory 自身的问题。每次以新会话开始（不读取当前对话），依据当前文档回答。
[→ 助手与界面内引导](../system-guide/helper-and-guidance.md)

**工作者**，一场由牵头对话委派有边界任务的子对话。它以独立会话运行，采用受限的模式，模型层级可低于、等于或高于牵头方，最多三个并行。`(planned)` 技能（技能按钮、角色强度）扩展这一层，但尚未实现。
[→ 智能体团队与子代理会话](../system-guide/agent-team-and-subagents.md)

**工作目录**，附在工作对话上的本机文件夹，智能体可在其中读写文件，也是其可修改范围的边界。
[→ 工作目录、文件与路径](../system-guide/working-folders-files-paths.md)

**知识库（KB）**，经过精选的参考资料，每场对话可选，供智能体在讨论中援引为事实依据。区别于工作目录。
[→ 知识库与上下文](../system-guide/knowledge-bases-and-context.md)

**角色**，一种可选的呈现层，包括语气、节奏、教学风格。改变智能体的呈现方式，从不改变其原则。
[→ 自定义](../advanced/customization-without-changing.md)

**灵魂**，身份层本身，包含智能体的世界观与原则，任何角色都不能覆盖。与其他一切一样，是一份可读的文件。
[→ 自定义](../advanced/customization-without-changing.md)

**技能**，一份可读的指令文件，规定智能体处理某类任务的方式。内置技能承载产品的机制，用户自有的技能与之并列。
[→ 技能如何工作](../system-guide/how-skills-work.md)

**技能按钮** `(planned)`，一个跨多轮保持开启的技能，而非一次性调用。激活时按钮变深，之后渐淡，双击锁定。尚未进入界面或代码。
[→ 以理解为目标](../using-the-app/when-understanding-is-the-goal.md)

**命令**，在 `/` 面板中按名称调用的任何内容，包括技能，以及 `/branch`、`/compact` 等对话操作。
[→ 命令](../system-guide/commands.md)

**技能与命令的命名**，可调用标识符以英文 id 为准，须与文件夹名、slash 面板中的字符串完全一致（含连字符与大小写）。文档写法为英文在前、中文释义在括号内，例如 `adaptive-aligning（自适应对齐）`、`/branch`（分叉）。概念类用语（技能、命令、理解模式）可继续用中文。目前没有中文别名；只写中文名无法在 `/` 面板中激活。

**工具箱**，输入框旁的常用操作菜单，是入口，不是完整清单。
[→ 工具箱](../system-guide/toolbox.md)

**授权**，当一项操作越过对话边界（外部读取、网络访问、安装）时显示的请求。拒绝总是安全的，未表态视为不同意。
[→ 权限](../system-guide/permissions-approvals-agent-activity.md)

**压缩**，将长对话早先的轮次可见地凝缩为摘要，以便对话在模型上下文窗口内继续。
[→ 对话与历史](../system-guide/conversations-and-history.md)

**软删除**，删除对话会从列表中隐藏，但数据保留在磁盘上，可在清理前恢复。例外是托管的私密会话，在一段时间无活动后会被硬删除。
[→ 对话与历史](../system-guide/conversations-and-history.md)

**导入**，把另一工具（Pi、Claude Code、Codex、OpenCode、Grok Build）中的对话带入 Alt Theory，作为普通的可续接对话，对损失部分明确标注，而非掩盖。
[→ 导入与连续性](../system-guide/imports-and-continuity.md)

**外挂**，Alt Theory 的资产打包后供其他工具使用，内置技能保持原样，外加一份按该工具格式编写的智能体定义，承载产品身份。
[→ 外挂与能力差异](../advanced/plugins-and-capability-differences.md)

**Pi**，应用所基于的开源代理工具。对话、技能与配置遵循生态约定而非自有约定，原因正在于此。
[→ 应用与外挂](../start-here/app-and-plugins.md)

**模型 / 提供方**，为对话提供能力的 AI 模型，以及按用户账号提供该模型的服务。应用与模型无关，每场对话可选。
[→ 模型、提供方与访问](../system-guide/models-providers-access.md)

**来源标注**，每条断言均按来源标注，包括现场查得（附引用）、模型记忆（标注为未核实）或推断所得（明确说明）。
[→ 检索、来源与网页内容](../system-guide/search-sources-web.md)
