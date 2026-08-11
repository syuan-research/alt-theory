import { useEffect, useState } from "react";
import type { FileChange } from "@/api/types";
import { fetchSessionChanges } from "@/api/session-files";
import { t } from "@/i18n";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { MarkdownBody } from "@/components/conversation/MarkdownBody";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import { copyText } from "@/lib/clipboard";
import { hasNativeBridge, revealPath } from "@/lib/native";

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
  const menu = useContextMenu();

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
  // A `changes:<path>` sub can also arrive from outside — the turn-end card in
  // the conversation opens a file directly — so honour it once the list loads.
  useEffect(() => {
    const key = shell.rightSub?.key;
    if (!key) {
      setSelected(null);
      return;
    }
    if (!key.startsWith("changes:")) return;
    const path = key.slice("changes:".length);
    const match = files?.find((file) => file.path === path);
    if (match && match !== selected) setSelected(match);
  }, [shell.rightSub, files, selected?.path]);

  if (selected) {
    return <DiffView file={selected} />;
  }

  if (error) return <div className="rp-empty">{error}</div>;
  if (!files) return <div className="rp-empty">{t("Loading…")}</div>;
  if (files.length === 0) {
    return <div className="rp-empty">{t("No file changes in this conversation yet.")}</div>;
  }

  const fileItems = (file: FileChange): ContextMenuItem[] => {
    const path = file.resolvedPath ?? file.path;
    return [
      { label: t("Copy path"), icon: "ph-copy", onSelect: () => void copyText(path) },
      { label: t("Show in file tree"), icon: "ph-tree-structure", onSelect: () => shell.revealWorkspacePath(path) },
      ...(hasNativeBridge() ? [{ label: t("Show in file manager"), icon: "ph-folder-open", onSelect: () => void revealPath(path) }] : []),
    ];
  };

  return (
    <>
      {files.map((file) => (
        <button
          key={file.path}
          className="file-item"
          onContextMenu={(event) => menu.open(event, fileItems(file))}
          onKeyDown={(event) => {
            if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            menu.openAt(rect.left + 18, rect.bottom, fileItems(file), event.currentTarget);
          }}
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
      {menu.element}
    </>
  );
}

function DiffView({ file }: { file: FileChange }) {
  const renderedAvailable =
    /\.md$/i.test(file.path) && file.currentContent !== undefined;
  const [view, setView] = useState<"rendered" | "source">(
    renderedAvailable ? "rendered" : "source",
  );
  const [expanded, setExpanded] = useState(false);
  const source = file.currentContent ?? file.diff;
  const sourceLines = source ? source.split("\n") : [];
  const lines = file.diff ? file.diff.split("\n") : [];
  return (
    <div className="preview">
      <div className="change-preview-toolbar">
        {renderedAvailable ? (
          <>
            <button
              className={`flat${view === "rendered" ? " on" : ""}`}
              onClick={() => setView("rendered")}
            >
              {t("Rendered")}
            </button>
            <button
              className={`flat${view === "source" ? " on" : ""}`}
              onClick={() => setView("source")}
            >
              {t("Source")}
            </button>
          </>
        ) : (
          <span>
            {file.currentContent !== undefined ? t("Current source") : t("Conversation diff")}
          </span>
        )}
        {file.currentUpdatedAt ? (
          <span className="change-preview-time">
            {t("Updated {time}", { time: new Date(file.currentUpdatedAt).toLocaleTimeString() })}
          </span>
        ) : null}
      </div>
      <div className={`pv-card change-preview-body${expanded ? " expanded" : ""}`}>
        {!source ? (
          <div className="rp-empty">{t("The current file is not available.")}</div>
        ) : view === "rendered" && renderedAvailable ? (
          <MarkdownBody text={source} />
        ) : (
          <pre>{source}</pre>
        )}
      </div>
      {sourceLines.length > 10 || source.length > 1200 ? (
        <button className="flat change-preview-more" onClick={() => setExpanded((open) => !open)}>
          {expanded ? t("Show less") : t("Show full file")}
        </button>
      ) : null}
      {lines.length > 0 ? (
        <details className="change-diff">
          <summary>{t("Conversation diff")}</summary>
          <div className="pv-card" style={{ padding: "8px 0" }}>
            {lines.map((line, i) => {
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
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}
