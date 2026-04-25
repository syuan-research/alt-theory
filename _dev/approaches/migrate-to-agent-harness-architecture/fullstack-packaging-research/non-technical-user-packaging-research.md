# 非技术用户本地 AI Agent 桌面应用打包方案研究

---
created: 20260425
author: Opus 4.6（内部知识 + 标注需验证项）
scope: 通用技术选型，不涉及具体项目
---

## 前提：问题的本质

非技术用户的核心障碍不是"安装软件"，而是：
1. **不知道要安装什么**（不理解 Node.js 是什么）
2. **安装失败时不知道怎么办**（没有排错能力）
3. **命令行恐惧**（看到黑框就关掉）

所以评估标准是：**用户能否在不理解任何技术概念的情况下完成安装并使用**。

---

## 方案对比

### 1. Electron 打包

| 维度 | 评估 |
|------|------|
| 需要预装软件 | 否（内嵌 Chromium + Node.js） |
| 打包体积 | 80–200 MB（内嵌 Chromium 是主要原因） |
| 开发复杂度 | 低（2026 年工具链成熟，electron-builder/forge 一行命令） |
| 非技术用户友好 | **是**（双击 .exe/.dmg 安装，体验与普通软件无异） |
| 主要缺点 | 体积大；内存占用高（Chromium 进程）；macOS 公证流程繁琐 |

**已知成功案例**：
- VS Code（Microsoft）— 最大规模 Electron 应用
- Cursor — AI 编辑器，Electron 打包
- Obsidian — 笔记应用，Electron，非技术用户广泛使用
- Discord — Electron

**对 PI SDK（Node 生态）的适配性**：极好。PI SDK 是 TypeScript/Node，Electron 内嵌 Node.js，直接运行，无需任何适配。

---

### 2. Tauri v2 打包

| 维度 | 评估 |
|------|------|
| 需要预装软件 | 否（内嵌 Rust 后端，使用系统 WebView） |
| 打包体积 | **3–15 MB**（使用系统 WebView，不内嵌 Chromium） |
| 开发复杂度 | 中（前端任意框架，后端 Rust；Rust 学习曲线存在） |
| 非技术用户友好 | **有条件**（见下方风险） |
| 主要缺点 | 使用系统 WebView 导致跨平台渲染不一致；Windows 7/8 的 WebView2 需要单独安装；后端逻辑必须用 Rust 写（或通过 sidecar 调用 Node） |

**系统 WebView 风险**（⚠️ 需验证）：
- Windows：依赖 WebView2（Edge）。Windows 10/11 默认已有，但旧系统需要安装。2026 年 Windows 7/8 用户极少，风险可接受。
- macOS：依赖 WKWebView，版本差异可能导致 CSS/JS 行为不同。

**对 PI SDK 的适配性**：差。PI SDK 是 Node.js，Tauri 后端是 Rust。需要通过 sidecar（把 Node 进程作为子进程启动）来运行 PI SDK，增加复杂度。或者用 Tauri + Bun sidecar 组合。

**已知成功案例**：
- Tauri 官方 showcase 有多个应用（⚠️ 具体 star 数需联网验证）
- Zed 编辑器（部分使用 Tauri 技术）

---

### 3. Bun 编译为单可执行文件

| 维度 | 评估 |
|------|------|
| 需要预装软件 | 否（`bun build --compile` 生成单个二进制） |
| 打包体积 | **50–80 MB**（内嵌 Bun 运行时） |
| 开发复杂度 | 低（命令简单，兼容大多数 Node.js 代码） |
| 非技术用户友好 | **有条件**（单二进制，但没有 GUI 安装器；用户需要双击运行一个命令行程序，或配合系统托盘） |
| 主要缺点 | 没有内置 GUI；需要额外工具（如 systray）来做"双击打开浏览器"的体验；Web UI 需要用户手动打开浏览器访问 localhost |

**对 PI SDK 的适配性**：好。Bun 兼容 Node.js API，PI SDK 大概率可以直接运行（⚠️ 需验证 PI SDK 是否有 Bun 不兼容的原生模块）。

**适合场景**：后端服务打包（API server），不适合作为独立桌面应用。

---

### 4. 内嵌 Node.js 运行时（pkg / SEA）

| 维度 | 评估 |
|------|------|
| 需要预装软件 | 否 |
| 打包体积 | 40–80 MB |
| 开发复杂度 | 低-中（Node.js SEA 是官方方案，2024+ 成熟） |
| 非技术用户友好 | **有条件**（同 Bun，没有 GUI 安装器） |
| 主要缺点 | Node.js SEA（Single Executable Application）在 Node 20+ 是官方支持，但原生模块（.node 文件）打包仍有问题；pkg 已停止维护 |

**2026 年状态**：
- `pkg`（Vercel）：已停止维护，不推荐
- Node.js SEA：Node 20/22 官方支持，逐渐成熟（⚠️ 2026 年成熟度需验证）
- `@yao-pkg/pkg`：pkg 的社区 fork，仍在维护

