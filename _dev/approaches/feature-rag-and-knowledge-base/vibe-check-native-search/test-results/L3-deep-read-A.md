# Vibe-Check Test Results — Level 3: Deep Read (A)

> Level: L3
> Agent: L3-deep-A
> Date: 2026-04-01
> Tests: #11-#12

---

## Test #11

**问题**: ART 的四个恢复成分分别是什么？请给出具体定义

**搜索过程**:

| Step | Tool | Command / Target | Decision Reason |
|------|------|-----------------|-----------------|
| 1 | Read | `level-1-index.md` | Read theory index to identify the correct ART core file |
| 2 | Read | `ART-Kaplan-1995-core.md` | Index indicates this is the ART core file; the question asks for core concepts |

**答案**:

ART 提出四个恢复成分 (restorative components)，环境必须同时具备这四个特征才能真正促进注意力的恢复：

1. **Being Away（远离）**：一种概念上的转换，使个体从需要定向注意的心理活动中解脱出来。即摆脱日常的认知负担和需要抑制性注意的任务。

2. **Extent（延展性/丰富性）**：环境必须足够丰富且连贯，能够构成一个"完整的世界"（whole other world），提供足够的广度来吸引心智的参与。

3. **Fascination（迷恋/不随意注意）**：环境中存在不费力就能吸引注意的刺激，防止使用抑制机制。ART 进一步区分了 Hard Fascination（如观看赛车，填满心智但几乎不留反思空间）和 Soft Fascination（如观看云彩或树叶沙沙作响），后者对恢复至关重要，因为它毫不费力地保持注意力的同时，为反思和定向注意的休息提供了概念空间。

4. **Compatibility（契合性）**：环境的需求与个体的目的之间存在高度的共鸣。在契合的环境中，人可以顺畅地开展活动，无需不断进行选择性注意或自我纠正的挣扎。

**期望答案**: Being Away, Extent, Fascination, Compatibility (with definitions)

**评估**:
- 准确性: 5/5 — 四个成分名称和定义均与原文完全一致，且补充了 Hard/Soft Fascination 的区分
- 完整性: 5/5 — 每个成分的定义均来自原文，且包含了 Fascination 的二级区分
- 速度: 2 turns (index read + core file read)
- 上下文消耗: low — ART core file 仅 47 行（含 frontmatter），信息密度高
- 发现: ART core 文件结构清晰，用 `===SECTION===` 分隔概念，四个成分集中在"Core Proposition"section 中，定位非常容易

---

## Test #12

**问题**: ART 和 SRT 对 stress 的解释有什么不同？

**搜索过程**:

