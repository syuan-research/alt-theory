import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  expandAllFeature,
  hotkeysCoreFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import type { WorkingFolderDescriptor, WorkingTreeEntry, WorkspaceFileEntry } from "@/api/types";
import {
  getSessionFileContent,
  listWorkingDirectory,
  listWorkingFolders,
  listWorkspaceFiles,
  searchWorkingDirectory,
  uploadWorkspaceFile,
} from "@/api/session-files";
import { t } from "@/i18n";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { hasNativeBridge, revealPath } from "@/lib/native";
import { stagePathAfterUpload, WORKSPACE_PATH_MIME } from "@/lib/workspace";
import { MarkdownBody } from "@/components/conversation/MarkdownBody";
import { buildFileTreeModel, getFileTreeNode, type FileTreeNode } from "@/lib/fileTree";
import { copyText } from "@/lib/clipboard";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";

export function WorkspaceTree() {
  const app = useApp();
  const shell = useShell();
  const [entries, setEntries] = useState<WorkspaceFileEntry[] | null>(null);
  const [workingFolders, setWorkingFolders] = useState<WorkingFolderDescriptor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    path: string;
    content: string;
    source: "managed" | "working";
  } | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [previewView, setPreviewView] = useState<"rendered" | "source">(
    "rendered",
  );
  const [expandSignal, setExpandSignal] = useState(0);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [query, setQuery] = useState("");
  const uploadInput = useRef<HTMLInputElement>(null);

  const sessionId = app.sessionId;
  const runCount = app.runCompletedCount;
  const understandMode =
    app.runtimeMode === "alt-theory" &&
    (sessionId
      ? app.sessionMode === "understand"
      : shell.newMode === "understand");

  useEffect(() => {
    setUploadStatus("");
    if (!sessionId) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    listWorkspaceFiles(sessionId)
      .then((res) => {
        if (cancelled) return;
        setEntries(res.entries ?? res.files);
        setWorkingFolders(res.workingFolders ?? []);
        setError(null);
        if (app.appMode === "local") {
          void listWorkingFolders(sessionId).then((working) => {
            if (cancelled) return;
            setWorkingFolders(working.folders);
          }).catch(() => undefined);
        }
      })
      .catch((e) => !cancelled && setError(e?.message ?? "Failed to load files"));
    return () => {
      cancelled = true;
    };
  }, [app.appMode, sessionId, runCount]);

  useEffect(() => {
    if (!shell.rightSub) setPreview(null);
  }, [shell.rightSub]);

  useEffect(() => {
    setPreview(null);
    setQuery("");
  }, [sessionId]);

  useEffect(() => {
    const target = shell.workspaceRevealPath;
    if (!target) return;
    setPreview(null);
    setQuery(target.split(/[\\/]/).filter(Boolean).at(-1) ?? target);
    shell.clearWorkspaceRevealPath();
  }, [shell.workspaceRevealPath, shell.clearWorkspaceRevealPath]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filterEntries = <T extends { path: string }>(items: T[]) =>
    normalizedQuery
      ? items.filter((entry) => entry.path.toLocaleLowerCase().includes(normalizedQuery))
      : items;

  useEffect(() => {
    if (!sessionId || !preview) return;
    const selected = preview;
    const root = selected.source === "working" ? "working" : "workspace";
    let cancelled = false;
    getSessionFileContent(sessionId, root, selected.path)
      .then((res) => {
        if (cancelled) return;
        setPreview((current) =>
          current?.path === selected.path && current.source === selected.source
            ? { ...current, content: res.content }
            : current,
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionId, runCount]);

  const referenceEntries = useMemo(
    () => filterEntries((entries ?? []).filter((entry) => /^(uploads|extracted)\//.test(entry.path))),
    [entries, normalizedQuery]
  );
  const conversationFolderEntries = useMemo(
    () => filterEntries((entries ?? []).filter((entry) => !/^(uploads|extracted)\//.test(entry.path))),
    [entries, normalizedQuery]
  );
  const managedFolderPath = workingFolders.find((folder) => folder.managed)?.path ?? "";

  const openFile = async (entry: WorkspaceFileEntry) => {
    if (!sessionId || entry.kind === "binary-original") return;
    try {
      const res = await getSessionFileContent(sessionId, "workspace", entry.path);
      setPreviewView("rendered");
      setPreview({ path: entry.path, content: res.content, source: "managed" });
      shell.openSub({ key: `ws:${entry.path}`, title: entry.path });
    } catch (e) {
      setPreview({
        path: entry.path,
        content: e instanceof Error ? e.message : "Could not read file.",
        source: "managed",
      });
      shell.openSub({ key: `ws:${entry.path}`, title: entry.path });
    }
  };

  const openWorkingFile = async (entry: WorkingTreeEntry) => {
    if (!sessionId || !entry.previewable) return;
    const path = `${entry.folderId}/${entry.path}`;
    try {
      const res = await getSessionFileContent(sessionId, "working", path);
      setPreviewView("rendered");
      setPreview({ path, content: res.content, source: "working" });
      shell.openSub({ key: `working:${path}`, title: entry.path });
    } catch (e) {
      setPreview({
        path,
        content: e instanceof Error ? e.message : "Could not read file.",
        source: "working",
      });
      shell.openSub({ key: `working:${path}`, title: entry.path });
    }
  };

  const importFile = async (file: File) => {
    if (!sessionId) return;
    setUploadStatus("Importing…");
    try {
      const result = await uploadWorkspaceFile(sessionId, file);
      const stagePath = stagePathAfterUpload(result);
      if (stagePath) app.stageWorkspacePath(stagePath);
      const refreshed = await listWorkspaceFiles(sessionId);
      setEntries(refreshed.entries ?? refreshed.files);
      setWorkingFolders(refreshed.workingFolders ?? []);
      setError(null);
      setUploadStatus(
        result.extractStatus === "failed"
          ? result.extractError || "Could not read this file."
          : `${file.name} attached to the next message.`
      );
    } catch (e) {
      setUploadStatus(e instanceof Error ? e.message : "Import failed.");
    } finally {
      if (uploadInput.current) uploadInput.current.value = "";
    }
  };

  if (preview) {
    const staged = app.stagedWorkspacePaths.includes(preview.path);
    const renderedAvailable = /\.md$/i.test(preview.path);
    return (
      <div className="preview">
        {renderedAvailable ? (
          <div className="change-preview-toolbar">
            <button
              className={`flat${previewView === "rendered" ? " on" : ""}`}
              onClick={() => setPreviewView("rendered")}
            >
              {t("Rendered")}
            </button>
            <button
              className={`flat${previewView === "source" ? " on" : ""}`}
              onClick={() => setPreviewView("source")}
            >
              {t("Source")}
            </button>
          </div>
        ) : null}
        <div className="pv-card change-preview-body expanded">
          {renderedAvailable && previewView === "rendered" ? (
            <MarkdownBody text={preview.content} />
          ) : (
            <pre>{preview.content}</pre>
          )}
        </div>
        {preview.source === "managed" ? (
          <button
            className="wb-apply"
            onClick={() =>
              staged
                ? app.unstageWorkspacePaths([preview.path])
                : app.stageWorkspacePath(preview.path)
            }
          >
            {staged ? t("Remove from message") : t("Attach to message")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <label className="files-search">
        <i className="ph ph-magnifying-glass" aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder={t("Filter files")}
          aria-label={t("Filter files")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {(workingFolders.some((folder) => folder.available && !folder.managed) || (entries?.length ?? 0) > 0) ? (
        <div className="files-tree-toolbar">
          <button className="flat" onClick={() => setExpandSignal((value) => value + 1)}>
            <i className="ph ph-arrows-out-line-vertical" aria-hidden="true" />
            {t("Expand all")}
          </button>
          <button className="flat" onClick={() => setCollapseSignal((value) => value + 1)}>
            <i className="ph ph-arrows-in-line-vertical" aria-hidden="true" />
            {t("Collapse all")}
          </button>
        </div>
      ) : null}
      {workingFolders.length > 0 ? (
        <div className="working-folders">
          <div className="files-section-title">{t("Working folders")}</div>
          {workingFolders.map((folder) => (
            <div className="working-folder-group" key={folder.id}>
              <div className="working-folder">
                <i className="ph ph-folder-open" />
                <div>
                  <div className="working-folder-role">
                    {folder.role === "primary" ? t("Main folder") : t("Additional folder")}
                    {folder.managed ? ` · ${t("conversation folder")}` : ""}
                  </div>
                  <div className="working-folder-path" data-tip={folder.path}>{folder.path}</div>
                  {folder.available && hasNativeBridge() ? (
                    <button
                      className="working-folder-open"
                      onClick={() => void revealPath(folder.path)}
                    >
                      <i className="ph ph-arrow-square-out" />
                      {t("Open folder")}
                    </button>
                  ) : null}
                  {!folder.available ? (
                    <div className="working-folder-missing">{t("Folder is not available on this device.")}</div>
                  ) : null}
                </div>
              </div>
              {folder.available && !folder.managed ? (
                <WorkingTree
                  key={`${sessionId}:${folder.id}`}
                  sessionId={sessionId!}
                  folderId={folder.id}
                  onOpenFile={openWorkingFile}
                  basePath={folder.path}
                  refreshSignal={runCount}
                  expandSignal={expandSignal}
                  collapseSignal={collapseSignal}
                  query={query}
                />
              ) : null}
            </div>
          ))}
          <div className="wb-note">
            {t("Understand/Work changes what Alt may do, not where these files are stored.")}
          </div>
        </div>
      ) : null}
      {understandMode ? (
        <div className="pv-card">
          <button
            className="wb-apply"
            disabled={!sessionId}
            onClick={() => uploadInput.current?.click()}
          >
            {sessionId ? t("Add reference") : t("Add a reference after the first message")}
          </button>
          <input
            ref={uploadInput}
            type="file"
            hidden
            accept=".txt,.md,.csv,.tsv,.json,.html,.docx,.xlsx,.pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
            }}
          />
          {uploadStatus ? <div className="wb-note">{uploadStatus}</div> : null}
        </div>
      ) : null}
      {error ? (
        <div className="rp-empty">{error}</div>
      ) : !entries ? (
        <div className="rp-empty">{t("Loading…")}</div>
      ) : entries.length === 0 ? (
        <div className="rp-empty">{t("No references or conversation-folder files.")}</div>
      ) : (
        <>
          {referenceEntries.length > 0 ? (
            <>
              <div className="files-section-title">{t("References")}</div>
              <div className="tree">
                <FileTree
                  entries={referenceEntries}
                  onOpenFile={openFile}
                  basePath={managedFolderPath}
                  dragPath={(path) => path}
                  expandSignal={expandSignal}
                  collapseSignal={collapseSignal}
                  label={t("References")}
                  filterActive={Boolean(normalizedQuery)}
                />
              </div>
            </>
          ) : null}
          {conversationFolderEntries.length > 0 ? (
            <>
              <div className="files-section-title">{t("Conversation folder")}</div>
              <div className="tree">
                <FileTree
                  entries={conversationFolderEntries}
                  onOpenFile={openFile}
                  basePath={managedFolderPath}
                  dragPath={(path) => path}
                  expandSignal={expandSignal}
                  collapseSignal={collapseSignal}
                  label={t("Conversation folder")}
                  filterActive={Boolean(normalizedQuery)}
                />
              </div>
            </>
          ) : null}
        </>
      )}
    </>
  );
}

function WorkingTree({
  sessionId,
  folderId,
  onOpenFile,
  basePath,
  refreshSignal,
  expandSignal,
  collapseSignal,
  query,
}: {
  sessionId: string;
  folderId: string;
  onOpenFile: (entry: WorkingTreeEntry) => void;
  basePath: string;
  refreshSignal: number;
  expandSignal: number;
  collapseSignal: number;
  query: string;
}) {
  const [childrenByPath, setChildrenByPath] = useState(
    () => new Map<string, WorkingTreeEntry[]>(),
  );
  const [resolvedExpandSignal, setResolvedExpandSignal] = useState(0);
  const [searchResult, setSearchResult] = useState<WorkingTreeEntry[] | null>(null);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const childrenRef = useRef(childrenByPath);
  const loadingPaths = useRef(new Set<string>());
  const previousRefreshSignal = useRef(refreshSignal);
  const previousExpandSignal = useRef(expandSignal);
  childrenRef.current = childrenByPath;

  const loadDirectory = useCallback(async (path: string, force = false) => {
    const existing = childrenRef.current.get(path);
    if (!force && existing) return existing;
    if (loadingPaths.current.has(path)) return existing ?? [];
    loadingPaths.current.add(path);
    try {
      const response = await listWorkingDirectory(sessionId, folderId, path);
      setChildrenByPath((current) => {
        const next = new Map(current);
        const survivingDirectories = new Set(
          response.entries
            .filter((entry) => entry.isDirectory)
            .map((entry) => entry.path),
        );
        for (const oldEntry of current.get(path) ?? []) {
          if (!oldEntry.isDirectory || survivingDirectories.has(oldEntry.path)) continue;
          for (const cachedPath of next.keys()) {
            if (
              cachedPath === oldEntry.path ||
              cachedPath.startsWith(`${oldEntry.path}/`)
            ) {
              next.delete(cachedPath);
            }
          }
        }
        next.set(path, response.entries);
        return next;
      });
      return response.entries;
    } finally {
      loadingPaths.current.delete(path);
    }
  }, [folderId, sessionId]);

  useEffect(() => {
    setChildrenByPath(new Map());
    loadingPaths.current.clear();
    void loadDirectory("", true);
  }, [loadDirectory]);

  useEffect(() => {
    const search = query.trim();
    if (!search) {
      setSearchResult(null);
      setSearchTruncated(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchWorkingDirectory(sessionId, folderId, search).then((response) => {
        if (cancelled) return;
        setSearchResult(response.entries);
        setSearchTruncated(Boolean(response.truncated));
      }).catch(() => {
        if (!cancelled) setSearchResult([]);
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [folderId, query, sessionId]);

  useEffect(() => {
    if (refreshSignal === previousRefreshSignal.current) return;
    previousRefreshSignal.current = refreshSignal;
    const loadedPaths = [...childrenRef.current.keys()];
    void Promise.all(
      (loadedPaths.length ? loadedPaths : [""]).map((path) =>
        loadDirectory(path, true),
      ),
    );
  }, [loadDirectory, refreshSignal]);

  useEffect(() => {
    if (expandSignal === previousExpandSignal.current) return;
    previousExpandSignal.current = expandSignal;
    let cancelled = false;
    const loadAll = async (path: string): Promise<void> => {
      const children = await loadDirectory(path);
      for (const child of children) {
        if (cancelled) return;
        if (child.isDirectory) await loadAll(child.path);
      }
    };
    void loadAll("").then(() => {
      if (!cancelled) setResolvedExpandSignal((value) => value + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [expandSignal, loadDirectory]);

  const entries = useMemo(
    () => query.trim() ? (searchResult ?? []) : [...childrenByPath.values()].flat(),
    [childrenByPath, query, searchResult],
  );
  if (query.trim() && searchResult === null) {
    return <div className="wb-note">{t("Searching files…")}</div>;
  }
  if (entries.length === 0) return query.trim()
    ? <div className="wb-note">{t("No matching files.")}</div>
    : null;
  return (
    <div className="working-tree">
      <FileTree
        entries={entries}
        onOpenFile={onOpenFile}
        canOpen={(entry) => !entry.isDirectory && entry.previewable}
        onExpandFolder={(entry) => void loadDirectory(entry.path)}
        initiallyExpanded={false}
        expandNewFolders={false}
        basePath={basePath}
        dragPath={(path) => `${basePath.replace(/[\\/]+$/, "")}/${path}`}
        expandSignal={resolvedExpandSignal}
        collapseSignal={collapseSignal}
        label={basePath}
        filterActive={Boolean(query.trim())}
      />
      {searchTruncated ? <div className="wb-note">{t("Showing the first 200 matches.")}</div> : null}
    </div>
  );
}

function FileTree<T extends { path: string; isDirectory?: boolean }>({
  entries,
  onOpenFile,
  basePath,
  canOpen = () => true,
  onExpandFolder,
  initiallyExpanded = true,
  expandNewFolders = true,
  dragPath,
  expandSignal,
  collapseSignal,
  label,
  filterActive = false,
}: {
  entries: T[];
  onOpenFile: (entry: T) => void;
  basePath: string;
  canOpen?: (entry: T) => boolean;
  onExpandFolder?: (entry: T) => void;
  initiallyExpanded?: boolean;
  expandNewFolders?: boolean;
  dragPath?: (treePath: string) => string;
  expandSignal: number;
  collapseSignal: number;
  label: string;
  filterActive?: boolean;
}) {
  const menu = useContextMenu();
  const model = useMemo(() => buildFileTreeModel(entries, basePath), [basePath, entries]);
  const [expandedItems, setExpandedItems] = useState(
    initiallyExpanded ? model.folderIds : [],
  );
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const seenFolderIds = useRef(new Set(model.folderIds));
  const previousExpandSignal = useRef(expandSignal);
  const previousCollapseSignal = useRef(collapseSignal);
  const requestedFolderIds = useRef(new Set<string>());
  const expansionBeforeFilter = useRef<string[] | null>(null);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tree = useTree<FileTreeNode<T>>({
    rootItemId: model.rootId,
    state: { expandedItems },
    setExpandedItems,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().isFolder,
    dataLoader: {
      getItem: (itemId) => model.nodes.get(itemId)!,
      getChildren: (itemId) => model.nodes.get(itemId)?.children ?? [],
    },
    onPrimaryAction: (item) => {
      const entry = item.getItemData().entry;
      if (entry && canOpen(entry)) onOpenFile(entry);
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature, expandAllFeature],
  });

  useEffect(() => {
    const nextFolderIds = new Set(model.folderIds);
    setExpandedItems((current) => [
      ...current.filter((id) => nextFolderIds.has(id)),
      ...(expandNewFolders
        ? model.folderIds.filter((id) => !seenFolderIds.current.has(id))
        : []),
    ]);
    seenFolderIds.current = nextFolderIds;
    tree.rebuildTree();
  }, [expandNewFolders, model, tree]);

  useEffect(() => {
    if (filterActive) {
      if (!expansionBeforeFilter.current) expansionBeforeFilter.current = expandedItems;
      setExpandedItems(model.folderIds);
    } else if (expansionBeforeFilter.current) {
      setExpandedItems(expansionBeforeFilter.current);
      expansionBeforeFilter.current = null;
    }
  }, [filterActive, model]);

  useEffect(() => {
    if (!onExpandFolder) return;
    for (const id of expandedItems) {
      if (requestedFolderIds.current.has(id)) continue;
      const entry = model.nodes.get(id)?.entry;
      if (entry?.isDirectory) {
        requestedFolderIds.current.add(id);
        onExpandFolder(entry);
      }
    }
  }, [expandedItems, model, onExpandFolder]);

  useEffect(() => {
    if (expandSignal === previousExpandSignal.current) return;
    previousExpandSignal.current = expandSignal;
    void tree.expandAll();
  }, [expandSignal, tree]);

  useEffect(() => {
    if (collapseSignal === previousCollapseSignal.current) return;
    previousCollapseSignal.current = collapseSignal;
    tree.collapseAll();
  }, [collapseSignal, tree]);

  useEffect(() => () => {
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
  }, []);

  return (
    <div {...tree.getContainerProps(label)}>
      {tree.getItems().map((item) => {
        const node = getFileTreeNode(model, item.getId());
        if (!node) return null;
        const isFolder = item.isFolder();
        const canOpenItem = node.isFolder || !node.entry || canOpen(node.entry);
        const pathWasCopied = copiedPath === node.fullPath;
        const copyLabel = t(pathWasCopied ? "Path copied" : "Copy path");
        const contextItems: ContextMenuItem[] = [
          { label: t("Copy path"), icon: "ph-copy", onSelect: () => void copyText(node.fullPath) },
          ...(hasNativeBridge() ? [{ label: t("Show in file manager"), icon: "ph-folder-open", onSelect: () => void revealPath(node.fullPath) }] : []),
        ];
        return (
          <div
            {...item.getProps()}
            key={item.getKey()}
            className="ti"
            style={{ paddingLeft: 8 + item.getItemMeta().level * 20 }}
            aria-disabled={!canOpenItem || undefined}
            data-tip={!canOpenItem ? "Too large to preview" : node.fullPath}
            draggable={Boolean(dragPath)}
            onDragStart={dragPath ? (event) => {
              event.dataTransfer.setData(WORKSPACE_PATH_MIME, dragPath(node.path));
              event.dataTransfer.effectAllowed = "copy";
            } : undefined}
            onContextMenu={(event) => menu.open(event, contextItems)}
          >
            {isFolder ? (
              <i className={`ph ph-caret-down tree-caret${item.isExpanded() ? "" : " closed"}`} />
            ) : (
              <i className="tree-caret-placeholder" />
            )}
            <i className={isFolder
              ? `ph ${item.isExpanded() ? "ph-folder-open" : "ph-folder"}`
              : "ph ph-file-text"}
            />
            <span>{node.name}</span>
            <button
              className={`tree-copy${pathWasCopied ? " copied" : ""}`}
              data-tip={copyLabel}
              aria-label={`${copyLabel}: ${node.fullPath}`}
              onClick={(event) => {
                event.stopPropagation();
                void copyText(node.fullPath).then((copied) => {
                  if (!copied) return;
                  setCopiedPath(node.fullPath);
                  if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
                  copyResetTimer.current = setTimeout(() => setCopiedPath(null), 1800);
                });
              }}
            >
              <i className="ph ph-copy" aria-hidden="true" />
            </button>
          </div>
        );
      })}
      {menu.element}
    </div>
  );
}
