---
title: CodeStable AI Agent Skills 体系解析与实操指南
version: 0.2
created: 2026-05-31
author: Research Pair & AI Assistant
description: 对 CodeStable (liuzhengdongfortest/CodeStable) 智能体本地开发生命周期管理体系的设计哲学、物理实体、目录结构与命令规约进行客观、结构化的整理与分析。
---

# CodeStable AI Agent Skills 体系解析与实操指南

本报告针对 CodeStable AI 智能体开发辅助体系（项目 GitHub 仓库 `liuzhengdongfortest/CodeStable`）进行结构化、客观的技术性解析。报告立足于代码库物理实体与设计规约，系统解构其物理结构、核心流程、特定机制及相关概念，不作价值评判与修饰。

---

## 1. 核心理论定位与物理结构 (Physical Structure)

CodeStable 是一套面向严肃软件工程的 AI 编码生命周期管理工具箱，以物理项目中的文件系统和特定的 slash 命令规约作为智能体和人类协作的契约接口。

### 1.1 物理路径与实体职责
在 onboard 接入后，项目根目录下将建立唯一的配置和元数据目录 `.codestable/`。该目录由 8 个功能各异的子目录和核心入口组成：

```
.codestable/
├── attention.md                # 智能体启动必读的项目硬约束与前置环境注意事项（物理入口文件）
├── requirements/               # 需求聚合目录，描述系统“为什么需要某能力”
│   ├── VISION.md               # 需求索引中心（按 status 分组）
│   └── {slug}.md               # 扁平独立的能力愿景文件
├── architecture/               # 架构中心目录，描述“用什么结构实现”，仅记录现状
│   ├── ARCHITECTURE.md         # 架构总入口（全局索引与重大决策）
│   └── {type}-{slug}.md        # 独立子系统或模块架构文档
├── roadmap/                    # 规划目录，承载大需求的分解与跨 feature 契约
│   └── {slug}/                 # 一个宏观规划占用一个目录
│       ├── {slug}-roadmap.md   # 规划主文档（背景、概设、详设接口、子任务）
│       └── {slug}-items.yaml   # 机器可读的任务清单与依赖 DAG 映射文件
├── features/                   # 新能力流程的物理 spec 聚合根
│   └── YYYY-MM-DD-{slug}/      # 每个 feature 占用一个以日期 and slug 命名的子目录
│       ├── {slug}-brainstorm.md# 想法讨论记录（可选）
│       ├── {slug}-design.md    # 编排与名词层设计规范文档
│       ├── {slug}-checklist.yaml# 唯一执行清单（包含 steps 和 checks）
│       ├── {slug}-acceptance.md# 验收报告文档
│       └── {slug}-ff-note.md   # 快速通道 ff 模式的唯一归档记录（与上述四文件互斥）
├── issues/                     # Bug 修复流程的物理 spec 聚合根
│   └── YYYY-MM-DD-{slug}/      # 每个 issue 占用一个子目录
│       ├── {slug}-report.md    # 问题描述报告
│       ├── {slug}-analysis.md  # 根因分析文档（复杂问题特有）
│       └── {slug}-fix-note.md  # 修复验证记录（必出产物）
├── refactors/                  # 重构流程目录（Beta 阶段）
├── compound/                   # 长期知识沉淀统一目录，包含 learning/trick/decision/explore 4 类文档
│   └── YYYY-MM-DD-{doc_type}-{slug}.md
├── tools/                      # 共享脚本目录（如校验器 validate-yaml.py，搜索器 search-yaml.py）
└── reference/                  # 共享参考规范目录（如 shared-conventions.md，maintainer-notes.md）
```

### 1.2 核心入口 `.codestable/attention.md` 规约
在 CodeStable 体系中，`.codestable/attention.md` 取代了外部 `AGENTS.md` 或 `CLAUDE.md`，成为智能体启动每次必读的项目注意事项。
* **物理位置**：固定在 `.codestable/attention.md`。
* **强制性**：所有 `cs-*` 子命令和主入口在启动时均会触发前置扫描，如果缺失此文件，将视为骨架不完整，提示先运行 `cs-onboard`，禁止智能体回退至外部入口。
* **内容守则**：该文件仅记录高优先级、每次启动都必须知道的极简硬约束（如：特定的编译前置、测试指令、目录禁区、凭证规则）。实质内容由项目 Owner 手动定义，AI 仅提供空骨架，禁止凭空代填。