| Step | Tool | Command / Target | Decision Reason |
|------|------|-----------------|-----------------|
| 1 | Read | `level-1-index.md` | Read theory index to identify both ART and SRT core files |
| 2 | Read | `ART-Kaplan-1995-core.md` | Read ART core for its stress explanation (shared with Test #11) |
| 3 | Read | `SRT-Ulrich-1991-core.md` | Read SRT core for its stress explanation |

**答案**:

**ART 对 stress 的解释**（认知-注意力路径）：
- ART 将 stress 定义为一种适应性动员（adaptive mobilization），用于应对感知到的"资源不足"或威胁。
- 关键机制：**定向注意力疲劳（DAF）是 stress 的前因**。当个体的注意力资源耗竭后，缺乏有效处理信息或应对挑战所需的"心理适应性"（psychological adaptability），从而导致压力反应。
- Stress 和 DAF 是不同但深度关联的现象。Stress 的恢复可能是快速的，但定向注意力疲劳的恢复是更缓慢、更持久的过程。
- 核心：stress 是注意力疲劳的结果 → 需要通过提供四个恢复成分的自然环境来恢复注意力资源。

**SRT 对 stress 的解释**（心理进化路径）：
- SRT 将 stress 定义为个体在心理、生理和行为上对挑战或威胁福祉的情境做出的反应过程，涉及认知评估、负面情绪（恐惧、愤怒、悲伤）和生理系统动员（心血管、骨骼肌肉）。
- 关键机制：**不学而能的生物准备性（biological preparedness）**。人类对无威胁的自然环境有一种进化来的、无需学习的积极反应倾向。
- 核心路径是情感先于认知：对自然的反应在 400ms 内发生，先于意识处理。暴露于自然内容（植被、水）会触发快速的、前意识层面的情感转变，降低生理唤醒并促进心理恢复。
- 生理机制：stress 对应交感神经系统的"战斗或逃跑"动员；恢复对应副交感神经主导的反应（心率减慢、非消耗性的感知摄入）。
- 核心：stress 是通过副交感神经激活和情感转变来消除的 → 自然环境的内容（而非刺激量）是恢复的关键。

**关键差异总结**：

| 维度 | ART | SRT |
|------|-----|-----|
| 理论路径 | 认知-注意力路径 | 心理-进化路径 (psycho-evolutionary) |
| Stress 起因 | 定向注意力资源耗竭导致 stress | 直接的情感/生理应激反应 |
| 恢复机制 | 四个恢复成分让定向注意力休息 | 自然环境触发前意识情感转变 + 副交感神经激活 |
| 恢复速度 | 注意力恢复是缓慢的、持久的 | 情感/生理恢复可以是快速的 |
| 核心概念 | Directed Attention Fatigue | Biological Preparedness |
| 关键区分 | Content vs. 信息处理负担 | Content vs. Stimulation Levels |

**期望答案**: ART: attention fatigue leads to stress; SRT: psycho-evolutionary, innate response to natural environments

**评估**:
- 准确性: 5/5 — 两个理论对 stress 的解释均准确提取自原文，差异对比清晰
- 完整性: 5/5 — 不仅给出了各自对 stress 的定义，还补充了恢复机制、生理基础和理论路径的对比
- 速度: 3 turns (index + ART core + SRT core)，其中 ART core 可与 index 并行读取
- 上下文消耗: low — 两个 core 文件合计约 90 行（含 frontmatter），信息密度高
- 发现: 两个 core 文件都高度结构化，"Theoretical Relationship: Stress vs. Attentional Fatigue"（ART）和"Concept: Stress and Restoration"（SRT）这两个 section 直接对应问题需求，定位零摩擦。core 文件的设计使得跨理论对比非常高效。

---

## Deep Read Evaluation

### 上下文消耗分析

- **ART core 文件**: 47 行（含 10 行 frontmatter），有效内容约 37 行。约 2,500 tokens。
- **SRT core 文件**: 44 行（含 10 行 frontmatter），有效内容约 34 行。约 2,200 tokens。
- **Level-1 Index**: 102 行。约 3,500 tokens。
- **总计**: 约 8,200 tokens（含 index），纯内容约 4,700 tokens。
- 相比 L2 keyword/grep 测试中需要读取大量行来定位信息，L3 deep read 在 core 文件上效率很高，因为文件本身短且结构化。

### 信息定位便利性

- 两个 core 文件都使用了 `===SECTION===` 分隔符，section 标题具有高度描述性（如 "Core Proposition: The Four Components of Restorative Environments"、"Theoretical Relationship: Stress vs. Attentional Fatigue"）。
- 信息密度极高：几乎没有冗余内容，每个 section 都直接对应一个核心概念。
- 对于需要"具体定义"的问题，core 文件是最优选择——比 details 文件更聚焦，比 keyword search 更完整。

### 与替代方案的对比

- **Index + Chunked Search 能否达到同样效果？** — 部分可以。如果有一个结构良好的 index 列出了每个理论的核心概念，Level 2 搜索可能就够了。但 Test #12 要求对比两个理论对 stress 的不同解释，这需要理解每个理论的完整论证链条（不仅是关键词匹配），因此 deep read 仍然有优势。
- **Details 文件 vs Core 文件** — core 文件在本次测试中是最优粒度。details 文件会包含更多研究证据、实验细节等，对于回答概念性问题反而会增加噪音。
- **Core 文件的设计启示** — 当前 core 文件的粒度非常适合 L3 deep read：足够短（<50行），足够结构化（section headers），足够完整（包含定义和理论关系）。这验证了 core/details 分层设计的价值。

### 总体观察

1. Core 文件的 `===SECTION===` 格式对 AI 读取非常友好，比纯 Markdown headers 更容易定位。
2. 对于跨理论对比类问题，需要读取多个文件，但每个文件都很短，总上下文消耗可控。
3. Deep read 的主要优势在于能够捕捉理论的论证逻辑和概念间关系，而不仅仅是关键词匹配。
4. 如果 KB 扩展到 100+ 理论，index 本身可能需要分层或分类，否则定位正确文件的效率会下降。
