import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceFileEntry } from "@/api/types";
import {
  getSessionFileContent,
  listWorkspaceFiles,
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
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);
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
      .then((res) => !cancelled && (setEntries(res.files), setError(null)))
      .catch((e) => !cancelled && setError(e?.message ?? "Failed to load files"));
    return () => {
      cancelled = true;
    };
  }, [sessionId, runCount]);

  useEffect(() => {
    if (!shell.rightSub) setPreview(null);
  }, [shell.rightSub]);

  const tree = useMemo(() => buildTree(entries ?? []), [entries]);

  const openFile = async (entry: WorkspaceFileEntry) => {
    if (!sessionId || entry.kind === "binary-original") return;
    try {
      const res = await getSessionFileContent(sessionId, "workspace", entry.path);
      setPreview({ path: entry.path, content: res.content });
      shell.openSub({ key: `ws:${entry.path}`, title: entry.path });
    } catch (e) {
      setPreview({
        path: entry.path,
        content: e instanceof Error ? e.message : "Could not read file.",
      });
      shell.openSub({ key: `ws:${entry.path}`, title: entry.path });
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
      setEntries(refreshed.files);
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
      </div>
    );
  }

  return (
    <>
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
        <div className="tree">
          <TreeLevel node={tree} depth={0} onOpenFile={openFile} />
        </div>
      )}
    </>
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
