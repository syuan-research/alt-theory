import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ChangeGroup, FileChange } from "@/api/types";
import { fetchSessionChanges, renameFile } from "@/api/session-files";
import { NameForm } from "@/components/inspector/FolderList";
import { t } from "@/i18n";
import { useConversationContext } from "@/context/ConversationContext";
import { useShell } from "@/context/ShellContext";
import { FilePreview } from "@/components/inspector/FilePreview";
import { TabStrip } from "@/components/shell/TabStrip";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import { fileMenuItems } from "@/lib/fileMenu";
import { NEW_DRAFT, stageInDraft, unstageInDraft, useDraft } from "@/lib/draft";
import { paneMemory, usePaneMemory } from "@/lib/paneMemory";
import { useMainView } from "@/context/MainView";
import { PaneActions } from "@/components/shell/PaneActions";
import { CenterIcon } from "@/components/ui/CenterIcon";
import { targetTitle, type ChangeTarget, type FileTarget, type OpenFile } from "@/lib/viewTarget";

/** The display path of an open file: the file's, else the change's. */
const displayPath = (file: OpenFile): string =>
  file.file ? targetTitle(file.file) ?? file.file.path : file.change?.title ?? "";

const absoluteOf = (target: FileTarget): string | undefined => ("absolutePath" in target ? target.absolutePath : undefined);
/** The address every file action uses: the absolute one when it is known. */
const addressOf = (file: OpenFile): string =>
  (file.file && (file.file.root === "local" ? file.file.path : absoluteOf(file.file))) ?? file.change?.path ?? displayPath(file);

const findChange = (groups: ChangeGroup[] | null | undefined, path: string): FileChange | null =>
  groups?.flatMap((group) => group.files).find((file) => file.resolvedPath === path || file.path === path) ?? null;

/** The change an open file was opened from Changes with: its diff, and how the
 *  content route reaches the current file. The list of changes is the Changes
 *  entry's (one pane-memory entry); it is read again whenever a run settles. */
