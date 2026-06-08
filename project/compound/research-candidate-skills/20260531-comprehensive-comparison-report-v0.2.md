---
title: CodeStable 与 Matt Pocock Skills 体系深度对比与融合架构报告
version: 0.2
created: 2026-05-31
author: Research Pair & AI Assistant
description: 针对两个智能体开发辅助仓库（CodeStable 与 Matt Pocock Skills）在工作流骨架、决策模型、不确定性应对、物理结构、准入成本、冲突边界及 Git/Worktree 搭配规约等 9 个核心工程问题进行中性、深入的解构与对比，并输出融合实施指南。
---

# CodeStable 与 Matt Pocock Skills 体系深度对比与融合架构报告

本报告针对 CodeStable AI Agent Skills 体系（项目仓库 `liuzhengdongfortest/CodeStable`）与 Matt Pocock AI Agent Skills 体系（项目仓库 `mattpocock/skills`）进行系统、深度的对比分析。报告旨在解构其具体的工程机制、物理实体冲突和协作手势，并为成熟项目的研发流演进提供无偏向的技术选型建议与融合方案。

---

## 1. 核心工作流骨架对比 (Primary Workflow Backbone)

若在演进的软件项目中必须且只能选择一个仓库作为主干工作流骨架：
* **选型结论**：对于成熟的研发团队或资深程序员，**选择 Matt Pocock Skills 作为主干骨架更为适宜**；对于需要从零建立强规范约束、追求本地完备性闭环的交付项目，**CodeStable 提供了更为完备的生命周期数据库**。
* **核心折中**：“完整性/重度规范”不等于“高效”。CodeStable 的重度目录要求和同步管道对已有成熟体系的侵入性极大，而 Matt 体系的高解耦性更容易与团队已有的脚手架和流程契合。

### 1.1 四维度技术对比

| 评估维度 | CodeStable 体系机制 | Matt Pocock 体系机制 | 权衡与分析 |
| :--- | :--- | :--- | :--- |
| **文档结构** | **物理强约束**：强制在 `.codestable/` 下划分 8 个固定子目录，采用严格的 YAML frontmatter 规约，通过本地校验器（`validate-yaml.py`）进行机器复核。 | **逻辑文本化**：以高解耦的 markdown 规范（如 `CONTEXT.md`、ADR、`.out-of-scope/`）作为约束契约，不限制项目的物理目录树。 | CodeStable 提供极佳的**本地防遗忘与防压缩检索能力**；Matt 提供极佳的**低摩擦与非侵入性**。 |
| **规划流程** | **路线图与依赖 DAG 驱动**：在 `roadmap/{slug}/` 下使用 `{slug}-items.yaml` 和 `depends_on` 属性显式编排子特性的有向无环图，并标出最窄可演示路径“最小闭环（`minimal_loop`）”。 | **压力对齐与垂直切片驱动**：采用一问一答的压力面试（`grill-me`）逐层遍历 Brooks 设计决策树，延迟代码承诺；将任务进行垂直切片（Tracer Bullets）以 Issue 形式挂载。 | CodeStable 适用于**复杂宏观工程的本地逻辑编排**；Matt 适用于**设计阶段的决策纠偏与敏捷任务分拆**。 |
| **实现支持** | **编排与计算分离**：通过 `checklist.yaml`（`steps` 推进步骤与 `checks` 场景用例分离）指导开发，在 implement 阶段强制执行 Phase 2.5 结构健康度评估与 7 大代码反射检查。 | **测试驱动与复现管线**：提供 `tdd`（行为集成测试与外部 Mock 规约）和 `diagnose`（reproduce → minimise → hypothesized 诊断环）指导代码细节。 | CodeStable 强在**防漂移的步骤守护**；Matt 强在**微观上的测试工程纪律与自动诊断动作**。 |
| **长期维护** | **本地实体化**：将所有生命周期实体（需求、架构、Bug 分析、沉淀）存放在物理仓库中，伴随 git checkout 切换状态，防历史蒸发。 | **外部集成化**：将大量任务状态交由外部追踪器，本地仅保留元参考，若外部跟踪器丢失或漂移，本地文档无法完全自闭环。 | CodeStable 的本地完备度极高，但对程序员造成的维护摩擦力较大；Matt 维护摩擦力小，但资产有外流漂移风险。 |