---

## 2. 核心工作流与衔接协议

CodeStable 将开发活动组织为三条标准管线，并通过特定的机器可读文件与状态机实现协作闭环。

### 2.1 新增能力流程 (Feature Flow)
新功能开发通过 `cs-feat` 进行分流与状态路由，在物理上严格经过四个阶段，并包含阶段间的人工 Checkpoint 以防止智能体发散。

#### 1. brainstorm（脑暴）
若想法模糊（无法清楚说明真问题、核心行为及至少一条明确的边界限制），先触发 `cs-brainstorm`。该命令会评估需求并分诊：
* **Case 1 (明确)**：直接进入 `cs-feat-design`。
* **Case 2 (小需求未收敛)**：产出 `{slug}-brainstorm.md` 归档并进入设计。
* **Case 3 (大需求)**：移交给 `cs-roadmap`。

#### 2. design（设计方案）
由 `cs-feat-design` 生成 `{slug}-design.md` 和唯一物理清单 `{slug}-checklist.yaml`。设计规范严格专注于“名词层”和“编排层”的现状与变化：
* **名词层**：对实体、数据结构、类型签名给出“现状 → 变化”两段式对比，且强制包含“输入 → 输出”示例。
* **编排层**：定义 Workflow 拓扑并附带 mermaid 流程图，不深入“具体改哪些函数”等计算层细节。
* **卸载设计**：规定必须显式描述挂载点清单（如挂载的文件、事件注册等），要求能够清晰回答“若卸载此 feature 应拔掉哪些地方”。

#### 3. checklist.yaml 生命周期与“编排-计算分离”
`checklist.yaml` 是 feature 执行的唯一凭证，其核心结构设计展现了“编排-计算分离”的粒度切片策略：

```yaml
steps: # 推进步骤，由 design 阶段起草，implement 阶段消费
  - step: 1
    name: "编写骨架接口并定义类型"
    status: pending # pending -> done
  - step: 2
    name: "实现逻辑节点并集成"
    status: pending
checks: # 验收检查点，由 design 确定，acceptance 阶段消费
  - check: "输入空值时返回特定的错误签名"
    status: pending # pending -> passed | failed
```
* **Steps 编排粒度**：以实现逻辑流拓扑为单位（骨架搭接 -> 核心计算组件填充 -> 持久化接通 -> 集成测试），**严禁下沉至 file:line 或函数级别**。
* **Checks 验收粒度**：直接对应设计中的名词边界与验收契约。

#### 4. Fastforward (ff) 快速通道
针对范围极小、无跨模块风险且推进步骤在 4 步以内的微小需求，允许运行 `cs-feat-ff`。
* **机制**：跳过标准的 design、checklist 和 acceptance 文档。
* **唯一物理产物**：在 features 下直接生成 `{slug}-ff-note.md` 记录本次改动、挂载点及轻量回顾，以此作为 scoped-commit 归档。

---

### 2.2 Bug 修复流程 (Issue Flow)
Issue 流程严格在“看到问题”和“动手改代码”之间塞入分析缓冲，使用 `cs-issue` 路由。

```
发现问题 ──────> 提报报告 (cs-issue-report)
                  │
                  ▼
              根因分析 (cs-issue-analyze)
                  │
                  ▼
              定点修复与验证 (cs-issue-fix)
```

* **报告阶段 (`report.md`)**：收集复现路径、报错栈及受影响面。
* **分析阶段 (`analysis.md`)**：针对根因不显著的问题。智能体必须给出技术假设与代码排查路线，确定真实故障位置，防止治标不治本。
* **修复与验证阶段 (`fix-note.md`)**：这是**必须产出的物理凭证**（包含定点修复细节和具体的回归测试结果），不允许省略。
* **快速通道判定规约**：只有当 AI 读完代码后对根因高度确定、修复改动仅 1-2 处且无任何跨系统耦合时，才可从 `cs-issue-report` 启动快速通道。快速通道省去 report 与 analysis 物理文件，直接修复并产出 `fix-note.md`。

