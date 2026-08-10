# 助手与界面内引导

## 助手

一个用于 Alt Theory 自身问题的新对话：原理与机制、设置所在位置、提供方、密钥与工具的引导式配置。

- 每次打开都会创建新的 Helper，不会暗中复用旧对话。中间已有对话时，新 Helper 挂在该 family 下并在右栏打开；没有中间对话时，它作为 root conversation 在中间打开。两种情况都会出现在对话列表，并保留完整的 `Helper` 标记。
- 它从空白 transcript context 开始。需要复制当前对话上下文的旁支问题，用[顺带](05-responses-and-controls.md)。
- 助手按当前文档回答。具体或可变的内容会查阅产品文档，对无法核实的步骤宁愿承认而不编造。

可从全局 Help 菜单、Related 空状态里的低调 Helper 入口、Help center 或 `/helper` 打开。Help 菜单也可以打开不创建对话的 Help center。Helper 是普通对话加内置 help Skill，不是单独的 agent 类型。

## 引导式配置

配置任务（缺少的工具、要配置的提供方、可选的期刊访问浏览器层）仍走同一个助手入口。它会用日常语言说明要安装什么、能做什么、大约多大，由你确认或拒绝，然后验证是否成功。被拒绝的安装可走不安装的替代路径，存在的话。

引导说明在任何地方都能用，助手在任意对话中回答配置问题。执行安装是需在工作模式中进行的动作，从理解模式会指向模式切换。

## 适时教学

- 首次说明在第一次使用历史重写动作（修订、首次分叉）时出现一次。
- 轮换提示在你已经等待时（智能体思考或长工具运行时）显示单行能力，约 2 秒后开始。Help center 使用同一份随产品发布、已本地化的 tip catalog；它不是由用户在 data dir 维护的文件。
- 命令面板自带教学：`/` 就是应用的索引。

## 助手不够时

问题见[常见问题](../help/01-common-questions.md)，限制见[已知限制](../help/02-compatibility-formats-limitations.md)，bug、反馈或研究计划见[README](../README.md#releases-bug-reports-and-the-research-program)。