---

## 2. 实质性重叠与冗余区域分析 (Overlap / Redundancy)

在实际合并使用两套体系时，以下三个领域会产生显著的物理重叠，需通过流程剪裁进行去冗余：

### 2.1 特性设计与规范起草 (Feature Design / Spec)
* **重叠表现**：CodeStable 的 `cs-feat-design`（生成 `{slug}-design.md` 和 `{slug}-checklist.yaml`）对标 Matt 的 `to-prd`（生成 PRD 并发送至 issue 跟踪器）。
* **技术对比**：CodeStable 强在通过 checklist 强制实行 Steps/Checks 分离，提供可供 implement 阶段无脑推进的步骤轨；Matt 强在前期通过 Relentless Interview 对抗假二元对立并延迟代码承诺。
* **冗余规避**：直接并存会导致多重 Spec 文档冗余。推荐**流程剪裁**：使用 Matt 的 `grill-me` 压力对齐作为前期磋商工具，达成一致后，直接将其决策作为输入录入 CodeStable 的 design.md，仅保留一份本地物理设计规范。

### 2.2 缺陷修复与诊断管线 (Bug Diagnostics)
* **重叠表现**：CodeStable 的 `cs-issue` 三阶段（report -> analyze -> fix-note）对标 Matt 的 `triage`（分流）与 `diagnose`（诊断）。
* **技术对比**：CodeStable 强在归档流程，强制输出 `analysis.md` 和 `fix-note.md` 作为日后诊断回溯的物理凭证；Matt 强在具体的物理排查策略，其 `diagnose` 强制要求智能体必须编写自动化验证脚本并调用 `git bisect run` 自动二分定位故障节点。
* **冗余规避**：两者无排他性冲突。推荐**机制融合**：采用 CodeStable 的 `issues/` 物理目录管理架构，但在执行 `cs-issue-fix` 修复与验证代码时，直接引入 Matt 的 `diagnose` 自动化 bisect 及复现绿灯规约。

### 2.3 架构决策与规约记录 (Architecture Decisions)
* **重叠表现**：CodeStable 的 `cs-arch`（`architecture/` 目录）与 `cs-decide`（`compound/` 下的 decision 类型）对标 Matt 的 `docs/adr/`。
* **技术对比**：两者在记录 ADR 的实质上等效。但 CodeStable 独创了平铺文件达到 6 份时自动向子目录归并且单向不可逆的分组升级规约，能够更好地维护物理目录的整洁。
* **冗余规避**：**必须二选一**。建议统一采用 CodeStable 的 `architecture/` 目录组织形式，以规避重复的决策文件。

---

## 3. 非重叠特有能力分析 (Non-overlap Capabilities)

两套体系各自独占且对日常开发具有实质性影响的核心能力如下：

### 3.1 CodeStable 独占能力
* **Roadmap 依赖图与 items.yaml**：通过 `{slug}-items.yaml` 中机器可读的 `depends_on` 属性编排 DAG。前置依赖未 done 时，下游 feature 在 design 阶段会被物理拦截，阻止盲目并行导致的代码失配。
* **知识沉淀查重与演进守护 (`search-yaml.py`)**：在 compound 目录下建档前前置运行语义查重，强行划定“更新已有（第一顺位）”、“Supersede 废弃替代”与“新建主题”三条演进路径，从物理上避免垃圾文档堆积。
* **独立的愿景需求层 (`requirements/`)**：`cs-req` 维护的愿景文档支持 `status: draft`，使“能力愿景”可以独立于“实现排期”先期磋商并落盘，并在验收时自动将 draft 升级为 current 并追加变更日志。
* **设计阶段 2.5 节“结构健康度与微重构”规约**：在动手开发前，强制评估目标文件和目录的胖瘦/平铺状态，若偏胖则在 checklist 第一步强制排入“只搬不改行为”的编译器绿灯微重构，防止文件职责无序恶化。