function useChangeEntry(sessionId: string | null, path: string | undefined): FileChange | null {
  const runCount = useConversationContext().runSettledCount;
  const [groups, setGroups] = usePaneMemory<ChangeGroup[] | null>(`${sessionId}:changes:groups`, null);
  useEffect(() => {
    if (!sessionId || !path) return;
    let cancelled = false;
    fetchSessionChanges(sessionId)
      .then((res) => { if (!cancelled) setGroups(res.groups); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [sessionId, path, runCount]);
  return path ? findChange(groups, path) : null;
}

/**
 * The open files (owner 2026-11-25): one tab per file at the top, the file on
 * show below. The files opened from Changes and Files, and from links in a
 * conversation, come here, so an entry goes on showing its list. A file that
 * is not on show stays mounted: its scroll, its zoom and its open editor are
 * as they were when it comes back.
 */
export function OpenFilesPanel() {
  const shell = useShell();
  const menu = useContextMenu();
  const files = shell.openedFiles;
  const activeKey = shell.activeFile;
  const activeFile = files.find((file) => file.key === activeKey) ?? null;
  const main = useMainView();
  const [renaming, setRenaming] = useState<FileTarget | null>(null);
  const rename = async (name: string): Promise<boolean> => {
    if (!renaming || renaming.root === "local") return false;
    try {
      const owner = renaming.sessionId ?? { primaryDir: renaming.draftPrimaryDir ?? null };
      const moved = await renameFile(owner, renaming.root, renaming.path, name);
      shell.renameFile(renaming, { ...renaming, path: moved.path, absolutePath: moved.absolutePath });
      setRenaming(null);
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
      return false;
    }
  };
  return (
    <div className="open-files">
      <TabStrip
        className="child-switch open-file-tabs"
        role="tablist"
        aria-label={t("Open files")}
        activeKey={activeKey}
        onFocusKey={shell.activateFile}
      >
        {files.map((file) => (
          <OpenFileTab key={file.key} file={file} active={file.key === activeKey} menu={menu} onRename={setRenaming} />
        ))}
      </TabStrip>
      {renaming ? (
        <NameForm
          key={`${renaming.root}:${renaming.path}`}
          initial={renaming.path.split("/").at(-1) ?? renaming.path}
          onSubmit={rename}
          onCancel={() => setRenaming(null)}
        />
      ) : null}
      {files.map((file) => (
        <OpenFileReader key={file.key} file={file} active={file.key === activeKey} />
      ))}
      {files.length === 0 ? <div className="rp-empty">{t("No open files.")}</div> : null}
      {activeFile ? (
        <PaneActions>
          <button
            type="button"
            className="rp-act rp-center"
            aria-label={t("Show in the center")}
            data-tip={t("Show in the center")}
            onClick={() => main.toCenter({ kind: "file", file: activeFile })}
          >
            <CenterIcon />
          </button>
          <button
            type="button"
            className="rp-act"
            aria-label={t("More actions")}
            aria-haspopup="menu"
            data-tip={t("More actions")}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              menu.openAt(rect.right - 220, rect.bottom + 4, openFileItems(activeFile, shell, setRenaming), event.currentTarget);
            }}
          >
            <i className="ph ph-dots-three" aria-hidden="true" />
          </button>
        </PaneActions>
      ) : null}
      {menu.element}
    </div>
  );
}

/** An open file's menu: the same file menu the file tree and Changes offer,
 *  plus Rename for the user's own files. */
function openFileItems(file: OpenFile, shell: ReturnType<typeof useShell>, onRename: (target: FileTarget) => void): ContextMenuItem[] {
  const change = file.change;
  const address = addressOf(file);
  // A file outside every root, or one the desktop opened from anywhere, is in no tree.
  const inTree = file.file ? file.file.root !== "local" : Boolean(change && changeFileInTree(change.sessionId, change.path));
  // The user's own files rename here; attachments keep the names messages point at.
  const renamable = file.file && file.file.root !== "local" && !(file.file.root === "workspace" && /^(uploads|extracted)\//.test(file.file.path))
    ? file.file : null;
  return [
    ...fileMenuItems(address, inTree ? () => shell.revealWorkspacePath(address) : undefined),
    ...(renamable ? [{ label: t("Rename"), icon: "ph-pencil-simple", onSelect: () => onRename(renamable) }] : []),
  ];
}

/** One tab: the Related chip, with room for a file name and a close over its
 *  right end. It opens the panel's one context menu. */
function OpenFileTab({ file, active, menu, onRename }: { file: OpenFile; active: boolean; menu: ReturnType<typeof useContextMenu>; onRename: (target: FileTarget) => void }) {
  const shell = useShell();
  const name = displayPath(file).split(/[\\/]/).at(-1) ?? displayPath(file);
  // The stem ellipsizes when the tab is narrow; its extension never does.
  const dot = name.lastIndexOf(".");
  const change = file.change;
  const address = addressOf(file);
  const items = () => openFileItems(file, shell, onRename);
  const openMenuFromKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    menu.openAt(rect.left + 18, rect.bottom, items(), event.currentTarget);
  };
  return (
    <div className={`open-file-tab${active ? " on" : ""}`} role="presentation">
      <button
        type="button"
        role="tab"
        aria-selected={active}
        data-tab-key={file.key}
        data-tip={address}
        className={active ? "on" : ""}
        onClick={() => shell.activateFile(file.key)}
        onContextMenu={(event) => menu.open(event, items())}
        onKeyDown={openMenuFromKey}
      >
        <i className={`ph ${change ? "ph-pencil-simple-line" : "ph-file-text"}`} />
        <span className="file-name">
          <span className="file-stem">{dot > 0 ? name.slice(0, dot) : name}</span>
          {dot > 0 ? <span className="file-ext">{name.slice(dot)}</span> : null}
        </span>
      </button>
      <button type="button" className="tab-close" aria-label={`${t("Close")} ${name}`} onClick={() => shell.closeFile(file.key)}>
        <i className="ph ph-x" />
      </button>
    </div>
  );
}

/** One open file's reader. It stays mounted while another file is on show.
 *  The center shows the same reader with its own view (`onViewChange`). */
export function OpenFileReader({ file, active, onViewChange }: {
  file: OpenFile;
  active: boolean;
  onViewChange?: (view: OpenFile["view"]) => void;
}) {
  const shell = useShell();
  const target = file.file;
  const change: ChangeTarget | null = file.change;
  const entry = useChangeEntry(change?.sessionId ?? null, change?.path);
  // How the content route reaches the current file: the file's own address, else the change's.
  const fileRef = target && target.root !== "local"
    ? { root: target.root, path: target.path }
    : entry?.contentRef ? { root: entry.contentRef.root, path: entry.contentRef.path } : null;
  const absolutePath = target?.root === "local" ? target.path : (target && absoluteOf(target)) ?? change?.path;
  // Attaching goes to the message of the conversation the file belongs to.
  const attachments = useDraft(target?.sessionId ?? NEW_DRAFT).draft.attachments;
  const staged = target?.root === "workspace" && attachments.includes(target.path);
  return (
    <div className="open-file-reader" hidden={!active}>
      <FilePreview
        sessionId={entry?.contentRef?.sessionId ?? target?.sessionId ?? null}
        draftPrimaryDir={target?.sessionId === null ? target.draftPrimaryDir : undefined}
        path={displayPath(file)}
        fileRef={fileRef}
        absolutePath={absolutePath}
        diff={change ? entry?.diff : undefined}
        mode={file.view}
        onModeChange={(view) => (onViewChange ? onViewChange(view) : shell.setFileView(file.key, view))}
        onSaved={(saved) => {
          // A conflict copy saved to a sibling: follow it there.
          if (!target || target.root === "local" || saved.path === target.path) return;
          const name = saved.path.split("/").at(-1) ?? saved.path;
          shell.openTarget({ ...target, path: saved.path, absolutePath: target.absolutePath?.replace(/[^\\/]+$/, () => name) });
        }}
        footer={target?.root === "workspace" ? (
          <button
            className="wb-apply"
            onClick={() => staged ? unstageInDraft(target.sessionId, [target.path]) : stageInDraft(target.sessionId, [target.path])}
          >
            {staged ? t("Remove from message") : t("Attach to message")}
          </button>
        ) : null}
        revision={file.revision}
      />
    </div>
  );
}

/** Whether the file of a change sits in a tree, for the tab's menu. */
function changeFileInTree(sessionId: string, path: string): boolean {
  return Boolean(findChange(paneMemory.get<ChangeGroup[] | null>(`${sessionId}:changes:groups`), path)?.contentRef);
}
