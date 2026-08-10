# Alt Theory

[![Release（發佈版本）](https://img.shields.io/github/v/release/syuan-research/alt-theory?include_prereleases&label=Release)](https://github.com/syuan-research/alt-theory/releases)
[![License（授權條款）](https://img.shields.io/badge/License-MIT%20%2B%20CC%20BY%204.0-59636e)](LICENSE.md)
[![Windows x64（Windows 64 位元）](https://img.shields.io/badge/Windows-x64-59636e?logo=windows11&logoColor=white)](https://github.com/syuan-research/alt-theory/releases)
[![macOS Apple Silicon](https://img.shields.io/badge/macOS-Apple%20Silicon-59636e?logo=apple&logoColor=white)](https://github.com/syuan-research/alt-theory/releases)

[English](README.md) · [简体中文](README.zh-Hans.md) · **繁體中文（香港）**

> 「Efficiency（效率）是把事情做對；effectiveness（有效性）是做對的事情。」
> — Peter Drucker

隨着 AI 變得更 autonomous（自主）、proactive（主動），亦更善於給出 plausible answers（看似合理的答案），研究中仍有一些關鍵時刻需要你主導方向，或需要 AI 真正理解並跟隨你正在做的事。

**Alt Theory 幫助你有效地思考，並完成嚴肅的研究工作。**

Uncertainty（不確定性）是嚴肅研究的正常部分：有些需要用 evidence（證據）解決，有些需要隨項目發展而管理，還有一些值得探索，因為新的問題與理論正從中產生。Alt Theory 旨在區分這些情況，理解用戶真正想完成甚麼，並支援社會科學及更廣泛學術研究所需的 meta-level thinking（元層次思考）。

Alt Theory 可以識別不確定性、證據和相互競爭的解釋；使用你的檔案與研究工具；並行推進多個方向，而不把它們壓縮成單一答案。你可以選擇協作方式、知識來源和具體方法，亦可以比較替代方案、探索支線問題，或向 Subagent（子代理）給出邊界清楚的方向。

Alt Theory 建基於 [Pi coding-agent runtime（Pi 編碼代理運行環境）](https://pi.dev)，並加入自己的 agent behavior（代理行為）、research assets（研究資產）、conversation architecture（對話架構）和 desktop interface（桌面介面）。目前 Public Beta（公開測試版）可用於真實工作，但介面、設定與兼容性仍可能在版本之間改變。

![Alt Theory 主對話](docs/assets/readme/alt-theory-main.png)

## 一個隨 AI 演進的研究產品

Alt Theory 從社會科學研究者的角度出發，並隨 AI 能力改變而演進。它長期關心的是：當 AI 承擔愈來愈多研究執行與探索工作時，研究者如何繼續塑造問題、運用判斷、發展理論，並保存各自領域的知識傳統。

它在 2025 年始於一個 environmental psychology knowledge base（環境心理學知識庫）和 theory innovation（理論創新）的思考夥伴。隨着 Agent（代理）開始能夠操作檔案和工具，2026 年版本支援一個連續的研究循環：理解問題、處理證據與檔案、探索替代方向，並在不失去探究連續性的情況下返回主線。它的行為、知識、方法與對話結構可以因應不同研究問題、理論興趣和 Agent 使用經驗繼續擴展。

## Alt Theory 如何運作

### Alt 自動完成的部分

- System behavior（系統行為）與 **Soul（靈魂）**——一份可閱讀的穩定原則檔案——提供關於證據、不確定性、節奏與用戶選擇的持續立場。
- 所選 **Role（角色）**——一份規定 Alt 如何理解和溝通的可閱讀指令——塑造持續性的研究關係或任務方式。
- **Skill（技能）**會在具體情況需要某種方法時自動啟動，例如在方向性工作前對齊目標，或恢復匯入對話中已經改變的上下文。

### 用戶控制的部分

- 為對話選擇、更換或清除 Role（角色）。
- 選擇或停用 knowledge base（知識庫）：它是服務於某一領域或研究目的的策展材料，而非臨時搜尋結果。
- 在需要特定工作方式時明確調用 Skill（技能）。
- 選擇對話可用的工作邊界、permissions（權限）和研究工具。
- 建立、比較、保留或捨棄不同的探究路線。

Knowledge base（知識庫）可以保留一個領域的範圍、provenance（來源脈絡）與內部傳統，同時讓 Alt 考慮更廣泛或更主流的知識。更容易的知識庫製作和 community knowledge bases（社群知識庫）是未來方向，並非目前 Beta 的既有承諾。

### 部分 Skills（技能）

| Skill（技能） | 適用情況 | 啟動方式 |
|---|---|---|
| `adaptive-aligning` | 對情況、目標或方向尚未形成共同理解 | 自動或明確調用 |
| `adaptive-plan-record` | 多階段工作需要持續更新的計劃與記錄 | 自動或明確調用 |
| `search-policy` | 論斷需要即時核實和清楚的來源標記 | 自動 |
| `precise-edit` | 接近定稿的文字需要克制、精確的編輯 | 自動或明確調用 |
| `imported-session-context` | 匯入的對話需要恢復上下文 | 自動 |
| `alt-theory-help` | 設定或產品使用需要協助 | 經 Helper（助手） |

目前可以透過 commands（指令）明確調用 Skill（技能）。常用情境 Skill 的直接 toolbar（工具列）計劃在 v1.3.1 Beta 週期提供。

## 探索不止一條路線

相比 Codex、Claude Code、OpenCode 和 ZCode，Alt Theory 在 Agent 工作之上加入更靈活、由用戶主導的探索介面。Message（訊息）可以編輯成對照實驗；問題可以進入 BTW（順帶問）對話；不同方向可以形成 Branch（分支）；有價值的側邊工作可以被提升。

| Control（控制項） | 用途 |
|---|---|
| **Edit and compare（編輯並比較）** | 保留原始要求，並把編輯後的要求作為同級對照運行 |
| **Branch（分支）** | 沿不同方向繼續，而不捨棄第一條路線 |
| **BTW（順帶問）** | 探索側邊問題而不帶偏主線 |
| **Subagent（子代理）** | 把邊界清楚的方向交給另一個真實、可檢查的 Agent 對話 |
| **Show in conversation list（顯示於對話列表）** | 把有價值的側邊工作提升為獨立保留的對話 |

Subagent（子代理）可以同時與 Main agent（主代理）和用戶溝通。被提升的側邊對話會保留原有關係與 provenance（來源關係），不會變成無關的 transcript（對話記錄）。

![比較主對話與 Branch（分支）](docs/assets/readme/alt-theory-branch-comparison.png)

## 適用對象

Alt Theory 首先面向社會科學領域的學生與研究者：從正在形成第一個研究問題的碩士生，到判斷 AI 工具是否應加入研究計劃的資深研究者。它亦支援更廣泛的研究型知識工作。

毋須具備 Agent 工具經驗。如果你主要需要討論和有記錄的反思，**Understand（理解）**會刻意限制 Agent 的操作範圍，同時保留一個用於對話摘要和筆記的小型可寫空間。產品和設定問題可以交給 **Helper（助手）**；詳見[協助與疑難排解](#協助與疑難排解)。

當研究需要即時來源、檔案、分析或文件製作時，目前對話可以切換至 **Work（工作）**，而不捨棄之前的討論。例如，Alt 可以進行探索性的 R 或 Python 分析，處理文獻和文件，製作表格、簡報或協作材料，然後回到解釋與判斷。

熟悉 Agent 的用戶可以帶入現有 workspace（工作空間），並繼續從 Codex、Claude Code、Grok Build、Pi Coding Agent 與 OpenCode 匯入的對話。參閱 [Imports and cross-harness continuity（匯入與跨工具連續性）](docs/en/system-guide/imports-and-continuity.md)。

## 其他功能

- 同時運行多個 Agent session（代理工作階段）和 related conversations（相關對話）。
- 匯入受支援的對話歷史，包括 compacted sessions（已壓縮工作階段）以及受支援的圖片與工具記錄。
- 將 Branch（分支）、BTW（順帶問）和 Subagent（子代理）保留為獨立、可檢查的 session record（工作階段記錄）。
- 在 Settings → Trash（設定 → 垃圾桶）中恢復 30 日內刪除的對話，或永久刪除；比較用 Branch 仍可獨立保留。
- 使用本機資料夾、附件、文件、圖片、即時搜尋、R/Python 分析和檔案產出工具，並保持可見的權限邊界。
- 在受支援的 model（模型）和 provider（供應商）之間選擇，而非綁定單一廠商。
- 使用 English、简体中文或繁體中文（香港）介面。

![匯入並繼續現有 Agent 對話](docs/assets/readme/alt-theory-import.png)

## 取得 Alt Theory

| Platform（平台） | Status（狀態） |
|---|---|
| Windows x64（Windows 64 位元） | **[下載 Beta](https://github.com/syuan-research/alt-theory/releases)** |
| macOS Apple Silicon | **[下載 Beta](https://github.com/syuan-research/alt-theory/releases)** |
| Linux 與其他架構 | 目前未聲稱支援 |

### Windows：下載與啟動

1. 從 [GitHub Release 頁面](https://github.com/syuan-research/alt-theory/releases)下載 Windows Beta。
2. 完整解壓縮 `AltTheory` 資料夾；這是 folder app（資料夾應用程式），並非 installer（安裝程式）。若解壓失敗，請解壓至路徑較短的資料夾（Windows 有最大路徑長度上限）。
3. 開啟資料夾並運行 `AltTheory.exe`。

Beta（測試版）尚未進行 code signing（程式碼簽署）。Windows SmartScreen 可能顯示不明應用程式警告；只有當下載來自本 repository（儲存庫）的 GitHub Release 時，才選擇 **More info → Run anyway（更多資訊 → 仍要執行）**。Release 同時提供 SHA-256 checksum（SHA-256 校驗值）。下載版毋須 Node.js 或 npm。

### macOS：下載與啟動

1. 從 [GitHub Release 頁面](https://github.com/syuan-research/alt-theory/releases)下載 macOS Beta。
2. 在「下載」中完整解壓縮 `AltTheory` 資料夾；裡面有 `AltTheory.app` 和 `Fix-Open.command`。
3. 用任一方法解除 quarantine（下載隔離）：右鍵 `Fix-Open.command` 並選擇 **Open（開啟）**；或在終端運行 `xattr -dr com.apple.quarantine "$HOME/Downloads/AltTheory/AltTheory.app"`。若實際資料夾或 App 路徑不同，請替換指令中的路徑。
4. 把 `AltTheory.app` 移到「應用程式」並開啟。若仍被攔截，請前往 **系統設定 → 私隱與保安 → 仍要開啟（Open Anyway）**，驗證身份後確認 **開啟（Open）**。

需要這些步驟是因為 Beta 尚未經過 Apple notarization（公證）。腳本和終端指令只會移除 macOS 的下載隔離標記。只有當 ZIP 來自本 repository 的 GitHub Release 時才這樣操作，並對照 `BUILD-INFO-mac.txt` 核對 SHA-256。僅支援 Apple Silicon。

## 首次啟動

Alt Theory 會直接進入對話。在第一次運行對話前，請在 **Settings → Models（設定 → 模型）**中設定至少一個 Model（模型）：使用 API key（API 金鑰）或受支援的 subscription sign-in（訂閱登入）。Alt Theory 提供 workspace（工作空間）、行為和工具；Model 由你設定的 Provider 提供。軟件免費，模型使用費按 Provider 條款計算。

- [Install and first launch（安裝與首次啟動）](docs/en/start-here/install-and-launch.md)
- [Models, providers, and access（模型、供應商與存取）](docs/en/system-guide/models-providers-access.md)
- [简体中文完整文件](docs/zh-Hans/README.md)

## 本機資料、權限與更新

對話和設定儲存在 App folder（應用程式資料夾）以外的本機位置。所設定的 Model 會收到產生回覆所需的對話內容；Search（搜尋）會連接所選搜尋服務。除非用戶主動匯出，否則不會匯出其他內容。檔案與指令操作保持可見，並受 Approval boundaries（批准邊界）約束。

更新 folder app（資料夾應用程式）時：關閉 Alt Theory，把新 Release 解壓縮至新資料夾，然後運行新的 `AltTheory.exe`。若解壓失敗，請解壓至路徑較短的資料夾（Windows 有最大路徑長度上限）。取代 App folder 不會刪除獨立儲存的對話與設定資料目錄。

## 協助與疑難排解

從全域 Help 選單、Related 中的低調入口或 `/helper` 開啟 **Helper（小助手）**。每次開啟都會建立新的、在對話清單可見的 Helper。中間已有對話時，它掛在該 family 下並在右欄開啟；否則作為 root conversation 在中間開啟。Helper 按目前文件回答，並協助排查 Provider、API key、Model 與缺少工具。相同的 Help 選單也能開啟不建立對話的 Help center。

- [Common questions（常見問題）](docs/en/help/common-questions.md)
- [Imports and cross-harness continuity（匯入與跨工具連續性）](docs/en/system-guide/imports-and-continuity.md)
- [完整 English 文件](docs/en/README.md)
- [简体中文文件](docs/zh-Hans/README.md)

## 從源碼構建

這是為希望檢查或自行封裝 App 的開發者與用戶準備的次要路徑。Desktop artifact（桌面產物）應在相應操作系統上構建。目前 Windows build（構建）使用 Node.js 24 與 npm 11 測試。

```bash
git clone https://github.com/syuan-research/alt-theory.git
cd alt-theory
npm ci
npm --prefix alt-theory-app/frontend ci
npm run build:electron
```

Windows 的 unpacked app（未封裝應用程式）位於 `dist/win-unpacked/`。封裝步驟、已知編譯診斷、必要產物檢查與 macOS 指令見 [canonical desktop bundle guide（規範桌面 bundle 指南）](development/releases/desktop-friend-bundle.md)。

## Repository map（儲存庫地圖）

- `alt-theory-app/` — session engine（工作階段引擎）、web server（網頁伺服器）與 frontend（前端）。
- `agent-assets/` — runtime identity（運行環境身份）、Roles、Skills、knowledge bases 與 guidance（指導檔案）。
- `electron/` 與 `scripts/` — desktop runtime（桌面運行環境）與封裝。
- `docs/en/`、`docs/zh-Hans/` — 用戶文件。
- `development/architecture/` — 目前 technical architecture（技術架構）。
- `development/releases/` — Release 與封裝證據。

## License（授權條款）

Alt Theory 軟件採用 MIT License。原創文件與 Agent assets（代理資產）採用 CC BY 4.0。路徑範圍和 Third-party notices（第三方聲明）見 [LICENSE.md](LICENSE.md)。
