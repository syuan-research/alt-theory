import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkingFileEntry, WorkingFolderDescriptor, WorkspaceFileEntry } from "@/api/types";
import {
  getSessionFileContent,
  listWorkspaceFiles,
  listWorkingFiles,
  uploadWorkspaceFile,
} from "@/api/session-files";
import { t } from "@/i18n";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { hasNativeBridge, revealPath } from "@/lib/native";
import { stagePathAfterUpload } from "@/lib/workspace";
import { MarkdownBody } from "@/components/conversation/MarkdownBody";

interface TreeNode<T> {
  name: string;
  path: string;
  children: Map<string, TreeNode<T>>;
  entry?: T;
}

function buildTree<T extends { path: string }>(entries: T[]): TreeNode<T> {
  const root: TreeNode<T> = { name: "", path: "", children: new Map() };
  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, i) => {
      let child = node.children.get(part);
      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          children: new Map(),
        };
        node.children.set(part, child);
      }
      if (i === parts.length - 1) child.entry = entry;
      node = child;
    });
  }
  return root;
}

export function WorkspaceTree() {
  const app = useApp();
  const shell = useShell();
  const [entries, setEntries] = useState<WorkspaceFileEntry[] | null>(null);
  const [workingFolders, setWorkingFolders] = useState<WorkingFolderDescriptor[]>([]);
  const [workingFiles, setWorkingFiles] = useState<WorkingFileEntry[]>([]);
  const [workingTruncated, setWorkingTruncated] = useState(false);
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
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);

  const sessionId = app.sessionId;
  const runCount = app.runCompletedCount;
  const pureMode = sessionId ? app.sessionMode === "pure" : shell.newMode === "pure";

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
          void listWorkingFiles(sessionId).then((working) => {
            if (cancelled) return;
            setWorkingFolders(working.folders);
            setWorkingFiles(working.files);
            setWorkingTruncated(working.truncated);
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
  }, [sessionId]);

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
    () => (entries ?? []).filter((entry) => /^(uploads|extracted)\//.test(entry.path)),
    [entries]
  );
  const conversationFolderEntries = useMemo(
    () => (entries ?? []).filter((entry) => !/^(uploads|extracted)\//.test(entry.path)),
    [entries]
  );
  const referenceTree = useMemo(() => buildTree(referenceEntries), [referenceEntries]);
  const conversationFolderTree = useMemo(
    () => buildTree(conversationFolderEntries),
    [conversationFolderEntries]
  );

  const openFile = async (entry: WorkspaceFileEntry) => {
    if (!sessionId || entry.kind === "binary-original") return;
    try {
      const res = await getSessionFileContent(sessionId, "workspace", entry.path);
      setPreviewView("rendered");
      setPreviewExpanded(false);
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

  const openWorkingFile = async (entry: WorkingFileEntry) => {
    if (!sessionId || !entry.previewable) return;
    const path = `${entry.folderId}/${entry.path}`;
    try {
      const res = await getSessionFileContent(sessionId, "working", path);
      setPreviewView("rendered");
      setPreviewExpanded(false);
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
        <div className={`pv-card change-preview-body${previewExpanded ? " expanded" : ""}`}>
          {renderedAvailable && previewView === "rendered" ? (
            <MarkdownBody text={preview.content} />
          ) : (
            <pre>{preview.content}</pre>
          )}
        </div>
        {preview.content.split("\n").length > 10 || preview.content.length > 1200 ? (
          <button
            className="flat change-preview-more"
            onClick={() => setPreviewExpanded((open) => !open)}
          >
            {previewExpanded ? t("Show less") : t("Show full file")}
          </button>
        ) : null}
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
      {workingFolders.length > 0 ? (
        <div className="working-folders">
          <div className="files-section-title">{t("Working folders")}</div>
          {workingFolders.map((folder) => (
            <div key={folder.id}>
              <div className="working-folder">
                <i className="ph ph-folder-open" />
                <div>
                  <div className="working-folder-role">
                    {folder.role === "primary" ? t("Main folder") : t("Additional folder")}
                    {folder.managed ? ` · ${t("conversation folder")}` : ""}
                  </div>
                  <div className="working-folder-path" title={folder.path}>{folder.path}</div>
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
                  entries={workingFiles.filter((entry) => entry.folderId === folder.id)}
                  onOpenFile={openWorkingFile}
                />
              ) : null}
            </div>
          ))}
          {workingTruncated ? (
            <div className="wb-note">{t("Showing the first 1,000 files; large dependency and hidden folders are omitted.")}</div>
          ) : null}
          <div className="wb-note">
            {t("Understand/Work changes what Alt may do, not where these files are stored.")}
          </div>
        </div>
      ) : null}
      {pureMode ? (
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
                <TreeLevel node={referenceTree} depth={0} onOpenFile={openFile} />
              </div>
            </>
          ) : null}
          {conversationFolderEntries.length > 0 ? (
            <>
              <div className="files-section-title">{t("Conversation folder")}</div>
              <div className="tree">
                <TreeLevel node={conversationFolderTree} depth={0} onOpenFile={openFile} />
              </div>
            </>
          ) : null}
        </>
      )}
    </>
  );
}

function WorkingTree({
  entries,
  onOpenFile,
}: {
  entries: WorkingFileEntry[];
  onOpenFile: (entry: WorkingFileEntry) => void;
}) {
  if (entries.length === 0) return null;
  const tree = buildTree(entries);
  return (
    <div className="working-tree">
      <TreeLevel
        node={tree}
        depth={0}
        onOpenFile={onOpenFile}
        canOpen={(entry) => entry.previewable}
      />
    </div>
  );
}

function TreeLevel<T extends { path: string }>({
  node,
  depth,
  onOpenFile,
  canOpen = () => true,
}: {
  node: TreeNode<T>;
  depth: number;
  onOpenFile: (entry: T) => void;
  canOpen?: (entry: T) => boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const children = [...node.children.values()].sort((a, b) => {
    const aDir = a.children.size > 0 ? 0 : 1;
    const bDir = b.children.size > 0 ? 0 : 1;
    if (aDir !== bDir) return aDir - bDir;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {children.map((child) => {
        const isFolder = child.children.size > 0;
        const isCollapsed = isFolder && collapsed.has(child.path);
        return (
          <div key={child.path}>
            <button
              className={`ti${depth ? " indent" : ""}`}
              style={depth > 1 ? { paddingLeft: 8 + depth * 20 } : undefined}
              disabled={!isFolder && !!child.entry && !canOpen(child.entry)}
              title={
                !isFolder && child.entry && !canOpen(child.entry)
                  ? "Too large to preview"
                  : child.path
              }
              aria-expanded={isFolder ? !isCollapsed : undefined}
              onClick={() => {
                if (isFolder) {
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(child.path)) next.delete(child.path);
                    else next.add(child.path);
                    return next;
                  });
                } else if (child.entry) {
                  onOpenFile(child.entry);
                }
              }}
            >
              {isFolder ? (
                <i
                  className={`ph ph-caret-down tree-caret${isCollapsed ? " closed" : ""}`}
                />
              ) : (
                <i className="tree-caret-placeholder" />
              )}
              <i
                className={
                  isFolder
                    ? `ph ${isCollapsed ? "ph-folder" : "ph-folder-open"}`
                    : "ph ph-file-text"
                }
              />
              <span>{child.name}</span>
            </button>
            {isFolder && !isCollapsed ? (
              <TreeLevel
                node={child}
                depth={depth + 1}
                onOpenFile={onOpenFile}
                canOpen={canOpen}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}
