import { useEffect, useState, type ReactNode } from "react";
import { t } from "@/i18n";
import { MarkdownBody } from "@/components/conversation/MarkdownBody";
import {
  loadFileContent,
  previewModes,
  saveFileContent,
  type FileContent,
  type FileRef,
  type PreviewMode,
} from "@/lib/fileContent";

/**
 * The ONE file renderer for the right pane (card 7): Changes, Files and
 * Records all show a file through this. Modes follow the file type
 * (`previewModes`): a diff when the conversation changed it, rendered +
 * source for .md/.html, the whole file for everything else, edit where the
 * write route allows. The current file loads by reference through the
 * content route; nothing is inlined by the caller.
 */
export function FilePreview({
  sessionId,
  path,
  fileRef,
  diff,
  mode,
  onModeChange,
  onSaved,
  footer,
}: {
  sessionId: string | null;
  /** Display path (toolbar rule and title). */
  path: string;
  /** Where the current file lives; null = no current file (outside every root). */
  fileRef: FileRef | null;
  diff?: string;
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
  onSaved?: (content: FileContent) => void;
  footer?: ReactNode;
}) {
  const [file, setFile] = useState<FileContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const modes = previewModes(path, {
    hasDiff: Boolean(diff),
    hasFile: fileRef !== null,
    editable: file?.editable ?? false,
  });
  const active: PreviewMode = modes.includes(mode) ? mode : (modes[0] ?? "source");

  useEffect(() => {
    setFile(null);
    setError(null);
    setDraft(null);
    setStatus("");
    if (!sessionId || !fileRef) return;
    let cancelled = false;
    loadFileContent(sessionId, fileRef)
      .then((loaded) => !cancelled && setFile(loaded))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : t("The current file is not available.")));
    return () => {
      cancelled = true;
    };
  }, [sessionId, fileRef?.root, fileRef?.path]);

  const save = async () => {
    if (!sessionId || !fileRef || draft === null) return;
    setStatus(t("Saving…"));
    try {
      const saved = await saveFileContent(sessionId, fileRef, draft);
      setFile(saved);
      setDraft(null);
      setStatus(t("Saved."));
      onSaved?.(saved);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t("Could not save file."));
    }
  };

  const label = (m: PreviewMode) =>
    m === "diff"
      ? t("Diff")
      : m === "rendered"
        ? t("Rendered")
        : m === "edit"
          ? t("Edit")
          : file?.renderable || /\.(md|html?)$/i.test(path)
            ? t("Source")
            : t("File");

  const body = () => {
    if (active === "diff") return <DiffLines diff={diff ?? ""} />;
    if (!fileRef) return <div className="rp-empty">{t("The current file is not available.")}</div>;
    if (error) return <div className="rp-empty">{error}</div>;
    if (!file) return <div className="rp-empty">{t("Loading…")}</div>;
    if (active === "edit") {
      return (
        <textarea
          className="file-edit"
          spellCheck={false}
          value={draft ?? file.content}
          onChange={(event) => setDraft(event.target.value)}
        />
      );
    }
    if (active === "rendered") {
      return /\.html?$/i.test(path) ? (
        <iframe className="file-html" sandbox="" srcDoc={file.content} title={path} />
      ) : (
        <MarkdownBody text={file.content} />
      );
    }
    return <pre>{file.content}</pre>;
  };

  return (
    <div className="preview">
      <div className="change-preview-toolbar">
        {modes.length > 1
          ? modes.map((m) => (
              <button key={m} className={`flat${active === m ? " on" : ""}`} onClick={() => onModeChange(m)}>
                {label(m)}
              </button>
            ))
          : <span>{label(active)}</span>}
        {file?.updatedAt ? (
          <span className="change-preview-time">
            {t("Updated {time}", { time: new Date(file.updatedAt).toLocaleTimeString() })}
          </span>
        ) : null}
      </div>
      <div className="pv-card change-preview-body expanded">{body()}</div>
      {active === "edit" ? (
        <div className="file-edit-actions">
          <span className="wb-note">{status}</span>
          <button className="flat" disabled={draft === null} onClick={() => void save()}>
            {t("Save")}
          </button>
        </div>
      ) : null}
      {footer}
    </div>
  );
}

function DiffLines({ diff }: { diff: string }) {
  const lines = diff ? diff.split("\n") : [];
  if (lines.length === 0) return <div className="rp-empty">{t("Nothing to compare against.")}</div>;
  return (
    <div style={{ padding: "8px 0" }}>
      {lines.map((line, i) => (
        <div key={i} className={line.startsWith("+") ? "diffline add" : line.startsWith("-") ? "diffline del" : "diffline"}>
          {line}
        </div>
      ))}
    </div>
  );
}
