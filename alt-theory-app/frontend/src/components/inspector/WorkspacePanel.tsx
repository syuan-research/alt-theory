import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteSessionFileContent,
  getSessionFileContent,
  listWorkspaceFiles,
  putSessionFileContent,
  retryWorkspaceExtract,
  uploadWorkspaceFile,
  workspaceDownloadUrl,
} from "@/api/session-files";
import type { SessionTextFile, WorkspaceFileEntry } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { HintText, SectionTitle } from "@/components/ui/Typography";
import {
  SUMMARY_HANDOFF_PROMPT,
  SUMMARY_SKILL_NAME,
} from "@/lib/constants";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  pathsToUnstageOnDelete,
  stagePathAfterUpload,
  stageablePathForEntry,
} from "@/lib/workspace";

interface WorkspacePanelProps {
  sessionId: string | null;
  sessionReady: boolean;
  tabActive?: boolean;
  isRunning: boolean;
  runCompletedCount: number;
  stagedWorkspacePaths: string[];
  onToggleWorkspaceStage: (path: string, staged: boolean) => void;
  onStageWorkspacePath: (path: string) => void;
  onUnstageWorkspacePaths: (paths: string[]) => void;
  onRequestConfirm: (request: {
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  }) => void;
  onInvokeSkill: (skillName: string, userText?: string) => boolean;
}

function openPathForEntry(entry: WorkspaceFileEntry): string | null {
  if (entry.kind === "binary-original" && entry.extractStatus === "failed") {
    return null;
  }
  if (entry.kind === "converted" || entry.kind === "text") return entry.path;
  return entry.convertedPath || null;
}

