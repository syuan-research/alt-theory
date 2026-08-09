#!/bin/bash
# Alt Theory fix-open (macOS). The Beta is not notarized by Apple, so a
# freshly downloaded copy carries macOS's download-quarantine flag and is
# refused as "damaged". This script removes that flag from the
# AltTheory.app beside it (or one already moved to /Applications) and does
# nothing else. Ship it inside the mac release ZIP, next to AltTheory.app.
cd "$(dirname "$0")"
fixed=""
for app in "./AltTheory.app" "/Applications/AltTheory.app"; do
  if [ -d "$app" ]; then
    xattr -dr com.apple.quarantine "$app" 2>/dev/null
    fixed="$fixed $app"
  fi
done
echo
if [ -n "$fixed" ]; then
  echo "修复完成：现在可以双击打开 AltTheory 了。"
  echo "Fixed:$fixed"
  echo "You can now open AltTheory with a normal double-click."
else
  echo "没有找到 AltTheory.app——请把本文件和 AltTheory.app 放在同一个文件夹后再运行一次。"
  echo "AltTheory.app not found — keep this file next to AltTheory.app and run it again."
fi
echo
read -n 1 -s -r -p "按任意键关闭此窗口 / Press any key to close this window"
echo