### 3.2 Matt Pocock 独占能力
* **Brooks 设计树单问一答对齐 (`grill-me`)**：强制智能体一次只向人类提一个决策问题，严禁智能体过早吐出整体规划或直接写代码，迫使双方在设计叶子节点收敛前延迟代码承诺。
* **Tracer Bullets 垂直切片与 Issue 状态机分类 (`triage`)**：建立 `needs-triage` 到 `ready-for-agent` 等 5 个状态流转，专为**多智能体并发开发**设计，有效规避并行智能体之间的代码摩擦。
* **AFK / HITL 任务调度属性**：在 issue 种子中显式标记任务是可交由脱机智能体完全自主执行（AFK）还是需要人类全程跟进决策（HITL）。
* **自动化 Bug 校验与 git bisect**：在 `diagnose` 中强制要求对已知两个 Commit 之间发生的 Bug，必须编写验证脚本并调用 `git bisect run` 自动定位。
* **原型开发逻辑/UI双路由 (`prototype`)**：逻辑问题路由至 `LOGIC.md`，UI 布局路由至 `UI.md`（通过悬浮底栏切换多变体参数的单页面路由系统）。

---

## 4. 物理归档与文件组织模型 (Folder & Artifact Structure)

* **对比结论**：**CodeStable 提供了明显更优的本地物理归档与资产组织模型**。Matt 体系主要依赖散落的、非强制约束的 markdown 文件与外部跟踪器，缺乏本地工程项目维度的完备生命周期归档闭环。
* **CodeStable 的组织模型结构**：

```
.codestable/
├── attention.md                    # 智能体启动必读的项目硬约束与前置环境注意事项（物理入口文件）
│
├── requirements/                   # 能力愿景层（为什么需要该能力，以人话描述，不含实现细节）
│   ├── VISION.md                   # 全局能力索引中心（按 status 分组）
│   └── {slug}.md                   # 扁平的能力愿景文件（status: draft | current | outdated）
│
├── architecture/                   # 系统现状架构地图（只记现状，不记计划）
│   ├── ARCHITECTURE.md             # 架构总入口（全局索引与重大决策）
│   └── {type}/{slug}.md            # 聚合的分组架构子文档（同类平铺文件达到 6 份时自动升级为子目录组织）
│
├── roadmap/                        # 规划层（怎么分步实现大需求）
│   └── {slug}/                     # 一个大需求占用一个目录
│       ├── {slug}-roadmap.md       # 规划主文档（含背景、概设、详设接口契约、子 feature 清单）
│       └── {slug}-items.yaml       # 机器可读的任务清单，定义 depends_on 的 DAG 依赖
│
├── features/                       # 新能力物理 spec 聚合根
│   └── YYYY-MM-DD-{slug}/          # 按首次创建日期与 slug 隔离的 feature 子目录
│       ├── {slug}-design.md        # 编排与名词层设计方案
│       ├── {slug}-checklist.yaml   # 包含 steps 与 checks 的“编排-计算分离”执行清单
│       ├── {slug}-acceptance.md    # 包含 checks 场景核对的验收报告
│       └── {slug}-ff-note.md       # （可选）快速通道 ff 模式的微量回顾记录
│
├── issues/                         # Bug 物理 spec 聚合根
│   └── YYYY-MM-DD-{slug}/          # 按提报日期隔离的 issue 子目录
│       ├── {slug}-report.md        # 问题提报与复现报告
│       ├── {slug}-analysis.md      # 根因排查与排路线分析
│       └── {slug}-fix-note.md      # 修复验证记录与回归测试报告（必出凭证）
│
└── compound/                       # 知识沉淀统一目录（共享查重机制，防止垃圾文档堆积）
    └── YYYY-MM-DD-{doc_type}-{slug}.md
                                    # doc_type ∈ {learning 踩坑, trick 处方, decision 规约, explore 调研}
```

---

## 5. 决策与应对不确定性机制 (Decision-making style under uncertainty)

两套体系在应对不同维度的“不确定性”时，各自设计了不同的物理与对话机制：

### 5.1 Matt Pocock 体系：强于“设计/需求前期（问题空间）”的收敛与对齐
* **机制 1：Brooks 设计树的单问一答对齐 (`grill-me`)**
  * *运作方式*：禁止智能体直接吐出整体规划或设计方案。规约强迫智能体针对树状决策分支，**一次只向人类提一个问题**。这迫使人类在部分信息（Partial Information）状态下，逐步澄清技术边界，只有在当前决策点确认后才沿着分支继续下行。