---

### 2.3 长期规划层 (Roadmap Flow)

`.codestable/roadmap/` 用于承载无法塞入单个 feature 的大需求的事前概设与拆解规划。

#### 1. {slug}-items.yaml 结构与 depends_on 依赖映射
roadmap 管理的子 feature 关系在 `{slug}-items.yaml` 中进行机器可读化定义，依赖映射遵循有向无环图 (DAG) 规则：

```yaml
items:
  - slug: "auth-base"
    description: "基础认证组件定义"
    depends_on: [] # 无前置依赖
    status: planned # planned | in-progress | done | dropped
    feature: null
  - slug: "auth-jwt"
    description: "JWT 令牌支持"
    depends_on: ["auth-base"] # 声明前置依赖关系，必须在 DAG 中成立
    status: planned
    feature: null
    minimal_loop: true # 标记为最小闭环条目（完成后端到端可演示路径）
```

#### 2. Roadmap 与 Feature 流程的衔接协议
* **启动阶段**：`cs-feat-design` 启动时若指向 roadmap 中的条目，则读取契约，在 `{slug}-design.md` 的 frontmatter 中记录 `roadmap: {slug}` 与 `roadmap_item: {sub-slug}`。同时，设计落盘时将 `items.yaml` 对应条目的 `status` 改为 `in-progress`，并填入 feature 物理目录名。
* **硬约束输入**：**roadmap 中的“接口契约”（详设）是子 feature 设计的硬性约束输入**。如果在设计阶段发现接口描述不合理，**必须先返回 `cs-roadmap update` 修改契约**，禁止在子 feature 内部自作主张绕过，以防止并行/串行开发的 feature 接口失配。
* **验收回写**：`cs-feat-accept` 通过后，自动回写对应的 `items.yaml`，将 `status` 变更为 `done`。

---

## 3. 特有机制与物理实操规约

CodeStable 包含多项基于物理规则与命令机制的设计，用于维持项目文档体系和代码库的高健康度。

### 3.1 知识沉淀与查重检索机制 (Compound Archive)
所有长期归档类知识文档（learning 踩坑, trick 处方, decision 规约, explore 调研）均存放在统一的物理目录 `compound/`。
* **命名规则**：`compound/YYYY-MM-DD-{doc_type}-{slug}.md`，便于 `ls` 按日期和类型快速排序与 grep。
* **查重防护（三条路径）**：在新建任何归档前，必须运行共享工具 `python .codestable/tools/search-yaml.py` 进行语义查重，并将冲突或重叠的结果列出，由用户选择具体路径：
  1. **更新已有**（第一顺位）：沿用旧文件和原创建日期，修改 frontmatter 追加 `updated: YYYY-MM-DD` 并在文末写更新说明。
  2. **Supersede（废弃替代）**：旧文档 status 改为 `superseded`， frontmatter 标记 `superseded-by: {新 slug}`，文顶加粗标识；新文档标记 `supersedes: {旧 slug}`。
  3. **不同主题**：新建文档，在末尾的“相关文档”中显式对比旧文档，阐明区别。

---

### 3.2 架构文档的分组升级规约
在 `architecture/` 下，文件命名统一采用 `{type}-{slug}.md` 形式（例如 `ui-chat.md`，`cli-entry.md`），以实现同类聚合。

* **自动重组触发线**：当某个 type 在根目录平铺的文件数量**达到或超过 6 份时**，在进行 `cs-arch` 的 `backfill` 或 `update` 落盘时，智能体必须在 Phase 5 提请 review，并在 Phase 6 执行物理重组：
  * 将同类文件迁入同名子目录，并移除 type 前缀（例如：`ui-chat.md` 与 `ui-events.md` 迁移重组为 `ui/chat.md` 与 `ui/events.md`）。
  * 自动修复 `ARCHITECTURE.md` 内的所有索引链接。
* **单向不可逆性**：此项重组一旦完成，即使后续文件删除导致同类目录下的文件数 ≤5 份，**也严禁将目录折回复原为平铺文件**。

---

