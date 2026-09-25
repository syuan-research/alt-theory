import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  expandAllFeature,
  hotkeysCoreFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import type { WorkingFolderDescriptor, WorkingTreeEntry, WorkspaceFileEntry } from "@/api/types";
import {
  listWorkingDirectory,
  listWorkingFolders,
  listWorkspaceFiles,
  searchWorkingDirectory,
} from "@/api/session-files";
import { t } from "@/i18n";
import { useConversationContext } from "@/context/ConversationContext";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { hasNativeBridge, revealPath as nativeRevealPath } from "@/lib/native";
import { NEW_DRAFT, stageInDraft, unstageInDraft, useDraft } from "@/lib/draft";
import { WORKSPACE_PATH_MIME } from "@/lib/workspace";
import { FilePreview } from "@/components/inspector/FilePreview";
import { FolderHead, ListTools } from "@/components/inspector/FolderList";
import { buildFileTreeModel, getFileTreeNode, withFolderEntries, type FileTreeNode } from "@/lib/fileTree";
import type { PreviewMode } from "@/lib/fileContent";
import { guardLeave } from "@/lib/fileEditGuard";
import { usePaneMemory } from "@/lib/paneMemory";
import { useFindTarget } from "@/lib/find";
import { copyText } from "@/lib/clipboard";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import { fileQueryScore, parseFileQuery } from "../../../../shared/quick-find";

type ManagedTreeEntry = WorkspaceFileEntry | { path: string; isDirectory: true };