* **机制 2：高低保真度分流手势 (The Handoff Pattern)**
  * *运作方式*：在设计对齐中遇到高度不确定的“高保真问题”（如界面版式、具体交互体感）时，规约强制**暂停低保真的 Grilling 会话**，直接分流启动一个独立的原型会话（`prototype`）来编写抛弃型代码；实测得到反馈后，将确定性结论带回原 Grilling 会话。这有效避免了在纯文本设计中对高保真问题进行无意义的空对空猜测。
* **机制 3：超纲拦截规范 (`.out-of-scope/`)**
  * *运作方式*：在不确定的需求演进中，对于已被论证并否决的设计或技术选型，物理上在 `.out-of-scope/` 下建立以概念命名的 md 文件（如 `graphql-api.md`）。后续面临类似提案时直接以此拦截，避免团队陷入“重复论证先前已废弃选型”的恶性循环。

### 5.2 CodeStable 体系：强于“执行/技术落地（解空间）”的防漂移与探索
* **机制 1：需求层 status: draft 与规划层的解耦 (`requirements/`)**
  * *运作方式*：CodeStable 允许在 `requirements/` 下落盘一份仅表明用户愿景、痛点与边界但 `status: draft` 的需求文档。**该愿景可以独立于实现排期（Roadmap）而长期存在**。这为演进中的需求提供了缓冲区，允许愿景在被纳入具体设计（Design）前进行独立磋商，避免了“一提想法就必须立刻写技术规划”的强绑定。
* **机制 2：Spike 阶段的物理目录隔离 (`cs-brainstorm`)**
  * *运作方式*：面对技术解法不确定、涉及调研的 Case 2 场景，`cs-brainstorm` 会在 `.codestable/brainstorm/{slug}/` 下开辟独立的物理代码区进行 Spike 实验。在此目录内，智能体被允许任意修改文件进行技术可行性测定。实验完成后，结论回写到 `{slug}-brainstorm.md`，从而将“实验性的脏代码”与“生产主干”物理隔离。

### 5.3 机制对比权衡
* **当项目处于“想法极度发散、问题空间不清晰”时**：**Matt 体系更强**。其单问一答的压力面试能够有效逼出隐性知识，避免过早落盘。CodeStable 的多目录要求在此时会显得过于笨重。
* **当项目处于“技术实现路径模糊、需要快速写代码测定”时**：**CodeStable 体系更强**。其 `brainstorm/` 物理隔离区与 `status: draft` 的状态机为技术落地提供了明确的物理和逻辑约束。

---

## 6. 渐进式引入与准入成本 (Adoption cost under legacy context)

如果项目已经包含混乱的物理目录、遗留文档和零散笔记，两者的引入成本与渐进路径存在显著差异：

### 6.1 渐进式准入成本对比
* **CodeStable 准入成本：极高（重度侵入性）**
  * *原因*：其物理结构是强约束的。运行 `/cs-onboard` 会扫描全仓库，强行要求进行文档审计与迁移映射。它要求架构文档必须采用 `{type}-{slug}.md` 命名，新功能开发必须建立标准的 `features/YYYY-MM-DD-{slug}/` 目录并包含三份特定 md 及 YAML 清单。对于已有混乱文档的项目，这会强行制造一个**“全量重构/文档搬迁”**的重包袱，否则智能体在读取骨架时会判定“骨架不完整”而拒绝执行。
* **Matt Pocock 体系准入成本：极低（轻量级/非侵入性）**
  * *原因*：它**对项目的物理目录结构没有强假设**。它通过 `npx skills` 注入的只是一些独立的 `.md` 规约。它不强制要求你整理历史文档，而是直接兼容已有的 `docs/` 目录或 ADR 结构。它通过外部 Issue Tracker 追踪状态，不强制要求在本地生成复杂的 YAML 清单或状态索引。

### 6.2 最小可行准入路径 (Minimal Viable Adoption Path - MVAP)

#### 1. Matt Pocock 体系的最小可行准入路径（低摩擦）：
* **步骤 1**: 运行 CLI 注入 `grill-with-docs` 与 `diagnose` 两个核心规约。
* **步骤 2**: 在项目根目录下建立唯一的 `CONTEXT.md`，仅罗列当前项目核心领域名词与混乱文档的索引。
* **步骤 3**: 保持历史混乱目录不动。对新功能直接触发 `grill-me` 压力面试，达成一致后直接将 PRD 发送至外部 Tracker，完全不改动本地原有文档结构。

