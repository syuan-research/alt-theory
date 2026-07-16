import { useEffect, useMemo, useState } from "react";
import type { WorkspaceFileEntry } from "@/api/types";
import { getSessionFileContent, listWorkspaceFiles } from "@/api/session-files";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";

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

  const sessionId = app.sessionId;
  const runCount = app.runCompletedCount;

  useEffect(() => {
    if (!sessionId) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    listWorkspaceFiles(sessionId)
      .then((res) => !cancelled && (setEntries(res.files), setError(null)))
      .catch((e) => !cancelled && setError(e?.message ?? "Failed to load workspace"));
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

  if (error) return <div className="rp-empty">{error}</div>;
  if (!entries) return <div className="rp-empty">Loading…</div>;
  if (entries.length === 0) {
    return <div className="rp-empty">Workspace is empty.</div>;
  }

  return (
    <div className="tree">
      <TreeLevel node={tree} depth={0} onOpenFile={openFile} />
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
