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

1. Download `AltTheory-{X.Y.Z}-mac.zip`.
2. Double-click the ZIP to unpack the `AltTheory` folder. It contains
   `AltTheory.app` and a small `Fix-Open.command` script.
3. Right-click `Fix-Open.command`, choose **Open**, then **Open** in the
   dialog. A Terminal window reports the fix and waits for a key.
4. Move `AltTheory.app` to Applications and open it with an ordinary
   double-click.

The fix step exists because the Beta is not notarized by Apple. Current
macOS refuses an unsigned downloaded app as «"AltTheory" is damaged and
can’t be opened» — and no longer offers the old right-click **Open**
bypass for app bundles (older systems that still show “Apple could not
verify…” can use either route). The script only removes macOS’s
download-quarantine flag from the `AltTheory.app` beside it (or one
already moved to Applications). Run it only for the ZIP downloaded from
this release. Apple Silicon only. Node.js and npm are not required. The
release’s `BUILD-INFO-mac.txt` carries the SHA-256.

---

## 简体中文

### macOS：下载与启动

1. 下载 `AltTheory-{X.Y.Z}-mac.zip`。
2. 双击 ZIP 解压出 `AltTheory` 文件夹——里面有 `AltTheory.app` 和一个小
   脚本 `Fix-Open.command`（修复打开）。
3. 右键 `Fix-Open.command`，选择 **打开（Open）**，再在对话框中选一次
   **打开（Open）**。终端窗口会提示修复完成并等待按键。
4. 把 `AltTheory.app` 移到「应用程序」，之后正常双击打开即可。

需要这一步是因为 Beta 尚未经过 Apple 公证（notarization）。新版 macOS
会把未签名的下载应用直接判为「“AltTheory”已损坏，无法打开」，且不再为
应用包提供旧的右键 **打开** 绕过入口（仍显示「无法验证开发者」的旧系统
可用任一方式）。脚本只做一件事：移除旁边（或已移到「应用程序」里）的
`AltTheory.app` 上的下载隔离标记。仅在 ZIP 来自本 Release 时运行。仅支
持 Apple Silicon。使用打包应用不需要 Node.js 或 npm。本 Release 的
`BUILD-INFO-mac.txt` 含 SHA-256。

---

## 繁體中文（香港）

### macOS：下載與啟動

1. 下載 `AltTheory-{X.Y.Z}-mac.zip`。
2. 雙擊 ZIP 解壓出 `AltTheory` 資料夾——裡面有 `AltTheory.app` 和一個小
   腳本 `Fix-Open.command`（修復開啟）。
3. 右鍵 `Fix-Open.command`，選擇 **開啟（Open）**，再在對話框中選一次
   **開啟（Open）**。終端視窗會提示修復完成並等待按鍵。
4. 把 `AltTheory.app` 移到「應用程式」，之後正常雙擊開啟即可。

需要這一步是因為 Beta 尚未經過 Apple 公證（notarization）。新版 macOS
會把未簽名的下載應用直接判為「「AltTheory」已損毀，無法開啟」，且不再
為應用套件提供舊的右鍵 **開啟** 繞過入口（仍顯示「無法驗證開發者」的
舊系統可用任一方式）。腳本只做一件事：移除旁邊（或已移到「應用程式」
裡）的 `AltTheory.app` 上的下載隔離標記。只有當 ZIP 來自本 Release 時
才運行。僅支援 Apple Silicon。使用打包應用毋須 Node.js 或 npm。本
Release 的 `BUILD-INFO-mac.txt` 含 SHA-256。
