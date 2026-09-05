import { useEffect } from "react";
import type { ChangeGroup, FileChange } from "@/api/types";
import { fetchSessionChanges } from "@/api/session-files";
import { t } from "@/i18n";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { FilePreview } from "@/components/inspector/FilePreview";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import { copyText } from "@/lib/clipboard";
import { hasNativeBridge, revealPath } from "@/lib/native";
import { usePaneMemory } from "@/lib/paneMemory";
import type { PreviewMode } from "@/lib/fileContent";

/**
 * Files the conversation family changed (M7 §2; card 7), grouped the way
 * prototype D groups them: each project folder is one group, everything
 * outside groups by containing folder under the depth cap. A click always
 * lands on the diff; the viewer control follows the file type.
 */
export function ChangesPanel() {
  const app = useApp();
  const shell = useShell();
  const menu = useContextMenu();

  const sessionId = app.sessionId;
  const runCount = app.runCompletedCount;
  const [closed, setClosed] = usePaneMemory<string[]>(`${sessionId}:changes:closed`, []);
  const [mode, setMode] = usePaneMemory<PreviewMode>(`${sessionId}:changes:mode`, "diff");
  const [groups, setGroups] = usePaneMemory<ChangeGroup[] | null>(`${sessionId}:changes:groups`, null);
  const [error, setError] = usePaneMemory<string | null>(`${sessionId}:changes:error`, null);

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
  const key = shell.rightSub?.key;
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
    group.role === "primary" ? t("Main folder") : group.role === "additional" ? t("Second folder") : t("Outside");
  const titleOf = (group: ChangeGroup) => group.title.split(/[\\/]/).filter(Boolean).at(-1) ?? group.title;
  const toggle = (path: string) =>
    setClosed((prev) => (prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]));

  return (
    <>
      {groups.map((group) => {
        const isClosed = closed.includes(group.path);
        return (
          <div key={`${group.role}:${group.path}`} className="changes-group">
            <button type="button" className={`group-label changes-group-head${isClosed ? " closed" : ""}`} data-tip={group.title} onClick={() => toggle(group.path)}>
              <i className="ph ph-folder-simple" />
              <span className="group-name">{titleOf(group)}</span>
              <span className="changes-group-role">{roleText(group)}</span>
              {group.role === "outside" && hasNativeBridge() ? (
                <span
                  role="button"
                  className="changes-group-open"
                  data-tip={t("Show in file manager")}
                  onClick={(event) => {
                    event.stopPropagation();
                    void revealPath(group.title);
                  }}
                >
                  <i className="ph ph-arrow-square-out" />
                </span>
              ) : null}
              <i className="ph ph-caret-down tw" />
            </button>
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
                      setMode("diff");
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
    </>
  );
}
