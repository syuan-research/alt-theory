import { useEffect, useState } from "react";
import type { FileChange } from "@/api/types";
import { fetchSessionChanges } from "@/api/session-files";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";

/**
 * Agent-modified files for the current conversation (M7 §2), from the read-only
 * changes projection. List → drill into a per-file diff.
 */
export function ChangesPanel() {
  const app = useApp();
  const shell = useShell();
  const [files, setFiles] = useState<FileChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FileChange | null>(null);

  const sessionId = app.sessionId;
  const runCount = app.runCompletedCount;

  useEffect(() => {
    if (!sessionId) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    fetchSessionChanges(sessionId)
      .then((res) => !cancelled && (setFiles(res.files), setError(null)))
      .catch((e) => !cancelled && setError(e?.message ?? "Failed to load changes"));
    return () => {
      cancelled = true;
    };
  }, [sessionId, runCount]);

  // Back arrow (panel head) clears rightSub; drop the drill-in when it does.
  useEffect(() => {
    if (!shell.rightSub) setSelected(null);
  }, [shell.rightSub]);

  if (selected) {
    return <DiffView file={selected} />;
  }

  if (error) return <div className="rp-empty">{error}</div>;
  if (!files) return <div className="rp-empty">Loading…</div>;
  if (files.length === 0) {
    return <div className="rp-empty">No file changes in this conversation yet.</div>;
  }

  return (
    <>
      {files.map((file) => (
        <button
          key={file.path}
          className="file-item"
          onClick={() => {
            setSelected(file);
            shell.openSub({ key: `changes:${file.path}`, title: `${file.path}` });
          }}
        >
          <i className="ph ph-file-text" />
          <span className="s-title">{file.path}</span>
          <span className="delta">
            {file.added ? `+${file.added}` : ""}
            {file.added && file.removed ? " " : ""}
            {file.removed ? `-${file.removed}` : ""}
          </span>
        </button>
      ))}
    </>
  );
}

function DiffView({ file }: { file: FileChange }) {
  const lines = file.diff ? file.diff.split("\n") : [];
  return (
    <div className="preview">
      <div className="pv-card" style={{ padding: "8px 0" }}>
        {lines.length === 0 ? (
          <div className="rp-empty">No diff available.</div>
        ) : (
          lines.map((line, i) => {
            const cls = line.startsWith("+")
              ? "diffline add"
              : line.startsWith("-")
                ? "diffline del"
                : "diffline";
            return (
              <div key={i} className={cls}>
                {line}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
