import { getSessionFileContent, listWorkingFolders } from "@/api/session-files";
import { useShell } from "@/context/ShellContext";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import { contentLink, resolveFileLink } from "@/lib/contentLinks";
import type { FileRef } from "@/lib/fileContent";
import { copyText } from "@/lib/clipboard";
import { hasNativeBridge, openExternal, openPath, revealPath } from "@/lib/native";
import { t } from "@/i18n";

export function useContentLinks(sessionId: string | null, base?: FileRef, baseFolderPath?: string | null) {
  const shell = useShell();
  const menu = useContextMenu();
  const report = (error: unknown) => window.alert(error instanceof Error ? error.message : String(error));
  const resolve = async (href: string) => {
    const link = contentLink(href);
    if (!link || link.kind !== "file") return { link, ref: null };
    const response = sessionId ? await listWorkingFolders(sessionId) : null;
    const folders = [...(response?.folders ?? [])];
    if (response?.workspacePath && !folders.some((folder) => folder.managed)) {
      folders.push({ id: "managed", path: response.workspacePath, role: "secondary", managed: true, available: true });
    }
    const file = resolveFileLink(link.address, folders, base, baseFolderPath);
    return { link: { ...link, address: file.address }, ref: file.ref };
  };
  const open = async (href: string, externally = false) => {
    const { link, ref } = await resolve(href);
    if (!link || link.kind === "anchor") return;
    if (link.kind === "file") {
      if (!externally && sessionId && ref) {
        try {
          const file = await getSessionFileContent(sessionId, ref.root, ref.path);
          if (!file.content.includes("\0")) {
            shell.openTarget(ref.root === "records"
              ? { kind: "record", sessionId, root: "records", path: ref.path }
              : { kind: "file", sessionId, root: ref.root, path: ref.path });
            return;
          }
        } catch { /* A file without an internal preview opens in its default app. */ }
      }
      if (!(await openPath(link.address))) throw new Error(t("Opening local files requires the desktop app."));
    } else if (link.kind === "page" && !externally) {
      shell.openTarget({ kind: "page", sessionId, url: link.address });
    } else if (!(await openExternal(link.address))) {
      window.open(link.address, "_blank", "noopener,noreferrer");
    }
  };
  const context = (event: React.MouseEvent, href: string) => {
    event.preventDefault();
    const { clientX, clientY } = event;
    const anchor = event.target as Node;
    void resolve(href).then(({ link, ref }) => {
      if (!link || link.kind === "anchor" || !anchor.isConnected) return;
      const items: ContextMenuItem[] = [
        { label: t("Copy link"), icon: "ph-link", onSelect: () => void copyText(href) },
        { label: t("Open with default app"), icon: "ph-arrow-square-out", onSelect: () => void open(href, true).catch(report) },
      ];
      if (link.kind === "file") {
        if (ref) items.push({ label: t("Show in file tree"), icon: "ph-tree-structure", onSelect: () => shell.revealWorkspacePath(link.address) });
        if (hasNativeBridge()) items.push({ label: t("Show in file manager"), icon: "ph-folder-open", onSelect: () => void revealPath(link.address) });
      }
      menu.openAt(clientX, clientY, items, anchor);
    }).catch(report);
  };
  return {
    open: (href: string) => void open(href).catch(report),
    openDefault: (href: string) => void open(href, true).catch(report),
    context, menu: menu.element,
  };
}
