import type { ContextMenuItem } from "@/components/shell/ContextMenu";
import { copyText } from "@/lib/clipboard";
import { hasNativeBridge, openPath, revealPath } from "@/lib/native";
import { t } from "@/i18n";

/** File tree, Changes and transcript file rows offer the same file actions. */
export function fileMenuItems(path: string, showInTree?: () => void): ContextMenuItem[] {
  return [
    { label: t("Copy path"), icon: "ph-copy", onSelect: () => void copyText(path) },
    ...(showInTree ? [{ label: t("Show in file tree"), icon: "ph-tree-structure", onSelect: showInTree }] : []),
    ...(hasNativeBridge() ? [
      { label: t("Open with default app"), icon: "ph-arrow-square-out", onSelect: () => void openPath(path).catch(error => window.alert(String(error))) },
      { label: t("Show in file manager"), icon: "ph-folder-open", onSelect: () => void revealPath(path) },
    ] : []),
  ];
}
