# 插件与能力差异

本页面向在应用与插件形态之间做选择、或两者并用的读者。假定你了解自己的 harness。

## 插件形态究竟是什么

插件是把 Alt Theory 的资产转换到你 harness 的标准——不是应用的移植：

- **内置技能，不变。** 技能在遵循标准技能约定的 harness 之间通用；你得到的方法文件与应用随附的相同
  （[目录](../system-guide/bundled-skills.md)）。
- **以你的 harness 格式写的 agent 定义** — harness 声明 agent 人格/子代理的方式——内容承载 Alt Theory 的身份与原则（soul 与角色材料）。
- **可选知识库**：你放在 harness 可读位置的 markdown 材料，由 agent 定义引用。

你买到的是：Alt Theory 的工作方式——有出处纪律的搜索、宁拒不编、方向设定前对齐、计划记录、克制编辑——在你已经工作的工具里。

## 能力差异

| 能力 | 应用 | 你 harness 中的插件 |
|---|---|---|
| 以理解为先的行为（soul、原则） | 内置 | 经 agent 定义 |
| 内置方法技能 | 内置 | 相同技能，安装到你的 harness |
| Understand/Work 模式边界 | 应用强制 | 改由你 harness 的权限模型 |
| 批准 UI 与策略层 | 应用的 | 你 harness 的 |
| 搜索/抓取/转换工具 | 经技能捆绑的 CLI 工具 | 技能使用你 harness 同类原生工具，或环境中已有的相同 CLI |
| 知识库选择器、角色 UI | 应用 UI | 手动：自行放置并引用材料 |
| 对话列表、分支/BTW/Helper UI | 应用 UI | 你 harness 自己的对话功能 |
| 从其他 harness 导入 | 应用功能 | 不包含 |

一个诚实的细微处：*方法*技能（search-policy、aligning、plan-record、precise-edit、conventions）作为纯指令迁移。三个工具驱动技能（web-search、page-fetch、doc-convert）作为文件迁移但规定特定命令行工具——需在宿主环境安装，或由 harness 同类原生工具替代。search-policy 有意在任何情况下可移植：它命名所需工具的*种类*（通用搜索、可读抓取），从而约束 harness 中匹配的工具。

## 什么不迁移

模式边界值得明确：你 harness 的权限模型取代 Understand/Work。若 harness 默认有宽工具访问，插件的 agent 定义带来 Alt Theory 的*判断*，但不带来应用的*强制*——请配置 harness 自身权限以匹配你想要的姿态。

## 选择，以及两者并用

- 你要的是方法，harness 是你日常所在 → 插件。
- 你要强制的思考环境、研究表面、UI——或向非 harness 同事推荐产品 → 应用。
- 两者：正常且支持。装在共享跨 harness 位置的技能同时服务应用与 harness，对话可
  [在其间移动](cross-harness-work.md)。

## 可用性

插件打包跟踪应用发布线；查仓库了解当前各 harness 安装说明，以及当前打包了哪些 harness 格式。
