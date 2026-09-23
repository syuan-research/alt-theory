import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "@/i18n";
import { MarkdownBody } from "@/components/conversation/MarkdownBody";
import { ApiError } from "@/api/http";
import {
  loadFileContent,
  saveFileContent,
  previewModes,
  isEditable,
  type FileContent,
  type FileRef,
  type PreviewMode,
} from "@/lib/fileContent";
import { useHotkey } from "@/lib/hotkeys";
import {
  clearDraft,
  draftKey,
  getDraft,
  setDraft as cacheDraft,
} from "@/lib/fileDrafts";
import {
  clearArmed,
  onArmedChange,
  registerGuardEditor,
  resolveArmed,
} from "@/lib/fileEditGuard";

/**
 * The ONE file renderer for the right pane (card 7): Changes, Files and
 * Records all show a file through this. Modes follow the file type
 * (`previewModes`): rendered first for changed .md/.html, then diff and
 * source; the whole file for everything else, edit where the
 * write route allows (every root, owner ruling 2026-09-15). The current file
 * loads by reference through the content route; nothing is inlined by the
 * caller.
 *
 * Edit extras, all owner-ruled 2026-09-15: the unsaved draft lives in
 * lib/fileDrafts (rail/session switches never lose it), a leave attempt
 * while dirty bounces once into the red bar (lib/fileEditGuard; a second
 * attempt saves and proceeds), a save that hits an externally changed file
 * shows the conflict bar (discard / save a copy / overwrite), and Ctrl+S
 * comes from the one hotkey table (lib/hotkeys).
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
  const [conflict, setConflict] = useState(false);
  const [armed, setArmed] = useState(false);

  const key = sessionId && fileRef ? draftKey(sessionId, fileRef.root, fileRef.path) : "";

  const modes = previewModes(path, {
    hasDiff: Boolean(diff),
    hasFile: fileRef !== null,
    editable: file?.editable ?? false,
  });
  const active: PreviewMode = modes.includes(mode) ? mode : (modes[0] ?? "source");

  // Latest-value refs so stable callbacks (hotkey, guard) never go stale.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const keyRef = useRef(key);
  keyRef.current = key;
  const fileUpdatedAtRef = useRef<string | null>(null);
  fileUpdatedAtRef.current = file?.updatedAt ?? null;
  const fileFolderRef = useRef<string | null>(null);
  fileFolderRef.current = file?.folderPath ?? null;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    setFile(null);
    setError(null);
    setStatus("");
    setConflict(false);
    setDraft(null);
    if (!sessionId || !fileRef) return;
    const restoreKey = draftKey(sessionId, fileRef.root, fileRef.path);
    let cancelled = false;
    loadFileContent(sessionId, fileRef)
      .then((loaded) => {
        if (cancelled) return;
        setFile(loaded);
        // A draft parked by an earlier visit (rail/session switch) comes
        // back; the unsaved edit outlives its surface.
        setDraft(getDraft(restoreKey));
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : t("The current file is not available.")));
    return () => {
      cancelled = true;
    };
  }, [sessionId, fileRef?.root, fileRef?.path]);

  const doSave = useCallback(
    async (options: { force?: boolean; conflictCopy?: boolean } = {}): Promise<boolean> => {
      if (!sessionId || !fileRef || draftRef.current === null) return false;
      setStatus(t("Saving…"));
      try {
        const saved = await saveFileContent(sessionId, fileRef, draftRef.current, {
          expectedUpdatedAt: fileUpdatedAtRef.current ?? undefined,
          expectedFolderPath: fileFolderRef.current ?? undefined,
          ...options,
        });
        setConflict(false);
        setFile(saved);
        setDraft(null);
        // The draft died by saving (also for a conflict copy: its text went
        // to the sibling, so the parked draft must not come back on the
        // original file as a phantom dirty edit).
        clearDraft(draftKey(sessionId, fileRef.root, fileRef.path));
        if (options.conflictCopy) {
          const name = saved.path.split("/").at(-1) ?? saved.path;
          setStatus(t("Saved as {name}.", { name }));
        } else {
          setStatus(t("Saved."));
        }
        onSavedRef.current?.(saved);
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          // The file changed on disk since load: stop and let the user pick
          // discard / copy / overwrite; the pending leave (if any) aborts.
          setConflict(true);
          setStatus("");
          return false;
        }
        setStatus(e instanceof Error ? e.message : t("Could not save file."));
        return false;
      }
    },
    [sessionId, fileRef]
  );

  const doDiscard = useCallback(() => {
    clearArmed();
    setConflict(false);
    setStatus("");
    setDraft(null);
    if (!sessionId || !fileRef) return;
    const clearKey = draftKey(sessionId, fileRef.root, fileRef.path);
    clearDraft(clearKey);
    loadFileContent(sessionId, fileRef)
      .then((loaded) => {
        // resolveArmed(false) navigates right after this fires; a late
        // return must not clobber whatever file the pane shows now.
        if (keyRef.current === clearKey) setFile(loaded);
      })
      .catch(() => undefined);
  }, [sessionId, fileRef]);

  // The leave guard: this editor is the guard's one slot while mounted.
  const saveRef = useRef(doSave);
  saveRef.current = doSave;
  const discardRef = useRef(doDiscard);
  discardRef.current = doDiscard;
  useEffect(() => {
    if (!key) {
      registerGuardEditor(null);
      return;
    }
    registerGuardEditor({
      key,
      isDirty: () => draftRef.current !== null,
      save: () => saveRef.current(),
      discard: () => discardRef.current(),
    });
    return () => {
      registerGuardEditor(null);
    };
  }, [key]);

  // Which file's leave is blocked (red bar) — null/other key = hidden.
  useEffect(() => {
    if (!key) return;
    return onArmedChange((armedKey) => setArmed(armedKey === key));
  }, [key]);

  const onChangeDraft = (value: string) => {
    if (!key) return;
    // Typing means "stay": a pending blocked leave dissolves, draft remains.
    clearArmed();
    setDraft(value);
    cacheDraft(key, value);
  };

  const canSave = active === "edit" && draft !== null;
  const hotkeySave = useCallback(() => {
    // Registered during the conflict bar too, so Ctrl+S never falls through
    // to the browser's save-page default; it just does nothing there.
    if (conflict) return;
    void doSave();
  }, [doSave, conflict]);
  useHotkey("save", active === "edit" && (canSave || conflict) ? hotkeySave : null);

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
          onChange={(event) => onChangeDraft(event.target.value)}
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

  const tooLargeToEdit = file !== null && fileRef !== null && isEditable(fileRef) && !file.editable;

  const actionsBar = () => {
    if (active !== "edit" || !file) return null;
    if (conflict) {
      return (
        <div className="file-edit-actions">
          <span className="grow conflict-note">{t("This file was changed outside the editor.")}</span>
          <button className="flat" onClick={() => doDiscard()}>
            {t("Discard changes")}
          </button>
          <button className="flat" onClick={() => void doSave({ conflictCopy: true })}>
            {t("Save a copy")}
          </button>
          <button className="flat" onClick={() => void doSave({ force: true })}>
            {t("Overwrite")}
          </button>
        </div>
      );
    }
    if (armed) {
      return (
        <div className="file-edit-actions">
          <span className="grow conflict-note danger">{t("Unsaved changes.")}</span>
          <button className="flat" onClick={() => resolveArmed(true)}>
            {t("Save")}
          </button>
          <button className="flat" onClick={() => resolveArmed(false)}>
            {t("Discard changes")}
          </button>
        </div>
      );
    }
    return (
      <div className="file-edit-actions">
        <span className="wb-note">{status}</span>
        <button className="flat" disabled={draft === null} onClick={() => void doSave()}>
          {t("Save")}
        </button>
      </div>
    );
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
        {tooLargeToEdit ? (
          <span className="change-preview-time">{t("Files over 1 MiB are view-only.")}</span>
        ) : file?.updatedAt ? (
          <span className="change-preview-time">
            {t("Updated {time}", { time: new Date(file.updatedAt).toLocaleTimeString() })}
          </span>
        ) : null}
      </div>
      <div className="change-preview-body expanded">{body()}</div>
      {actionsBar()}
      {footer}
    </div>
  );
}

function DiffLines({ diff }: { diff: string }) {
  const lines = diff ? diff.split("\n") : [];
  if (lines.length === 0) return <div className="rp-empty">{t("Nothing to compare against.")}</div>;
  return (
    <div>
      {lines.map((line, i) => (
        <div key={i} className={line.startsWith("+") ? "diffline add" : line.startsWith("-") ? "diffline del" : "diffline"}>
          {line}
        </div>
      ))}
    </div>
  );
}
