import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkingFileEntry, WorkingFolderDescriptor, WorkspaceFileEntry } from "@/api/types";
import {
  getSessionFileContent,
  listWorkspaceFiles,
  listWorkingFiles,
  uploadWorkspaceFile,
} from "@/api/session-files";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { stagePathAfterUpload } from "@/lib/workspace";

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  entry?: WorkspaceFileEntry;
}

function buildTree(entries: WorkspaceFileEntry[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map() };
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

  const tree = useMemo(() => buildTree(entries ?? []), [entries]);

  const openFile = async (entry: WorkspaceFileEntry) => {
    if (!sessionId || entry.kind === "binary-original") return;
    try {
      const res = await getSessionFileContent(sessionId, "workspace", entry.path);
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
    return (
      <div className="preview">
        <div className="pv-card">
          <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "var(--mono)", fontSize: "0.8rem" }}>
            {preview.content}
          </pre>
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
            {staged ? "Remove from message" : "Attach to message"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {workingFolders.length > 0 ? (
        <div className="working-folders">
          <div className="files-section-title">Working folders</div>
          {workingFolders.map((folder) => (
            <div key={folder.id}>
              <div className="working-folder">
                <i className="ph ph-folder-open" />
                <div>
                  <div className="working-folder-role">
                    {folder.role === "primary" ? "Primary" : "Additional"}
                    {folder.managed ? " · managed by Alt Theory" : ""}
                  </div>
                  <div className="working-folder-path" title={folder.path}>{folder.path}</div>
                  {!folder.available ? (
                    <div className="working-folder-missing">Folder is not available on this device.</div>
                  ) : null}
                </div>
              </div>
              {folder.available ? (
                <WorkingTree
                  entries={workingFiles.filter((entry) => entry.folderId === folder.id)}
                  onOpenFile={openWorkingFile}
                />
              ) : null}
            </div>
          ))}
          {workingTruncated ? (
            <div className="wb-note">Showing the first 1,000 files; large dependency and hidden folders are omitted.</div>
          ) : null}
          <div className="wb-note">
            Switching Understand/Work changes capabilities, not these folder locations.
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
            {sessionId ? "Import reference" : "Import after the first message"}
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
        <div className="rp-empty">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="rp-empty">
          {pureMode ? "No imported references." : "No files available."}
        </div>
      ) : (
        <>
          <div className="files-section-title">Imported references and managed files</div>
          <div className="tree">
            <TreeLevel node={tree} depth={0} onOpenFile={openFile} />
          </div>
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
  return (
    <div className="working-tree">
      {entries.map((entry) => (
        <button
          key={`${entry.folderId}:${entry.path}`}
          className="ti"
          disabled={!entry.previewable}
          title={entry.previewable ? entry.path : "Too large to preview"}
          onClick={() => onOpenFile(entry)}
        >
          <i className="ph ph-file" />
          <span>{entry.path}</span>
        </button>
      ))}
    </div>
  );
}

function TreeLevel({
  node,
  depth,
  onOpenFile,
}: {
  node: TreeNode;
  depth: number;
  onOpenFile: (entry: WorkspaceFileEntry) => void;
}) {
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
        return (
          <div key={child.path}>
            <button
              className={`ti${depth ? " indent" : ""}`}
              style={depth > 1 ? { paddingLeft: 8 + depth * 20 } : undefined}
              onClick={() => (isFolder ? undefined : child.entry && onOpenFile(child.entry))}
            >
              <i className={isFolder ? "ph ph-folder" : "ph ph-file-text"} />
              {child.name}
            </button>
            {isFolder ? (
              <TreeLevel node={child} depth={depth + 1} onOpenFile={onOpenFile} />
            ) : null}
          </div>
        );
      })}
    </>
  );
}