#### 2. CodeStable 体系的最小可行准入路径（折中避坑方案）：
如果必须在遗留项目里引入 CodeStable，为避免强制搬迁的灾难，其 MVAP 规约应为：
* **步骤 1**: 运行 `cs-onboard` 时，在迁移审计中对所有遗留历史文档一律选择“跳过 (Skip)”，坚决不执行任何物理移动、删除或重命名。
* **步骤 2**: 保持遗留文档在原位作为只读的历史参考（未纳入 CodeStable 体系）。仅在 `.codestable/attention.md` 中加一行：“所有遗留文档位于 `/legacy-docs`，只读，禁止改动。”
* **步骤 3**: 仅对全新的需求启动 `.codestable/features/` 物理目录，且优先走 Fastforward 快速通道（`cs-feat-ff`），只生成轻量级的 `{slug}-ff-note.md`，以规避重度 design/checklist/acceptance 带来的文档冗余。

---

## 7. 机制冲突与边界摩擦 (Practical conflicts when combining)

若在实际工程中强行同时混合使用两套体系，智能体在执行时将会在以下四个物理维度产生严重冲突：

### 7.1 资产冗余与文档漂移 (Duplicated Specs)
* **冲突点**：
  * Matt 体系在设计收敛后，由 `to-prd` 将方案固化为 PRD 并发布至外部 Issue 追踪器（或生成 flat md）。
  * CodeStable 体系在同一阶段，强制要求在 `features/` 下编写 `{slug}-design.md`，并要求 `cs-req` 维护 `requirements/{slug}.md`。
* **结果**：AI 将会在“外部 PRD”、“本地设计稿”与“愿景文档”之间面临多头写入的窘境，由于三者字段不同、同步机制相异，极易导致设计资产在第 2 轮对话后即产生彻底的文档漂移。

### 7.2 物理命名与目录规范冲突 (Incompatible Directory Rules)
* **冲突点**：
  * Matt 体系的决策记录存放在普通的 `docs/adr/0001-xxxx.md`，超纲文档存放在 `.out-of-scope/`。
  * CodeStable 的所有知识沉淀强制收拢在 `compound/YYYY-MM-DD-{doc_type}-{slug}.md` 下，且架构文档受到 $\ge 6$ 份自动建子目录的单向不可逆规则限制。
* **结果**：如果两套规则同时存在于上下文（如同时配置在 `.claude/skills/`），当智能体被要求“记录一个架构决定”时，其内置的物理写入命令将产生定位冲突（AI 无法在不违背其中一方的前提下执行物理写入，从而引发工具报错或路由死循环）。

### 7.3 任务粒度与协作假设冲突 (Planning Granularity & Handoff)
* **冲突点**：
  * Matt 体系基于 **Tracer Bullets（垂直切片）**，要求拆分出来的每个 Issue 都是端到端独立可交付的，并且为并发开发分配了 `AFK` 与 `HITL` 调度属性。
  * CodeStable 体系基于 **“编排-计算分离”**，其 `checklist.yaml` 中的 `steps` 粒度是沿着逻辑拓扑顺序推进的（骨架 -> 计算节点 -> 集成 -> 测试），设计上针对单 Agent 与人类结对的顺序执行，未建立并发智能体的路由机制。
* **结果**：如果将 CodeStable 的 checklist steps 塞入 Matt 的 Triage 状态机，会发现其步骤由于缺乏独立可交付性（如 step 1 仅仅是写个空骨架）而无法作为独立的 Issue 挂载，造成任务拆解层面的物理摩擦。

### 7.4 “完成 (Done)”的定义冲突
* **冲突点**：
  * Matt 体系中 Done 的定义是工程性的：通过 `tdd` 的行为集成测试，且外部追踪器状态流转至终态。
  * CodeStable 中 Done 的定义是重度流程性的：必须跑完 `cs-feat-accept`，人工核对 checks 状态，物理回写 items.yaml，将 requirements 状态从 draft 升级为 current 并手写变更日志。