### 3.3 设计阶段 2.5 节“结构健康度与微重构”规约
在 `cs-feat-design` 中，第 2.5 节“结构健康度与微重构”被设定为强制必须开展的评估动作，用于抵制智能体在开发过程中向胖文件硬塞代码或无限制平铺目录的倾向。
* **双维度评估对象**：
  1. **文件级**：评估本次计划修改的文件是否职责过载（偏胖）。
  2. **目录级**：评估新文件即将落入的目录结构是否过于平整。
* **行动边界（只搬不改行为）**：
  * **允许的微重构**：纯粹的“文件搬运”与“重组目录”，导入路径的自动刷新，以及无行为修改的文件拆分（全程编译器绿灯验证）。
  * **超纲范围的处理**：一旦微重构涉及改动函数签名、修改返回值结构、改变调用逻辑语义等破坏行为的改变，则**严禁在本流程内进行**。必须将其作为观察项记录在第 2.5 节末尾，提示用户“建议后续走 `cs-refactor` 处理”，不阻塞且不作为本 feature 的前置依赖。
  * **Checklist 的衔接**：通过整体 review 确认要进行的微重构，必须写入 checklist 的 `steps` 第一步，并具备独立的退出验证信号。

---

### 3.4 收尾提交与范围守护 (Scoped Commit)
* **硬性边界约束**：无论 feature 验收还是 bug 修复通过，收尾提交（scoped-commit）必须将改动范围严格锁死在“本次工作改到的代码 + 相关 spec 文件 + 本次更新的架构/规划文档”。
* **反向禁令**：**严禁在实现 feature 时偷偷修改无关 bug，也严禁在修复 issue 时偷偷加新功能**。未对齐的修改必须另外启动相应的流程，不准合并提交，防止 git 提交流和文档凭证断裂失真。

---

## 4. 概念辨析与特定事实澄清 (Concept Alignments)

本节就问答阶段中涉及的行业标准与 CodeStable 特有实现进行归纳澄清，剥离通用常识，保留体系相关的特定事实。

### 4.1 Feature (特性)
* **行业通用**：软件系统中独立可交付的功能或业务能力。后台的核心主体模块在行业中亦被称为系统级的 feature。
* **CodeStable 规约**：在 `.codestable` 体系中，feature 物理文件只存放“从来没有且要加进来的新功能或新能力”，在流程上必须通过 `cs-feat`（脑暴、设计、实现、验收）闭环。内部重构或纯技术债不产生用户可感能力的，在 design 中标记为“不新增能力”，不强制产出需求文档（Requirement）。

### 4.2 Issue (问题)
* **行业通用**：问题跟踪器（如 Jira、GitHub Issues）中的基本条目，包括任务、缺陷、调研等。
* **CodeStable 规约**：特指“本来应该好的东西坏了”，即已存在的代码 bug、异常行为、文档错漏或性能故障。它的流程是 `cs-issue`（报告、分析、修复记录），物理产物严格在 `issues/` 目录下管理。

### 4.3 验收 (Acceptance)
* **行业通用**：通过一系列测试用例或演示，确认软件满足用户合同或 PRD 约定的过程。
* **CodeStable 规约**：是 `cs-feat-accept` 这一物理步骤。它直接对照 design 生成的 `checklist.yaml` 中的 `checks` 场景列表（包含正常路径、边界和错误分支），逐个核对并把 `pending` 改为 `passed`，修改对应的 requirements status（从 `draft` 到 `current`）并同步回写 items.yaml 的 done 状态。

### 4.4 depends_on 属性 vs AFK/HITL 属性
* **depends_on**：是 **CodeStable `roadmap` 的原生属性**。在 `{slug}-items.yaml` 文件中用来定义子 feature 之间的 DAG 依赖流，直接决定子 feature 启动时的前置置信度（依赖未 done 则子 feature 不能启动）。
* **AFK (Away From Keyboard) / HITL (Human-In-The-Loop)**：**不属于 CodeStable 体系**。这两个属性是 Matt Pocock AI Agent Skills 体系中 `to-issues` 技能下的任务调度属性，用于定义任务是让脱机智能体完全自主执行（AFK）还是需要人类全程跟进决策（HITL）。本报告在此予以客观区分与澄清。

