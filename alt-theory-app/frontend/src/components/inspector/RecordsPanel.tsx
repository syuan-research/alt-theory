import { useCallback, useEffect, useState } from "react";
import {
  getSessionFileContent,
  listSessionFiles,
  putSessionFileContent,
} from "@/api/session-files";
import type { SessionTextFile } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { HintText, SectionTitle } from "@/components/ui/Typography";
import { cn } from "@/lib/cn";

interface RecordsPanelProps {
  sessionId: string | null;
  sessionReady: boolean;
  tabActive?: boolean;
}

export function RecordsPanel({
  sessionId,
  sessionReady,
  tabActive = false,
}: RecordsPanelProps) {
  const [files, setFiles] = useState<SessionTextFile[]>([]);
  const [selected, setSelected] = useState<SessionTextFile | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setFiles([]);
      setSelected(null);
      setEditorValue("");
      setStatus("No session selected.");
      return;
    }
    setLoading(true);
    setStatus("Loading...");
    try {
      const data = await listSessionFiles(sessionId);
      const nextFiles = Array.isArray(data.files) ? data.files : [];
      setFiles(nextFiles);
      setStatus(nextFiles.length ? "" : "No records.");
      if (
        selected &&
        !nextFiles.some(
          (file) => file.root === selected.root && file.path === selected.path
        )
      ) {
        setSelected(null);
        setEditorValue("");
      }
    } catch {
      setFiles([]);
      setSelected(null);
      setEditorValue("");
      setStatus("Could not load records.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (tabActive) void refresh();
  }, [tabActive, refresh]);

  const openFile = async (file: SessionTextFile) => {
    if (!sessionId) return;
    setSelected(file);
    setEditorValue("");
    setSaving(false);
    setStatus("Opening...");
    try {
      const data = await getSessionFileContent(sessionId, file.root, file.path);
      setSelected({ root: data.root, path: data.path, size: data.size, updatedAt: data.updatedAt });
      setEditorValue(data.content || "");
      setStatus(`${data.root}/${data.path}`);
    } catch {
      setStatus("Could not open file.");
    }
  };

  const saveFile = async () => {
    if (!sessionId || !selected) return;
    setSaving(true);
    setStatus("Saving...");
    try {
      const data = await putSessionFileContent(sessionId, {
        root: selected.root,
        path: selected.path,
        content: editorValue,
      });
      setStatus(`Saved ${data.root}/${data.path}`);
      await refresh();
    } catch {
      setStatus("Could not save file.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>Session Records</SectionTitle>
        <Button
          variant="ghost"
          className="min-h-7 px-2 text-[0.75rem]"
          onClick={() => void refresh()}
          disabled={!sessionReady || !sessionId || loading}
          title="Refresh records"
        >
          ↻
        </Button>
      </div>

      <div className="max-h-36 space-y-1 overflow-auto">
        {files.length === 0 ? (
          <HintText>No editable records.</HintText>
        ) : (
          files.map((file) => {
            const isSelected =
              selected?.root === file.root && selected?.path === file.path;
            return (
              <button
                key={`${file.root}/${file.path}`}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-[0.8125rem] transition-colors",
                  isSelected
                    ? "border-ink-soft bg-selected"
                    : "border-hairline bg-surface hover:bg-hover"
                )}
                onClick={() => void openFile(file)}
              >
                <span className="truncate">{file.path}</span>
                <span className="shrink-0 text-[0.75rem] text-text-muted">
                  {file.root}
                </span>
              </button>
            );
          })
        )}
      </div>

      <TextArea
        value={editorValue}
        onChange={(event) => setEditorValue(event.target.value)}
        disabled={!selected}
        spellCheck={false}
        className="min-h-40 flex-1 font-[family-name:var(--font-mono)] text-[0.8125rem]"
      />

      <div className="flex items-center justify-between gap-2">
        <HintText className="min-w-0 truncate">{status}</HintText>
        <Button
          variant="secondary"
          className="min-h-8 shrink-0"
          onClick={() => void saveFile()}
          disabled={!selected || saving}
        >
          Save
        </Button>
      </div>
    </div>
  );
}