* **结果**：这种高度冗余的文档回写流程会让追求开发吞吐量的资深程序员面临极高的摩擦力，降低实际的代码交付频次。

---

## 8. 融合策略与实操指南 (Hybrid strategy recommendation)

基于上述解构，本报告不推荐采用重度自动化的 CodeStable 作为主干（因为其物理侵入性与文档同步成本对于成熟项目代价过高）。

**推荐采用策略：以 Matt Pocock 体系为主骨架，选择性借调（Borrow） CodeStable 中高价值、轻量级的反射与评估规约。**

这一融合策略既保留了项目原有物理结构的低摩擦性与高灵活性，又引入了 CodeStable 优秀的防漂移与代码健康守护机制。

### 8.1 完整融合实施指南 (Adopt, Borrow, Skip, Defer)

#### 1. 采用 (Adopt) — 作为主骨架（来自 Matt 体系）：
* **`grill-me` / `grill-with-docs` 规约**：用于在写物理文件前，进行对话式 Brooks 设计树决策遍历，一问一答，延迟代码承诺。
* **`tdd` / `mocking.md` / `tests.md` 规约**：严格执行集成导向的测试驱动开发，仅在外部边界（API/时间/数据库）进行 mock，内部模块禁止 mock。
* **`diagnose` 规约**：强制执行严密的 Bug 诊断流，对跨 Commit 发生的 Bug 必须编写验证脚本并调用 `git bisect run` 自动定位。
* **`triage` 流程与 `.out-of-scope/` 物理目录**：继续使用外部跟踪器管理任务状态（包含 `AFK` / `HITL` 标记），仅在本地维护 `.out-of-scope/` 以拦截已否决的需求。

#### 2. 借调 (Borrow) — 嵌入开发过程（来自 CodeStable）：
* **Phase 2.5 “结构健康度评估”规约（嵌入设计收尾）**：在设计方案敲定前，增加一个固定环节，由智能体前置评估即将改动的文件是否职责过载（偏胖）以及目标目录是否摊平。如果偏胖，在实现步骤的第一步强制排入“只搬不改行为”的微重构步骤，编译器通过后再写功能代码。
* **7 大写代码反射检查（嵌入实现过程）**：在 `tdd` 实际编写代码时，要求智能体遵守 CodeStable 的反射信号触发器（如：函数超过一屏、要加 `if (特殊情况)` 分支、要加第 4+ 个参数、要写 helper 类时，停下来问自己抽象是否合理，与人类对齐后再行推进）。
* **Spike 临时目录规约**：借调 CodeStable 的 `brainstorm/` 概念，针对高不确定的技术调研，在项目内建立 `tmp/spike-{slug}/` 临时目录，在此处写脏代码，验证可行性后将结论写入 ADR，物理删除该临时目录。

#### 3. 跳过 (Skip) — 坚决不使用：
* **CodeStable 的 `.codestable/` 物理八大目录及全部 `/cs-*` 文档自动流更新命令**：彻底放弃这些复杂的本地 md 库维护工作，去除“为 requirements, VISION, attention, items.yaml 写入和状态流转”所消耗的重度 Token 和流程摩擦。
* **CodeStable 的 `checklist.yaml` 物理清单**：直接使用 Matt 体系的外部 Issue 或常规任务列表代替，去除 steps/checks 的物理双重状态回写动作。

#### 4. 延期评估 (Defer)：
* **CodeStable 的 `{slug}-items.yaml` DAG 依赖管理**：在初期融合中不予启用。只有当项目规模扩大、开始面临涉及 10 条以上子 feature 并发/串行推进的巨型 Epic 架构时，再行评估是否有必要引入 CodeStable 的 roadmap yaml 依赖解析工具，否则前期一律交由人类或外部 Tracker 进行粗粒度排期。

---

## 9. Git 与 Git Worktree 的搭配使用规约 (Git & Git Worktree Coordination)

在智能体开发流程中，合理搭配 Git 和 Git Worktree 是防范工作空间污染、支持多任务并行以及维持开发状态隔离的关键物理手段。以下针对两个技能仓库的设计哲学，梳理其与 Git/Worktree 的具体搭配规约：

