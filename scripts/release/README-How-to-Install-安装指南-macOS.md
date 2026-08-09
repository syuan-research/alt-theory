# How to download and launch (macOS) / 如何下载与启动（macOS） / 如何下載與啟動（macOS）

This file ships inside the macOS ZIP (next to `AltTheory.app` and
`Fix-Open.command`). The text matches the **macOS: download and launch**
block on this release’s GitHub Release page. Prefer the language section
below that you read most easily.

本文件随 macOS 版 ZIP 附在 `AltTheory.app` 与 `Fix-Open.command` 旁边。
文字与本版本 GitHub Release 页面上的 **macOS：下载与启动** 说明一致。
请选下面最方便阅读的语言。

本檔案隨 macOS 版 ZIP 附在 `AltTheory.app` 與 `Fix-Open.command` 旁邊。
文字與本版本 GitHub Release 頁面上的 **macOS：下載與啟動** 說明一致。
請選下面最方便閱讀的語言。

---

## English

### macOS: download and launch

1. Download `AltTheory-1.4.4-mac.zip`.
2. Unpack the complete `AltTheory` folder in Downloads. It contains
   `AltTheory.app` and `Fix-Open.command`.
3. Remove quarantine using either method:
   - **Fix-Open:** right-click `Fix-Open.command`, choose **Open**, then
     confirm **Open** again.
   - **Terminal:** run
     `xattr -dr com.apple.quarantine "$HOME/Downloads/AltTheory/AltTheory.app"`.
     If your extracted folder or app path differs, replace the path in the command.
4. Move `AltTheory.app` to Applications and open it. If macOS still blocks it,
   go to **System Settings → Privacy & Security**, choose **Open Anyway**,
   authenticate, and confirm **Open**.

The fix step exists because the Beta is not notarized by Apple. Current
macOS refuses an unsigned downloaded app as «"AltTheory" is damaged and
can’t be opened» — and no longer offers the old right-click **Open**
bypass for app bundles (older systems that still show “Apple could not
verify…” can use either route). The script only removes macOS’s
download-quarantine flag from the `AltTheory.app` beside it (or one
already moved to Applications); the Terminal command does the same thing.
Run either method only for the ZIP downloaded from
this release. Apple Silicon only. Node.js and npm are not required. The
release’s `BUILD-INFO-mac.txt` carries the SHA-256.

---

## 简体中文

### macOS：下载与启动

1. 下载 `AltTheory-1.4.4-mac.zip`。
2. 在「下载」中完整解压 `AltTheory` 文件夹；里面有 `AltTheory.app` 和
   `Fix-Open.command`。
3. 用以下任一方法解除 quarantine（下载隔离）：
   - **Fix-Open：**右键 `Fix-Open.command`，选择 **打开（Open）**，再确认一次。
   - **终端：**运行
     `xattr -dr com.apple.quarantine "$HOME/Downloads/AltTheory/AltTheory.app"`。
     如果解压后的文件夹或 App 路径不同，请替换命令中的路径。
4. 把 `AltTheory.app` 移到「应用程序」并打开。若仍被拦截，请前往
   **系统设置 → 隐私与安全性**，选择 **仍要打开（Open Anyway）**，验证身份
   后再次确认 **打开（Open）**。

需要这一步是因为 Beta 尚未经过 Apple 公证（notarization）。新版 macOS
会把未签名的下载应用直接判为「“AltTheory”已损坏，无法打开」，且不再为
应用包提供旧的右键 **打开** 绕过入口（仍显示「无法验证开发者」的旧系统
可用任一方式）。脚本只做一件事：移除旁边（或已移到「应用程序」里）的
`AltTheory.app` 上的下载隔离标记；终端命令做的是同一件事。仅在 ZIP 来自本 Release 时运行。仅支
持 Apple Silicon。使用打包应用不需要 Node.js 或 npm。本 Release 的
`BUILD-INFO-mac.txt` 含 SHA-256。

---

## 繁體中文（香港）

### macOS：下載與啟動

1. 下載 `AltTheory-1.4.4-mac.zip`。
2. 在「下載」中完整解壓縮 `AltTheory` 資料夾；裡面有 `AltTheory.app` 和
   `Fix-Open.command`。
3. 用以下任一方法解除 quarantine（下載隔離）：
   - **Fix-Open：**右鍵 `Fix-Open.command`，選擇 **開啟（Open）**，再確認一次。
   - **終端：**運行
     `xattr -dr com.apple.quarantine "$HOME/Downloads/AltTheory/AltTheory.app"`。
     如果解壓後的資料夾或 App 路徑不同，請替換指令中的路徑。
4. 把 `AltTheory.app` 移到「應用程式」並開啟。若仍被攔截，請前往
   **系統設定 → 私隱與保安**，選擇 **仍要開啟（Open Anyway）**，驗證身份
   後再次確認 **開啟（Open）**。

需要這一步是因為 Beta 尚未經過 Apple 公證（notarization）。新版 macOS
會把未簽名的下載應用直接判為「「AltTheory」已損毀，無法開啟」，且不再
為應用套件提供舊的右鍵 **開啟** 繞過入口（仍顯示「無法驗證開發者」的
舊系統可用任一方式）。腳本只做一件事：移除旁邊（或已移到「應用程式」
裡）的 `AltTheory.app` 上的下載隔離標記；終端指令做的是同一件事。只有當 ZIP 來自本 Release 時
才運行。僅支援 Apple Silicon。使用打包應用毋須 Node.js 或 npm。本
Release 的 `BUILD-INFO-mac.txt` 含 SHA-256。