export function WorkspaceTree() {
  const app = useApp();
  const conv = useConversationContext();
  const shell = useShell();
  const [entries, setEntries] = useState<WorkspaceFileEntry[] | null>(null);
  const [workingFolders, setWorkingFolders] = useState<WorkingFolderDescriptor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandSignal, setExpandSignal] = useState(0);
  const [collapseSignal, setCollapseSignal] = useState(0);
  // Ctrl+F on the tree focuses the existing filter (an open file registers
  // its own preview instead).
  const filterRef = useRef<HTMLDivElement>(null);
  useFindTarget(filterRef, {
    focus: () => {
      const input = filterRef.current?.querySelector("input");
      input?.focus();
      input?.select();
    },
  });

  const sessionId = conv.sessionId;
  const runCount = conv.runSettledCount;
  // View state that outlives the pane (the tree unmounts on every collapse
  // or rail switch): the open file is the view's file target — drawn against
  // the conversation it belongs to, even after the center moved on; the view
  // mode and filter live in pane memory.
  const fileTarget = shell.target?.kind === "file" ? shell.target : null;
  const owner = fileTarget?.sessionId ?? sessionId;
  const ownerAttachments = useDraft(owner ?? NEW_DRAFT).draft.attachments;
  const [previewView, setPreviewView] = usePaneMemory<PreviewMode>(`${owner}:files:mode`, "rendered");
  const [query, setQuery] = usePaneMemory(`${sessionId}:files:query`, "");
  const [browsing, setBrowsing] = usePaneMemory<{ folderId: string; path: string } | null>(`${sessionId}:files:browsing`, null);
  const resultScroll = useRef({ outer: 0, inner: 0, folderId: "" });
  const [closedFolders, setClosedFolders] = usePaneMemory<string[]>(`${sessionId}:files:closedFolders`, []);
  const folderClosed = (id: string) => (!query.trim() || browsing !== null) && closedFolders.includes(id);
  const toggleFolder = (id: string) =>
    setClosedFolders((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));

  // Draft pane: before the first message there is no session to read folders
  // from, so show the ones this conversation will get — the picker's folder,
  // its project's companions, and the global list — the same rows the
  // materialized record will produce. ponytail: availability is pick-time
  // and settings-time, not re-checked while the pane sits open; live
  // re-checking arrives with the session's own fetch.
  const draftFolders = useMemo<WorkingFolderDescriptor[]>(() => {
    if (sessionId || !conv.workspacePrimaryDir) return [];
    const dir = conv.workspacePrimaryDir;
    const project = app.projects.find(
      (entry) => entry.primaryDir.toLowerCase() === dir.toLowerCase(),
    );
    return [
      { id: "primary", path: dir, role: "primary", managed: false, available: true },
      ...(project?.secondaryDirs ?? []).map((path, index) => ({
        id: `secondary-${index + 1}`,
        path,
        role: "secondary" as const,
        managed: false,
        available: project?.available !== false,
      })),
      ...app.globalFolders.map((folder, index) => ({
        id: `global-${index + 1}`,
        path: folder.path,
        role: "global" as const,
        managed: false,
        available: true,
      })),
    ];
  }, [sessionId, conv.workspacePrimaryDir, app.projects, app.globalFolders]);
  const folders = sessionId ? workingFolders : draftFolders;

  useEffect(() => {
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
    const target = shell.workspaceRevealPath;
    if (!target) return;
    setQuery(target.split(/[\\/]/).filter(Boolean).at(-1) ?? target);
    shell.clearWorkspaceRevealPath();
  }, [shell.workspaceRevealPath, shell.clearWorkspaceRevealPath, setQuery]);

  const normalizedQuery = browsing ? "" : query.trim();
  const fileQuery = parseFileQuery(normalizedQuery);
  const managedFolderPath = workingFolders.find((folder) => folder.managed)?.path ?? "";
  const filterEntries = (items: WorkspaceFileEntry[]): ManagedTreeEntry[] =>
    normalizedQuery
      ? withFolderEntries(items).map((entry) => ({ entry, score: fileQueryScore(
          fileQuery,
          entry.path.split(/[\\/]/).at(-1) ?? "",
          `${managedFolderPath}/${entry.path}`,
        ) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path))
          .map(({ entry }) => entry)
      : items;


  const referenceEntries = useMemo(
    () => filterEntries((entries ?? []).filter((entry) => /^(uploads|extracted)\//.test(entry.path))),
    [entries, normalizedQuery, managedFolderPath]
  );
  const conversationFolderEntries = useMemo(
    () => filterEntries((entries ?? []).filter((entry) => !/^(uploads|extracted)\//.test(entry.path))),
    [entries, normalizedQuery, managedFolderPath]
  );
  const openFolderResult = (folderId: string, path: string) => {
    const group = [...(filterRef.current?.closest(".body")?.querySelectorAll<HTMLElement>("[data-folder-id]") ?? [])]
      .find((element) => element.dataset.folderId === folderId);
    resultScroll.current = {
      outer: filterRef.current?.closest(".body")?.scrollTop ?? 0,
      inner: group?.querySelector<HTMLElement>(".working-tree")?.scrollTop ?? 0,
      folderId,
    };
    setClosedFolders((current) => current.filter((id) => id !== folderId));
    setBrowsing({ folderId, path });
  };
  const backToResults = () => {
    setBrowsing(null);
    requestAnimationFrame(() => {
      const body = filterRef.current?.closest(".body");
      filterRef.current?.querySelector("input")?.focus({ preventScroll: true });
      if (body) body.scrollTop = resultScroll.current.outer;
      const group = [...(body?.querySelectorAll<HTMLElement>("[data-folder-id]") ?? [])]
        .find((element) => element.dataset.folderId === resultScroll.current.folderId);
      const tree = group?.querySelector<HTMLElement>(".working-tree");
      if (tree) tree.scrollTop = resultScroll.current.inner;
    });
  };
  const clearSearch = () => { setQuery(""); setBrowsing(null); };

  // Opening another file is a leave from a dirty editor: the guard bounces
  // the first attempt into the red bar and saves-and-proceeds on the next
  // (owner ruling 2026-09-15).
  const openFile = (entry: ManagedTreeEntry) => {
    if ("isDirectory" in entry && entry.isDirectory) return;
    if (!sessionId || !("kind" in entry) || entry.kind === "binary-original") return;
    setPreviewView("rendered");
    void guardLeave(() => shell.openTarget({ kind: "file", sessionId, root: "workspace", path: entry.path }));
  };

  const openWorkingFile = (entry: WorkingTreeEntry) => {
    if (!sessionId || !entry.previewable) return;
    setPreviewView("rendered");
    void guardLeave(() =>
      shell.openTarget({ kind: "file", sessionId, root: "working", path: `${entry.folderId}/${entry.path}` }),
    );
  };


  if (fileTarget) {
    // Attaching goes to the message of the conversation the file belongs to.
    const staged = ownerAttachments.includes(fileTarget.path);
    return (
      <FilePreview
        sessionId={fileTarget.sessionId}
        path={fileTarget.path}
        fileRef={{ root: fileTarget.root, path: fileTarget.path }}
        mode={previewView}
        onModeChange={setPreviewView}
        onSaved={(saved) => {
          // A conflict copy saved to a sibling: follow it there.
          if (saved.path === fileTarget.path) return;
          shell.openTarget({ ...fileTarget, path: saved.path });
        }}
        footer={
          fileTarget.root === "workspace" ? (
            <button
              className="wb-apply"
              onClick={() =>
                staged
                  ? unstageInDraft(fileTarget.sessionId, [fileTarget.path])
                  : stageInDraft(fileTarget.sessionId, [fileTarget.path])
              }
            >
              {staged ? t("Remove from message") : t("Attach to message")}
            </button>
          ) : null
        }
      />
    );
  }

  return (
    <div onKeyDown={(event) => {
      if (event.key !== "Escape" || event.nativeEvent.isComposing || !query.trim()) return;
      event.preventDefault();
      event.stopPropagation();
      if (browsing) backToResults(); else clearSearch();
    }}>
      <ListTools
        filterRef={filterRef}
        query={query}
        onQuery={(value) => { setBrowsing(null); setQuery(value); }}
        onEscape={browsing ? backToResults : clearSearch}
        onBack={browsing ? backToResults : undefined}
        onClear={clearSearch}
        placeholder={t("Filter files")}
        {...(workingFolders.some((folder) => folder.available && !folder.managed) || (entries?.length ?? 0) > 0
          ? {
              onExpandAll: () => {
                setClosedFolders([]);
                setExpandSignal((value) => value + 1);
              },
              onCollapseAll: () => {
                setClosedFolders(folders.map((folder) => folder.id));
                setCollapseSignal((value) => value + 1);
              },
            }
          : {})}
      />
      {folders.length > 0 ? (
        <div className="working-folders">
          {folders.map((folder) => (
            <div className="working-folder-group" key={folder.id} data-folder-id={folder.id}>
              <FolderHead
                path={folder.path}
                role={`${folder.role === "primary"
                  ? t("Main folder")
                  : folder.role === "global"
                    ? t("Global folder")
                    : t("Companion folder")}${folder.managed ? ` · ${t("conversation folder")}` : ""}`}
                available={folder.available}
                closed={folderClosed(folder.id)}
                onToggle={folder.available && !folder.managed && sessionId ? () => toggleFolder(folder.id) : undefined}
              />
              {!folder.available ? (
                <div className="working-folder-missing">{t("Folder is not available on this device.")}</div>
              ) : null}
              {folder.available && !folder.managed && sessionId ? (
                // Folded with `hidden`, not unmounted: the loaded levels and
                // expansion stay. A filter shows matches even when folded.
                <div hidden={folderClosed(folder.id)}>
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
                  browseMode={browsing !== null}
                  browsePath={browsing?.folderId === folder.id ? browsing.path : undefined}
                  onOpenFolder={(path) => openFolderResult(folder.id, path)}
                  memoryKey={`${sessionId}:files:${folder.id}`}
                />
                </div>
              ) : null}
            </div>
          ))}
          <div className="wb-note">
            {t("The permission changes what Alt may do, not where these files are stored.")}
          </div>
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
                  onOpenFolder={(entry) => openFolderResult("references", entry.path)}
                  revealPath={browsing?.folderId === "references" ? browsing.path : undefined}
                  memoryKey={`${sessionId}:files:references`}
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
                  onOpenFolder={(entry) => openFolderResult("conversation", entry.path)}
                  revealPath={browsing?.folderId === "conversation" ? browsing.path : undefined}
                  memoryKey={`${sessionId}:files:conversation`}
                />
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
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
  browseMode,
  browsePath,
  onOpenFolder,
  memoryKey,
}: {
  sessionId: string;
  folderId: string;
  onOpenFile: (entry: WorkingTreeEntry) => void;
  basePath: string;
  refreshSignal: number;
  expandSignal: number;
  collapseSignal: number;
  query: string;
  browseMode: boolean;
  browsePath?: string;
  onOpenFolder: (path: string) => void;
  memoryKey: string;
}) {
  const [childrenByPath, setChildrenByPath] = useState(
    () => new Map<string, WorkingTreeEntry[]>(),
  );
  const [resolvedExpandSignal, setResolvedExpandSignal] = useState(0);
  const [searchResult, setSearchResult] = useState<{ query: string; entries: WorkingTreeEntry[]; truncated: boolean } | null>(null);
  const searchToken = useRef<string | null>(null);
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
      searchToken.current = null;
      return;
    }
    if (browseMode) return;
    // One token per search: refining the query reuses the server's walk.
    searchToken.current ??= `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchWorkingDirectory(sessionId, folderId, search, {
        searchToken: searchToken.current!,
        signal: controller.signal,
      }).then((response) => {
        setSearchResult({ query: search, entries: response.entries, truncated: Boolean(response.truncated) });
      }).catch(() => {
        if (!controller.signal.aborted) setSearchResult({ query: search, entries: [], truncated: false });
      });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [browseMode, folderId, query, sessionId]);

  useEffect(() => {
    if (browsePath === undefined) return;
    let cancelled = false;
    const reveal = async () => {
      const parts = browsePath.split("/").filter(Boolean);
      for (let i = 0; i < parts.length && !cancelled; i += 1) {
        await loadDirectory(parts.slice(0, i).join("/"));
      }
    };
    void reveal();
    return () => { cancelled = true; };
  }, [browsePath, loadDirectory]);

  useEffect(() => {
    if (refreshSignal === previousRefreshSignal.current) return;
    previousRefreshSignal.current = refreshSignal;
    searchToken.current = null; // files changed: the next search walks again
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

  const searching = Boolean(query.trim() && !browseMode);
  const activeResult = searchResult?.query === query.trim() ? searchResult : null;
  const entries = useMemo(
    () => searching ? (activeResult?.entries ?? []) : [...childrenByPath.values()].flat(),
    [childrenByPath, searching, activeResult],
  );
  if (searching && activeResult === null) {
    return <div className="wb-note">{t("Searching files…")}</div>;
  }
  if (entries.length === 0) return searching
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
        filterActive={searching}
        onOpenFolder={(entry) => onOpenFolder(entry.path)}
        revealPath={browsePath}
        memoryKey={memoryKey}
      />
      {searching && activeResult?.truncated ? <div className="wb-note">{t("Showing the most relevant matches. Refine your search for more.")}</div> : null}
    </div>
  );
}

function FileTree<T extends { path: string; isDirectory?: boolean }>({
  entries,
  onOpenFile,
  basePath,
  canOpen = () => true,
  onExpandFolder,
  onOpenFolder,
  initiallyExpanded = true,
  expandNewFolders = true,
  dragPath,
  expandSignal,
  collapseSignal,
  label,
  filterActive = false,
  revealPath,
  memoryKey,
}: {
  entries: T[];
  onOpenFile: (entry: T) => void;
  basePath: string;
  canOpen?: (entry: T) => boolean;
  onExpandFolder?: (entry: T) => void;
  onOpenFolder?: (entry: T) => void;
  initiallyExpanded?: boolean;
  expandNewFolders?: boolean;
  dragPath?: (treePath: string) => string;
  expandSignal: number;
  collapseSignal: number;
  label: string;
  filterActive?: boolean;
  revealPath?: string;
  /** Pane-memory key: which folders were open survives a remount. */
  memoryKey: string;
}) {
  const menu = useContextMenu();
  const model = useMemo(() => buildFileTreeModel(entries, basePath, filterActive), [basePath, entries, filterActive]);
  const [expandedItems, setExpandedItems] = usePaneMemory<string[]>(
    `${memoryKey}:expanded`,
    () => (initiallyExpanded ? model.folderIds : []),
  );
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const seenFolderIds = useRef(new Set(model.folderIds));
  const previousExpandSignal = useRef(expandSignal);
  const previousCollapseSignal = useRef(collapseSignal);
  const requestedFolderIds = useRef(new Set<string>());
  const expansionBeforeFilter = useRef<string[] | null>(null);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastReveal = useRef("");
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
      if (!entry) return;
      if (filterActive && entry.isDirectory && onOpenFolder) onOpenFolder(entry);
      else if (!entry.isDirectory && canOpen(entry)) onOpenFile(entry);
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

  useEffect(() => {
    if (!revealPath) { lastReveal.current = ""; return; }
    const target = model.nodes.get(`node:${revealPath}`);
    if (!target || lastReveal.current === revealPath) return;
    lastReveal.current = revealPath;
    const parts = revealPath.split("/");
    setExpandedItems((current) => [...new Set([
      ...current,
      ...parts.map((_, index) => `node:${parts.slice(0, index + 1).join("/")}`),
    ])]);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const row = [...(containerRef.current?.querySelectorAll<HTMLElement>("[data-tree-path]") ?? [])]
        .find((element) => element.dataset.treePath === revealPath);
      row?.scrollIntoView({ block: "center" });
      row?.focus({ preventScroll: true });
    }));
  }, [model, revealPath, setExpandedItems]);

  useEffect(() => () => {
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
  }, []);

  return (
    <div ref={containerRef}><div {...tree.getContainerProps(label)}>
      {tree.getItems().map((item) => {
        const node = getFileTreeNode(model, item.getId());
        if (!node) return null;
        const isFolder = item.isFolder();
        const canOpenItem = node.isFolder || !node.entry || canOpen(node.entry);
        const pathWasCopied = copiedPath === node.fullPath;
        const copyLabel = t(pathWasCopied ? "Path copied" : "Copy path");
        const contextItems: ContextMenuItem[] = [
          { label: t("Copy path"), icon: "ph-copy", onSelect: () => void copyText(node.fullPath) },
          ...(hasNativeBridge() ? [{ label: t("Show in file manager"), icon: "ph-folder-open", onSelect: () => void nativeRevealPath(node.fullPath) }] : []),
        ];
        return (
          <div
            {...item.getProps()}
            key={item.getKey()}
            className="ti"
            data-tree-path={node.path}
            onClickCapture={filterActive && node.entry?.isDirectory && onOpenFolder ? (event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              event.preventDefault();
              event.stopPropagation();
              onOpenFolder(node.entry!);
            } : undefined}
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
    </div></div>
  );
}
