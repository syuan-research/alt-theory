import { useCallback, useEffect, useRef, useState } from "react";
import {
  conversationFileUrl,
  deleteKeptFiles,
  fetchConversationFiles,
  type ConversationFile,
  type ConversationFilesGroup,
} from "@/api/conversation-files";
import { t } from "@/i18n";
import { useApp } from "@/context/AppProvider";
import { useMainView } from "@/context/MainView";
import { useShell } from "@/context/ShellContext";
import { FolderHead, ListTools } from "@/components/inspector/FolderList";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import { copyText } from "@/lib/clipboard";
import { fmtTime, relativeTimeLabel } from "@/lib/format";
import { hasNativeBridge, openPath, revealPath } from "@/lib/native";
import { useFindTarget } from "@/lib/find";
import { fileQueryScore, parseFileQuery } from "../../../../shared/quick-find";

/**
 * Conversation files (owner 2026-09-26, prototype A): every conversation
 * folder that holds files — agent output and the user's attachments — live,
 * in Trash, or kept after a permanent delete. Built from the right pane's
 * parts (ListTools, FolderHead, file-item rows); thumbnails are the one new
 * element.
 */
export function ConversationFilesPage() {
  const app = useApp();
  const main = useMainView();
  const shell = useShell();
  const menu = useContextMenu();
  const [groups, setGroups] = useState<ConversationFilesGroup[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [byTime, setByTime] = useState(false);
  const [onlyPurged, setOnlyPurged] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const filterRef = useRef<HTMLDivElement>(null);
  useFindTarget(filterRef, {
    focus: () => {
      const input = filterRef.current?.querySelector("input");
      input?.focus();
      input?.select();
    },
  });

  const load = useCallback(() => {
    fetchConversationFiles()
      .then((next) => {
        setGroups(next);
        setError("");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);
  useEffect(load, [load]);

  const titleOf = (group: ConversationFilesGroup) =>
    group.title || `${t("Untitled conversation")} · ${group.at ? fmtTime(group.at) : group.sessionId}`;
  const stateLabel = (group: ConversationFilesGroup) =>
    group.state === "purged" ? t("Permanently deleted") : group.state === "trash" ? t("In Trash") : "";
  const fullPath = (group: ConversationFilesGroup, file: ConversationFile) => `${group.folderPath}/${file.path}`;
  const shownName = (file: ConversationFile) =>
    file.section === "attachment" ? file.path.replace(/^uploads\//, "") : file.path;

  const open = async (group: ConversationFilesGroup, file: ConversationFile) => {
    if (!(await openPath(fullPath(group, file)))) {
      window.open(conversationFileUrl(group.sessionId, file.path), "_blank", "noopener");
    }
  };
  const itemsFor = (group: ConversationFilesGroup, file: ConversationFile): ContextMenuItem[] => [
    { label: t("Copy path"), icon: "ph-copy", onSelect: () => void copyText(fullPath(group, file)) },
    // The file tree lists documents of a conversation that is open-able.
    ...(group.state === "live" && file.kind === "doc"
      ? [{
          label: t("Show in file tree"),
          icon: "ph-tree-structure",
          onSelect: () => {
            if (main.openCatalogSession(group.sessionId)) shell.revealWorkspacePath(fullPath(group, file));
          },
        }]
      : []),
    ...(hasNativeBridge()
      ? [{ label: t("Show in file manager"), icon: "ph-folder-open", onSelect: () => void revealPath(fullPath(group, file)) }]
      : []),
  ];
  const deleteGroup = (group: ConversationFilesGroup) => {
    app.requestConfirm({
      message: t("Delete these files?"),
      details: [titleOf(group), t("This cannot be undone.")],
      confirmLabel: t("Delete"),
      cancelLabel: t("Cancel"),
      onConfirm: () => {
        void deleteKeptFiles(group.sessionId)
          .then(load)
          .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
      },
    });
  };

  const row = (group: ConversationFilesGroup, file: ConversationFile, withConversation = false) => (
    <button
      key={`${group.sessionId}:${file.path}`}
      className="file-item"
      onClick={() => void open(group, file)}
      onContextMenu={(event) => menu.open(event, itemsFor(group, file))}
    >
      <i className={`ph ${file.kind === "image" ? "ph-file-image" : file.kind === "video" ? "ph-file-video" : "ph-file-text"}`} />
      <span className="s-title">{shownName(file)}</span>
      {withConversation ? (
        <span className="folder-head-role">
          {titleOf(group)}
          {stateLabel(group) ? ` · ${stateLabel(group)}` : ""}
        </span>
      ) : null}
      <span className="delta">{relativeTimeLabel(file.updatedAt)}</span>
    </button>
  );
  const tile = (group: ConversationFilesGroup, file: ConversationFile) => {
    const src = conversationFileUrl(group.sessionId, file.path);
    return (
      <button
        key={`${group.sessionId}:${file.path}`}
        className="thumb"
        data-tip={shownName(file)}
        onClick={() => void open(group, file)}
        onContextMenu={(event) => menu.open(event, itemsFor(group, file))}
      >
        {file.kind === "video" ? (
          <video src={src} preload="metadata" muted />
        ) : (
          <img src={src} alt="" loading="lazy" />
        )}
        <span className="s-title">{shownName(file)}</span>
      </button>
    );
  };
  const section = (group: ConversationFilesGroup, files: ConversationFile[]) => {
    const media = files.filter((file) => file.kind !== "doc");
    return (
      <>
        {media.length ? <div className="thumbs">{media.map((file) => tile(group, file))}</div> : null}
        {files.filter((file) => file.kind === "doc").map((file) => row(group, file))}
      </>
    );
  };

  const normalizedQuery = query.trim();
  const fileQuery = parseFileQuery(normalizedQuery);
  const lowered = normalizedQuery.toLowerCase();
  const shown = (groups ?? [])
    .filter((group) => !onlyPurged || group.state === "purged")
    .map((group) => {
      if (!normalizedQuery) return group;
      // A conversation's name or folder matches like a folder: whole group.
      if (titleOf(group).toLowerCase().includes(lowered) || group.folderPath.toLowerCase().includes(lowered)) return group;
      return {
        ...group,
        files: group.files.filter((file) =>
          fileQueryScore(fileQuery, file.path.split("/").at(-1) ?? "", fullPath(group, file)) > 0),
      };
    })
    .filter((group) => group.files.length > 0);
  const toggle = (id: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  let body;
  if (error) body = <div className="rp-empty">{error}</div>;
  else if (!groups) body = <div className="rp-empty">{t("Loading…")}</div>;
  else if (groups.length === 0) body = <div className="rp-empty">{t("No conversation files yet.")}</div>;
  else if (shown.length === 0) {
    body = (
      <div className="rp-empty">
        {!normalizedQuery && onlyPurged ? t("No files left by permanently deleted conversations.") : t("No matching files.")}
      </div>
    );
  } else if (byTime) {
    body = shown
      .flatMap((group) => group.files.map((file) => ({ group, file })))
      .sort((a, b) => b.file.updatedAt.localeCompare(a.file.updatedAt))
      .map(({ group, file }) => row(group, file, true));
  } else {
    body = shown.map((group) => {
      // A filter shows matches even inside folded groups.
      const isClosed = !normalizedQuery && closed.has(group.sessionId);
      const products = group.files.filter((file) => file.section === "product");
      const attachments = group.files.filter((file) => file.section === "attachment");
      return (
        <div key={group.sessionId} className="changes-group">
          <FolderHead
            name={titleOf(group)}
            path={group.folderPath}
            role={stateLabel(group)}
            closed={isClosed}
            onToggle={() => toggle(group.sessionId)}
          />
          {isClosed ? null : (
            <>
              {products.length ? (
                <>
                  <div className="files-section-title">{t("Products")}</div>
                  {section(group, products)}
                </>
              ) : null}
              {attachments.length ? (
                <>
                  <div className="files-section-title">{t("Attachments")}</div>
                  {section(group, attachments)}
                </>
              ) : null}
              {group.state === "purged" ? (
                <div className="files-tree-toolbar">
                  <button className="flat" onClick={() => deleteGroup(group)}>
                    <i className="ph ph-trash" aria-hidden="true" />
                    {t("Delete these files")}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      );
    });
  }

  return (
    <div className="settings">
      <div className="set-body">
        <div className="set-scroll">
          <div className="set-panel conversation-files">
            <h2>{t("Conversation files")}</h2>
            <p className="sub">
              {t("Attachments and products in Alt's own conversation folders. Project folders outside the app are not included.")}
            </p>
            {groups?.length ? (
              <>
                <div className="change-preview-toolbar">
                  <button className={`flat${byTime ? "" : " on"}`} onClick={() => setByTime(false)}>
                    {t("By conversation")}
                  </button>
                  <button className={`flat${byTime ? " on" : ""}`} onClick={() => setByTime(true)}>
                    {t("By time")}
                  </button>
                  <span className="change-preview-time">
                    <button className={`flat${onlyPurged ? " on" : ""}`} onClick={() => setOnlyPurged((value) => !value)}>
                      {t("Only permanently deleted")}
                    </button>
                  </span>
                </div>
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
                    {...(byTime
                      ? {}
                      : {
                          onExpandAll: () => setClosed(new Set()),
                          onCollapseAll: () => setClosed(new Set(shown.map((group) => group.sessionId))),
                        })}
                  />
                </div>
              </>
            ) : null}
            {body}
            {menu.element}
          </div>
        </div>
      </div>
    </div>
  );
}
