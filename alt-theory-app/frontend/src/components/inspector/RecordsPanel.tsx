import { useCallback, useEffect, useRef, useState } from "react";
import { listSessionFiles } from "@/api/session-files";
import type { SessionTextFile } from "@/api/types";
import { t } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { HintText, SectionTitle } from "@/components/ui/Typography";
import { FilePreview } from "@/components/inspector/FilePreview";
import { cn } from "@/lib/cn";
import type { PreviewMode } from "@/lib/fileContent";
import { guardLeave } from "@/lib/fileEditGuard";
import { usePaneMemory } from "@/lib/paneMemory";
import { useShell } from "@/context/ShellContext";

interface RecordsPanelProps {
  sessionId: string | null;
  sessionReady: boolean;
  tabActive?: boolean;
}

export function RecordsPanel({
  sessionId: centerId,
  sessionReady,
  tabActive = false,
}: RecordsPanelProps) {
  // The open record is the view's record target: while one is open the panel
  // is its conversation's (the center may have moved on); otherwise the
  // center conversation's list.
  const shell = useShell();
  const selected = shell.target?.kind === "record" ? shell.target : null;
  const sessionId = selected?.sessionId ?? centerId;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const select = (file: SessionTextFile) => {
    if (!sessionId) return;
    shell.openTarget({ kind: "record", sessionId, root: file.root as "records" | "workspace", path: file.path });
  };
  const [files, setFiles] = useState<SessionTextFile[]>([]);
  const [mode, setMode] = usePaneMemory<PreviewMode>(`${sessionId}:records:mode`, "edit");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setFiles([]);
      setStatus(t("No session selected."));
      return;
    }
    setLoading(true);
    setStatus(t("Loading..."));
    try {
      const data = await listSessionFiles(sessionId);
      const nextFiles = Array.isArray(data.files) ? data.files : [];
      setFiles(nextFiles);
      setStatus(nextFiles.length ? "" : t("No records."));
      // A record that is gone closes.
      const current = selectedRef.current;
      if (current && !nextFiles.some((file) => file.root === current.root && file.path === current.path)) {
        shell.closeTarget();
      }
    } catch {
      setFiles([]);
      setStatus(t("Could not load records."));
    } finally {
      setLoading(false);
    }
  }, [sessionId, shell.closeTarget]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (tabActive) void refresh();
  }, [tabActive, refresh]);


  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>{t("Session Records")}</SectionTitle>
        <Button
          variant="ghost"
          className="min-h-7 px-2 text-[length:var(--fs-secondary)]"
          onClick={() => void refresh()}
          disabled={!sessionReady || !sessionId || loading}
          data-tip={t("Refresh records")}
        >
          ↻
        </Button>
      </div>

      <div className="max-h-36 space-y-1 overflow-auto">
        {files.length === 0 ? (
          <HintText>{t("No editable records.")}</HintText>
        ) : (
          files.map((file) => {
            const isSelected =
              selected?.root === file.root && selected?.path === file.path;
            return (
              <button
                key={`${file.root}/${file.path}`}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-[length:var(--fs-primary)] transition-colors",
                  isSelected
                    ? "border-ink-soft bg-selected"
                    : "border-hairline bg-surface hover:bg-hover"
                )}
                onClick={() => void guardLeave(() => select(file))}
              >
                <span className="truncate">{file.path}</span>
                <span className="shrink-0 text-[length:var(--fs-secondary)] text-text-muted">
                  {file.root}
                </span>
              </button>
            );
          })
        )}
      </div>

      {selected ? (
        <FilePreview
          sessionId={sessionId}
          path={selected.path}
          fileRef={{ root: selected.root, path: selected.path }}
          mode={mode}
          onModeChange={setMode}
          onSaved={(saved) => {
            void refresh();
            // A conflict copy saved to a sibling: follow it there.
            if (saved.path !== selected.path) shell.openTarget({ ...selected, path: saved.path });
          }}
        />
      ) : null}

      <HintText className="min-w-0 truncate">{status}</HintText>
    </div>
  );
}