### 9.1 Git 物理提交范围规约 (Commit Scope Controls)
* **CodeStable 体系中的 `scoped-commit`**：
  * *规约*：在每个特性验收（`cs-feat-accept`）或 Bug 修复（`cs-issue-fix`）的收尾阶段，智能体必须强制执行 `scoped-commit`。
  * *控制边界*：只允许暂存（`git add`）并提交（`git commit`）与**本次 feature/issue 物理设计直接关联的代码文件、对应的 spec 文档以及实际被更新的 architecture/roadmap 文件**。
  * *禁令*：严禁在此提交中混入与当前任务无关的微调、顺手修复的 Bug 或扩大范围的重构。这种物理范围隔离确保了 `git log` 与本地生命周期 spec 记录的 1-to-1 映射，避免了 git blame 流的断裂。
* **Matt Pocock 体系中的任务分支规约**：
  * *规约*：每个 Tracer Bullet 均强制在独立的 Git 分支中开发。分支命名严格对应 Issue ID（如 `issue-102-auth-jwt`）。

---

### 9.2 Git Worktree 多智能体并发调度规约
当使用智能体（尤其是多会话或多 Agent 舰队）处理并发开发任务时，在单台机器上使用单一的工作目录会导致严重的物理摩擦（如未提交代码的冲突、lock 文件抢占、git stashing 灾难）。为此，两个仓库隐含了不同的 Git/Worktree 搭配手势：

#### 1. Matt Pocock 体系：利用 Git Worktree 实现多 Agent 舰队并发
* *机制背景*：Matt 体系的 `to-issues` 和 `triage` 支持将任务拆分为具有 `AFK`（脱机自主）属性的垂直切片。为了让多个 Agent 能够**物理并发**执行不同的 AFK 任务，必须利用 `git worktree` 创造物理隔离的开发空间。
* *实操规约*：
  1. 对于被分配为 `AFK` 的 Issue，调度系统或人类工程师在主仓库外，通过以下命令为该 Issue 独立检出一个物理工作树：
     ```bash
     # 在根目录的同级创建隔离的工作树，并开辟新分支
     git worktree add ../worktrees/issue-102-auth-jwt issue-102-auth-jwt
     ```
  2. 将专职的智能体会话（Agent Session）挂载到该 worktree 目录下执行任务。智能体在此工作树内进行 TDD 编写与 bug diagnose，完全不受主工作区未提交代码的影响。
  3. 任务完成后，智能体在此工作树内完成测试并提交代码。人类工程师在主仓库 review 后进行 merge，并安全销毁该 worktree 物理目录：
     ```bash
     git worktree remove ../worktrees/issue-102-auth-jwt
     ```
* *冲突规避设计*：为了让 Git Worktree 在多 Agent 并行时顺利合入，`to-issues` 在拆分任务时，**严禁在任务描述中硬编码文件的物理行号 (line numbers)**，仅约定接口契约（Language/Interface contracts），从而在 worktree 最终合入主干时降噪，规避 Git 物理冲突。

#### 2. CodeStable 体系：顺序迭代与 Worktree 分支跟随
* *机制背景*：CodeStable 默认针对“单智能体 + 人类程序员结对”的顺序流设计。由于其依赖 `items.yaml` 中的 `depends_on` 属性进行强 DAG 依赖拦截，不建议对具有前置依赖的任务启动并发工作树开发。
* *实操规约*：
  1. **无本地 worktree 并发**：在 items.yaml 声明的前置任务未变更为 `done` 前，禁止为下游任务开辟物理 worktree。
  2. **文档与代码分支跟随 (Branch-Following Docs)**：因为 CodeStable 坚持将所有设计资产（`.codestable/` 目录）全部作为物理文件提交至 Git 仓库中（而非写入外部 tracker 或 .gitignore）。这意味着，当开发人员使用 `git checkout` 切换分支或通过 `git worktree` 检出不同提交时，**本地的需求愿景 status、checklist YAML 的 checkmarks 进度以及架构 doc 状态会自动跟随该 git 分支的状态进行物理重置**。
  3. 这确保了无论开发人员在哪个 worktree 或分支上工作，AI 智能体读取的 `.codestable/attention.md` 和 spec 资产都是绝对版本对齐的，彻底消除了文档与代码库版本脱节的传统难题。

---