export function WorkspacePanel({
  sessionId,
  sessionReady,
  tabActive = false,
  isRunning,
  runCompletedCount,
  stagedWorkspacePaths,
  onToggleWorkspaceStage,
  onStageWorkspacePath,
  onUnstageWorkspacePaths,
  onRequestConfirm,
  onInvokeSkill,
}: WorkspacePanelProps) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const pendingSummaryKindRef = useRef<"" | "summary" | "handoff">("");
  const [entries, setEntries] = useState<WorkspaceFileEntry[]>([]);
  const [usageText, setUsageText] = useState("");
  const [selected, setSelected] = useState<SessionTextFile | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [fileStatus, setFileStatus] = useState("");
  const [summaryNote, setSummaryNote] = useState("");
  const [summaryStatus, setSummaryStatus] = useState("");
  const [summaryStatusTone, setSummaryStatusTone] = useState<
    "" | "ok" | "error"
  >("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setEntries([]);
      setUsageText("");
      setSelected(null);
      setEditorValue("");
      setFileStatus("No session selected.");
      return;
    }
    setLoading(true);
    setFileStatus("Loading...");
    try {
      const data = await listWorkspaceFiles(sessionId);
      const nextEntries = data.entries ?? data.files ?? [];
      setEntries(nextEntries);
      if (data.usage) {
        setUsageText(
          `Workspace · ${formatBytes(data.usage.sessionBytes)} / ${formatBytes(data.usage.sessionQuotaBytes)} used`
        );
      } else {
        setUsageText("");
      }
      setFileStatus(nextEntries.length ? "" : "No workspace files.");
    } catch {
      setEntries([]);
      setUsageText("");
      setFileStatus("Could not load workspace files.");
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

  useEffect(() => {
    setSummaryNote("");
    setSummaryStatus("");
    setSummaryStatusTone("");
    pendingSummaryKindRef.current = "";
  }, [sessionId]);

  useEffect(() => {
    if (!pendingSummaryKindRef.current) return;
    const kind = pendingSummaryKindRef.current;
    setSummaryStatus(
      kind === "handoff" ? "Handoff generated." : "Summary generated."
    );
    setSummaryStatusTone("ok");
    pendingSummaryKindRef.current = "";
  }, [runCompletedCount]);

  const openFile = async (path: string) => {
    if (!sessionId) return;
    const file: SessionTextFile = { root: "workspace", path, size: 0, updatedAt: null };
    setSelected(file);
    setEditorValue("");
    setFileStatus("Opening...");
    try {
      const data = await getSessionFileContent(sessionId, "workspace", path);
      setSelected({
        root: data.root,
        path: data.path,
        size: data.size,
        updatedAt: data.updatedAt,
      });
      setEditorValue(data.content || "");
      setFileStatus(`${data.root}/${data.path}`);
    } catch {
      setFileStatus("Could not open file.");
    }
  };

  const saveFile = async () => {
    if (!sessionId || !selected) return;
    setSaving(true);
    setFileStatus("Saving...");
    try {
      const data = await putSessionFileContent(sessionId, {
        root: selected.root,
        path: selected.path,
        content: editorValue,
      });
      setFileStatus(`Saved ${data.root}/${data.path}`);
      await refresh();
    } catch {
      setFileStatus("Could not save file.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file || !sessionId) {
      setFileStatus(
        "Open a saved session, or send a message to create one, before uploading."
      );
      return;
    }
    setFileStatus("Uploading...");
    try {
      const result = await uploadWorkspaceFile(sessionId, file);
      const stagePath = stagePathAfterUpload(result);
      if (stagePath) onStageWorkspacePath(stagePath);
      if (result.extractStatus === "failed") {
        setFileStatus(result.extractError || "Conversion failed");
      } else {
        setFileStatus(`Uploaded ${result.originalPath}`);
      }
      await refresh();
    } catch (err) {
      setFileStatus(err instanceof Error ? err.message : "Upload failed");
    } finally {
      if (uploadRef.current) uploadRef.current.value = "";
    }
  };

  const performDelete = async (path: string) => {
    if (!sessionId) return;
    setFileStatus("Deleting...");
    try {
      await deleteSessionFileContent(sessionId, "workspace", path);
      onUnstageWorkspacePaths(pathsToUnstageOnDelete(path, entries));
      if (selected?.path === path) {
        setSelected(null);
        setEditorValue("");
      }
      await refresh();
      setFileStatus(`Deleted ${path}`);
    } catch (err) {
      setFileStatus(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleDelete = (path: string) => {
    if (!sessionId) return;
    onRequestConfirm({
      message: `Delete ${path}?`,
      confirmLabel: "Delete",
      onConfirm: () => {
        void performDelete(path);
      },
    });
  };

  const invokeSummary = (kind: "summary" | "handoff") => {
    if (!sessionReady || isRunning) return;
    const userNote = summaryNote.trim();
    const isHandoff = kind === "handoff";
    const userText = isHandoff
      ? `${SUMMARY_HANDOFF_PROMPT}${userNote ? `\n\nUser note: ${userNote}` : ""}`
      : userNote || undefined;
    const ok = onInvokeSkill(SUMMARY_SKILL_NAME, userText);
    if (!ok) {
      setSummaryStatus("Could not invoke summary skill.");
      setSummaryStatusTone("error");
      return;
    }
    pendingSummaryKindRef.current = kind;
    setSummaryStatus(
      isHandoff ? "Generating handoff..." : "Generating summary..."
    );
    setSummaryStatusTone("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>Workspace Files</SectionTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              className="min-h-7 px-2 text-[0.75rem]"
              onClick={() => void refresh()}
              disabled={!sessionReady || !sessionId || loading}
              title="Refresh workspace files"
            >
              ↻
            </Button>
            <Button
              variant="ghost"
              className="min-h-7 px-2 text-[0.75rem]"
              onClick={() => uploadRef.current?.click()}
              disabled={!sessionReady || !sessionId}
              title="Upload workspace file"
            >
              Upload
            </Button>
            <input
              ref={uploadRef}
              type="file"
              className="hidden"
              accept=".txt,.md,.csv,.tsv,.json,.html,.docx,.xlsx,.pdf"
              onChange={(event) => void handleUpload(event.target.files?.[0])}
            />
          </div>
        </div>
        {usageText ? <HintText>{usageText}</HintText> : null}

        <div className="max-h-36 space-y-1 overflow-auto">
          {entries.length === 0 ? (
            <HintText>No workspace files.</HintText>
          ) : (
            entries.map((entry) => {
              const openPath = openPathForEntry(entry);
              const stagePath = stageablePathForEntry(entry);
              const isSelected = selected?.path === openPath;
              return (
                <div
                  key={entry.path}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-1 py-1",
                    isSelected ? "bg-selected" : "bg-transparent hover:bg-hover"
                  )}
                >
                  <input
                    type="checkbox"
                    className="shrink-0"
                    disabled={!stagePath}
                    checked={stagePath ? stagedWorkspacePaths.includes(stagePath) : false}
                    title={
                      stagePath ? "Include in next message" : "Not ready to attach"
                    }
                    onChange={(event) => {
                      if (!stagePath) return;
                      onToggleWorkspaceStage(stagePath, event.target.checked);
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded px-1 py-0.5 text-left hover:bg-hover"
                    disabled={!openPath}
                    onClick={() => openPath && void openFile(openPath)}
                  >
                    <p className="truncate text-[0.8125rem] text-ink">{entry.path}</p>
                    <p
                      className={cn(
                        "truncate text-[0.75rem]",
                        entry.extractStatus === "failed"
                          ? "text-danger"
                          : "text-text-muted"
                      )}
                    >
                      {entry.extractStatus === "failed"
                        ? entry.extractError || "Conversion failed"
                        : entry.kind === "binary-original" && entry.convertedPath
                          ? entry.convertedPath
                          : formatBytes(entry.size)}
                    </p>
                  </button>
                  {entry.downloadable && sessionId ? (
                    <a
                      className="rounded px-1.5 py-1 text-[0.75rem] text-text-secondary hover:bg-hover"
                      href={workspaceDownloadUrl(sessionId, entry.path)}
                      title="Download"
                    >
                      ↓
                    </a>
                  ) : null}
                  {entry.extractStatus === "failed" && sessionId ? (
                    <button
                      type="button"
                      className="rounded px-1.5 py-1 text-[0.75rem] text-text-secondary hover:bg-hover"
                      title="Retry conversion"
                      onClick={() =>
                        void retryWorkspaceExtract(sessionId, entry.path).then(
                          (data) => {
                            if (data.convertedPath) {
                              onStageWorkspacePath(data.convertedPath);
                            }
                            return refresh();
                          }
                        )
                      }
                    >
                      ↻
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded px-1.5 py-1 text-[0.75rem] text-danger hover:bg-hover"
                    title="Delete"
                    onClick={() => handleDelete(entry.path)}
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>

        <TextArea
          value={editorValue}
          onChange={(event) => setEditorValue(event.target.value)}
          disabled={!selected}
          spellCheck={false}
          className="min-h-32 bg-surface/70 font-[family-name:var(--font-mono)] text-[0.8125rem]"
        />
        <div className="flex items-center justify-between gap-2">
          <HintText className="min-w-0 truncate">{fileStatus}</HintText>
          <Button
            variant="ghost"
            className="min-h-8 shrink-0"
            onClick={() => void saveFile()}
            disabled={!selected || saving}
            title="Save workspace file"
          >
            Save
          </Button>
        </div>
      </div>

      <div className="space-y-2 border-t border-hairline pt-3">
        <SectionTitle>Summary</SectionTitle>
        <TextArea
          value={summaryNote}
          onChange={(event) => setSummaryNote(event.target.value)}
          spellCheck={false}
          placeholder="Optional note for summary or handoff."
          className="min-h-20 bg-surface/70 text-[0.875rem] placeholder:text-[0.8125rem] placeholder:text-text-muted/70"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            disabled={!sessionReady || isRunning}
            onClick={() => invokeSummary("summary")}
          >
            Save summary to file
          </Button>
          <Button
            variant="ghost"
            disabled={!sessionReady || isRunning}
            onClick={() => invokeSummary("handoff")}
          >
            Save handoff to file
          </Button>
        </div>
        {summaryStatus ? (
          <HintText
            className={cn(
              summaryStatusTone === "error" && "text-danger",
              summaryStatusTone === "ok" && "text-success"
            )}
          >
            {summaryStatus}
          </HintText>
        ) : null}
      </div>
    </div>
  );
}
