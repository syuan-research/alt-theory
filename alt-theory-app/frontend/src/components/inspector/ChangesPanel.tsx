import { useEffect, useRef } from "react";
import type { ChangeGroup, FileChange } from "@/api/types";
import { fetchSessionChanges } from "@/api/session-files";
import { t } from "@/i18n";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { FilePreview } from "@/components/inspector/FilePreview";
import { FolderHead, ListTools } from "@/components/inspector/FolderList";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import { copyText } from "@/lib/clipboard";
import { hasNativeBridge, revealPath } from "@/lib/native";
import { usePaneMemory } from "@/lib/paneMemory";
import { useFindTarget } from "@/lib/find";
import type { PreviewMode } from "@/lib/fileContent";
import { fileQueryScore, parseFileQuery } from "../../../../shared/quick-find";

/**
 * Files the conversation family changed (M7 §2; card 7), grouped the way
 * prototype D groups them: each project folder is one group, everything
 * outside groups by containing folder under the depth cap. A new file opens
 * in Rendered when available; the viewer control follows the file type.
 */
export function ChangesPanel() {
  const app = useApp();
  const shell = useShell();
  const menu = useContextMenu();

  const sessionId = app.sessionId;
  const runCount = app.runCompletedCount;
  const key = shell.rightSub?.key;
  const [closed, setClosed] = usePaneMemory<string[]>(`${sessionId}:changes:closed`, []);
  const [mode, setMode] = usePaneMemory<PreviewMode>(`${sessionId}:changes:${key ?? ""}:mode`, "rendered");
  const [groups, setGroups] = usePaneMemory<ChangeGroup[] | null>(`${sessionId}:changes:groups`, null);
  const [error, setError] = usePaneMemory<string | null>(`${sessionId}:changes:error`, null);
  // The same always-visible filter as Files (owner 2026-09-24: lists of
  // things to open filter; opened content gets the Ctrl+F find bar).
  const [query, setQuery] = usePaneMemory(`${sessionId}:changes:query`, "");
  const filterRef = useRef<HTMLDivElement>(null);
  useFindTarget(filterRef, {
    focus: () => {
      const input = filterRef.current?.querySelector("input");
      input?.focus();
      input?.select();
    },
  });

  useEffect(() => {
    if (!sessionId) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    fetchSessionChanges(sessionId)
      .then((res) => !cancelled && (setGroups(res.groups), setError(null)))
      .catch((e) => !cancelled && setError(e?.message ?? "Failed to load changes"));
    return () => {
      cancelled = true;
    };
  }, [sessionId, runCount]);

  // The open file is the pane's `changes:<resolvedPath>` sub — set here, by
  // the turn-end card in the conversation, or restored by the shell after a
  // collapse — so the drill-in survives a remount.
  const selected =
    key?.startsWith("changes:")
      ? groups?.flatMap((group) => group.files).find((file) => file.resolvedPath === key.slice("changes:".length) || file.path === key.slice("changes:".length)) ?? null
      : null;

  if (selected) {
    return (
      <FilePreview
        sessionId={sessionId}
        path={selected.displayPath}
        fileRef={selected.contentRef ?? null}
        diff={selected.diff}
        mode={mode}
        onModeChange={setMode}
      />
    );
  }

  if (error) return <div className="rp-empty">{error}</div>;
  if (!groups) return <div className="rp-empty">{t("Loading…")}</div>;
  if (groups.length === 0) {
    return <div className="rp-empty">{t("No file changes in this conversation yet.")}</div>;
  }

  const fileItems = (file: FileChange): ContextMenuItem[] => [
    { label: t("Copy path"), icon: "ph-copy", onSelect: () => void copyText(file.resolvedPath) },
    ...(file.contentRef ? [{ label: t("Show in file tree"), icon: "ph-tree-structure", onSelect: () => shell.revealWorkspacePath(file.resolvedPath) }] : []),
    ...(hasNativeBridge() ? [{ label: t("Show in file manager"), icon: "ph-folder-open", onSelect: () => void revealPath(file.resolvedPath) }] : []),
  ];
  const roleText = (group: ChangeGroup) =>
    group.role === "primary" ? t("Main folder") : group.role === "companion" ? t("Companion folder") : t("Outside");
  const normalizedQuery = query.trim();
  const fileQuery = parseFileQuery(normalizedQuery);
  const shown = normalizedQuery
    ? groups
        .map((group) => ({
          ...group,
          files: group.files.filter((file) => fileQueryScore(
            fileQuery, file.displayPath.split(/[\\/]/).at(-1) ?? "", file.resolvedPath,
          ) > 0),
        }))
        .filter((group) => group.files.length > 0)
    : groups;
  const toggle = (path: string) =>
    setClosed((prev) => (prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]));

  return (
    <div onKeyDown={(event) => {
      if (event.key !== "Escape" || event.nativeEvent.isComposing || !query.trim()) return;
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
    }}>
      <ListTools
        filterRef={filterRef}
        query={query}
        onQuery={setQuery}
        onEscape={() => setQuery("")}
        placeholder={t("Filter files")}
        onExpandAll={() => setClosed([])}
        onCollapseAll={() => setClosed(groups.map((group) => group.path))}
      />
      {normalizedQuery && shown.length === 0 ? (
        <div className="rp-empty">{t("No matching files.")}</div>
      ) : null}
      {shown.map((group) => {
        // Filtering shows matches even inside a collapsed group.
        const isClosed = !normalizedQuery && closed.includes(group.path);
        return (
          <div key={`${group.role}:${group.path}`} className="changes-group">
            <FolderHead
              path={group.title}
              role={roleText(group)}
              closed={isClosed}
              onToggle={() => toggle(group.path)}
            />
            {isClosed
              ? null
              : group.files.map((file) => (
                  <button
                    key={file.resolvedPath}
                    className="file-item"
                    onContextMenu={(event) => menu.open(event, fileItems(file))}
                    onKeyDown={(event) => {
                      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      menu.openAt(rect.left + 18, rect.bottom, fileItems(file), event.currentTarget);
                    }}
                    onClick={() => {
                      shell.openSub({ key: `changes:${file.resolvedPath}`, title: file.displayPath });
                    }}
                  >
                    <i className="ph ph-file-text" />
                    <span className="s-title">{file.displayPath}</span>
                    <span className="delta">
                      {file.added ? `+${file.added}` : ""}
                      {file.added && file.removed ? " " : ""}
                      {file.removed ? `-${file.removed}` : ""}
                    </span>
                  </button>
                ))}
            {!isClosed && group.capped ? (
              <div className="wb-note">{t("Deeper folders are grouped here.")}</div>
            ) : null}
          </div>
        );
      })}
      {menu.element}
    </div>
  );
}