**对 PI SDK 的适配性**：好，但原生模块（如 better-sqlite3）可能需要额外处理。

---

### 5. PWA + 本地服务

| 维度 | 评估 |
|------|------|
| 需要预装软件 | 需要启动本地服务（是障碍） |
| 打包体积 | 不适用 |
| 开发复杂度 | 低（Web 开发） |
| 非技术用户友好 | **否**（启动本地服务对非技术用户是障碍） |
| 主要缺点 | 用户需要手动启动服务进程；浏览器安全限制无法直接访问文件系统（需要 File System Access API，但有限制） |

**唯一可行的非技术用户方案**：配合系统托盘应用（如 Electron 或 Tauri 做一个最小托盘程序，启动时自动开服务，用户点击托盘图标打开浏览器）。但这本质上退化为 Electron/Tauri 方案。

---

### 6. 其他 2026 年方案

#### Deno Compile
- `deno compile` 生成单二进制，内嵌 Deno 运行时
- 体积：~80 MB
- 对 PI SDK 适配性：差（PI SDK 是 Node.js，Deno 兼容性不完整）
- 非技术用户友好：有条件（同 Bun，无 GUI）

#### Neutralinojs
- 轻量级 Electron 替代，使用系统 WebView
- 体积：~2 MB（极小）
- 对 PI SDK 适配性：差（后端是 C++，Node 需要 sidecar）
- 成熟度：低，社区小

#### Wails（Go + WebView）
- Go 后端 + 系统 WebView，类似 Tauri 但用 Go
- 对 PI SDK 适配性：差（同 Tauri，需要 sidecar）

---

## 补充问题回答

### Q1：PI SDK 最自然的打包方案？

**Electron > Node SEA > Bun compile**

PI SDK 是 TypeScript/Node 生态，Electron 内嵌完整 Node.js 运行时，是最自然的选择。无需任何适配，直接 `require('@mariozechner/pi-coding-agent')` 即可。

### Q2：是否有项目已把 PI SDK 打包成桌面应用？

⚠️ **需联网验证**。PI SDK 是相对小众的个人项目，大概率没有成熟的桌面打包案例。建议搜索 `mariozechner pi-coding-agent electron` 或查看 PI SDK 的 GitHub issues/discussions。

### Q3：2026 年安装 Node.js 对非技术用户还是障碍吗？

**是的，仍然是障碍**，原因：
1. Node.js 安装包本身不难，但用户不理解"为什么要装这个"
2. 版本管理（nvm、fnm）对非技术用户完全不可理解
3. 安装后还需要 `npm install`，这一步非技术用户会卡住

**一键安装方案**：
- Electron/Tauri 打包完全绕过这个问题（内嵌运行时）
- 如果必须用 Node，可以用安装向导（NSIS/Inno Setup）自动检测并安装 Node.js，但体验仍然差

---

## 推荐排序

### 针对 PI SDK（Node 生态）+ 非技术用户场景

| 排名 | 方案 | 理由 |
|------|------|------|
| **1** | **Electron** | 最成熟、最多成功案例、对 Node 生态零适配成本、非技术用户体验最好 |
| **2** | **Bun compile + 系统托盘** | 体积比 Electron 小，但需要额外做托盘 + 自动打开浏览器的逻辑（约 100 行代码） |
| **3** | **Tauri + Node sidecar** | 体积最小，但 Rust 学习曲线 + sidecar 复杂度不值得，除非体积是硬约束 |
| **4** | **Node SEA** | 官方方案，但无 GUI，需要额外工程 |
| **不推荐** | PWA / Deno / Neutralinojs | 对 PI SDK 适配性差或非技术用户体验差 |

### 实用建议

**开发阶段**：TUI（零打包成本，快速迭代）

**6 月展示**：Electron + pi-web-ui 前端。理由：
- Electron 打包一个 Express + WebSocket 服务 + 内嵌浏览器窗口，是标准模式
- 非技术用户双击 .exe 打开，看到 Web UI，体验与普通应用无异
- 开发成本：约 1–2 天（electron-builder 配置 + 主进程启动 Express 服务）

**长期产品**：评估是否值得迁移到 Tauri（体积优化），但不要在 MVP 阶段做这个决定。

---

## 需联网验证的项目

以下内容基于内部知识，建议在 Gemini 研究时验证：

1. **PI SDK 是否有 Bun 不兼容的原生模块**（影响 Bun compile 方案可行性）
2. **Tauri v2 在 Windows 11 上的 WebView2 依赖现状**（2026 年是否已预装）
3. **是否有项目已把 PI SDK 打包成桌面应用**（GitHub 搜索）
4. **Node.js SEA 在 2026 年的成熟度**（原生模块支持情况）
5. **Electron 打包 Express + WebSocket 服务的标准模板**（是否有现成 boilerplate）

---

*Research by Opus 4.6, 20260425. 内部知识为主，标注项需联网验证。*