### 4.5 以概念为单位建档的机制
* **核心意图**：反对“在单个长文档中无序追加内容”的做法。CodeStable 遵循“小粒度、特定概念名称”的物理建档逻辑（如 compound 下以 slug 区分的小文档，architecture 下 `{type}-{slug}.md`），以避免大文档过度膨胀导致的上下文窗口溢出、信息退化和维护困难。

---

## 5. 详细命令列表与物理规约 (Commands & Contracts)

CodeStable 在终端环境下提供了一套显式交互接口：

| Slash 命令 | 子系统职责 | 涉及的物理读写 |
|---|---|---|
| `/cs` | 工作流分诊路由中心 | 仅读 `.codestable/` 结构及 attention.md，不写任何文档，给出子技能建议 |
| `/cs-onboard` | 骨架初始化与迁移归档 | 写 `.codestable/` 8 个空目录及 ARCHITECTURE.md 占位、attention.md 空骨架，从技能包强制物理拷贝 tools/ 和 reference/ 目录并覆盖副本 |
| `/cs-req` | 维护能力愿景文档层 | 写 `requirements/{slug}.md`，更新或初始化 `requirements/VISION.md` 索引清单 |
| `/cs-arch` | 维护长效系统架构地图 | 写 `architecture/{type}-{slug}.md`，更新全局 `ARCHITECTURE.md`。包含 backfill / update 模式下命中阈值（同类数量 ≥6）时的目录升级搬迁 |
| `/cs-roadmap` | 宏观需求概设详设与 DAG 拆解 | 读写 `.codestable/roadmap/{slug}/` 下的主 md 和 items.yaml。校验 YAML |
| `/cs-feat` | 新功能阶段路由控制 | 根据物理文件判定并路由子步骤，不写 spec 与代码 |
| `/cs-feat-design` | 起草方案与提取 checklist | 读 onboard 共享参考。创建 features 目录，写 `{slug}-design.md` 和 `{slug}-checklist.yaml`。如果是从 roadmap 启动，回写 items.yaml 为 in-progress |
| `/cs-feat-impl` | 按步骤编写代码与阶段自省 | 读 checklist.yaml 执行。写物理代码，更新 steps 的 pending -> done。触发 2.5 节反射检查与可能的 provable 搬移重构 |
| `/cs-feat-accept` | checks 核对与项目索引回写 | 读设计 checks。更新 checks status，回写 roadmap items.yaml 状态，触发 req 状态从 draft 到 current 的升级，并回写变更日志 |
| `/cs-issue` | 修 bug 流程分流控制 | 根据物理文件判定当前修复阶段并分流，不做实质修复 |
| `/cs-note` | 追加一两行项目注意事项 | 读写 `.codestable/attention.md`，执行增量行追加 |

---

## 6. 版本变更日志 (Changelog)

### v0.2 (2026-05-31)
* **建立本报告**：全面汇编了 `liuzhengdongfortest/CodeStable` 仓库的代码实体，梳理了 8 个子目录在物理和逻辑上的职能及文件命名规范。
* **核心流解构**：详细整理了 Feature 工作流中 `checklist.yaml` “编编-计算分离”的设计粒度，以及 Issue 工作流快速通道的唯一判定口径。
* **规划层 DAG 对齐**：明确了 `roadmap` 中使用 `{slug}-items.yaml` 和 `depends_on` 构造 DAG 依赖关系并标记 `minimal_loop` 最小闭环的物理设计，梳理了 roadmap 与 feature 之间的接口契约硬约束衔接协议。
* **特有机制记录**：记录了 compound 知识查重三条路径、架构文档 ≥6 自动子目录升级重组、设计第 2.5 节“只搬不改行为”微重构评估及 7 大写代码反射检查等特色工程实操规约。
* **对齐问答事实**：在概念辨析中剔除了通用的软件工程常识，聚焦于体系特定的 Issue/Feature 定义。**明确区分并澄清了 `depends_on` 是 CodeStable 的原生属性，而 `AFK/HITL` 则属于 Matt Pocock 技能的特有属性**，消除了混淆。

---
