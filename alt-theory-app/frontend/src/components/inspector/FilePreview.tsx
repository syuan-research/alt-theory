import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
import { textPatch, useFindBound, useFindTarget } from "@/lib/find";
import {
  clearDraft,
  afterWrites,
  draftKey,
  flushDraft,
  getDraft,
  setDraft as cacheDraft,
} from "@/lib/fileDrafts";
import { useApp } from "@/context/AppProvider";

/** Typing pause before an edit saves itself (owner ruling 2026-09-28). */
const AUTOSAVE_MS = 1000;

/** The disk version each file's next write expects (409 when it moved).
 *  Module scope, like the drafts: a write finishing after its editor left
 *  still records what it wrote. */
const bases = new Map<string, { updatedAt: string | null; folderPath: string | null }>();

type SaveOptions = { force?: boolean; conflictCopy?: boolean };

/** Write the file's draft, in order after any earlier write for it. */
function persist(sessionId: string, ref: FileRef, key: string, options: SaveOptions = {}) {
  return flushDraft(key, async (text) => {
    const base = bases.get(key);
    const saved = await saveFileContent(sessionId, ref, text, {
      expectedUpdatedAt: base?.updatedAt ?? undefined,
      expectedFolderPath: base?.folderPath ?? undefined,
      ...options,
    });
    // A conflict copy went to a sibling; this file's disk version is unchanged.
    if (!options.conflictCopy) bases.set(key, saved);
    return saved;
  });
}

/**
 * The ONE file renderer for the right pane (card 7): Changes, Files and
 * Records all show a file through this. Modes follow the file type
 * (`previewModes`): rendered first for changed .md/.html, then diff and
 * source; the whole file for everything else, edit where the
 * write route allows (every root, owner ruling 2026-09-15). The current file
 * loads by reference through the content route; nothing is inlined by the
 * caller.
 *
 * Edit saves itself (owner ruling 2026-09-28; the user's whole model: "edits
 * save automatically; until you close the file, Ctrl+Z walks back to how it
 * opened"): a second after typing stops, and at once on blur, Ctrl+S, or
 * leaving the file. There is no save button and no leave guard. A save that
 * hits a file changed on disk since it loaded shows the conflict bar
 * (discard / save a copy / overwrite) — rare now: with no unsaved text, a
 * changed file (say Alt rewrote it) just reloads when any conversation
 * finishes a run.
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
  const [status, setStatus] = useState<{ text: string; failed?: boolean }>({ text: "" });
  const [conflict, setConflict] = useState(false);

  const key = sessionId && fileRef ? draftKey(sessionId, fileRef.root, fileRef.path) : "";

  const modes = previewModes(path, {
    hasDiff: Boolean(diff),
    hasFile: fileRef !== null,
    editable: file?.editable ?? false,
  });
  const active: PreviewMode = modes.includes(mode) ? mode : (modes[0] ?? "source");

  // Latest-value refs so stable callbacks (hotkey, timer) never go stale.
  const keyRef = useRef(key);
  keyRef.current = key;
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const timer = useRef(0);
  const editOpened = useRef(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const scrollSeen = useRef({ textarea: 0, card: 0 });
  const editText = active === "edit" && file ? (draft ?? file.content) : null;
  const mirrored = useFindBound(bodyRef) && editText !== null;

  const save = useCallback(
    async (options: SaveOptions = {}): Promise<void> => {
      window.clearTimeout(timer.current);
      if (!sessionId || !fileRef) return;
      const saveKey = draftKey(sessionId, fileRef.root, fileRef.path);
      try {
        const done = await persist(sessionId, fileRef, saveKey, options);
        if (!done || keyRef.current !== saveKey) return;
        if (options.conflictCopy) {
          // The text went to a sibling; this editor shows the original as it
          // now is on disk (callers that follow the copy navigate on onSaved).
          discardRef.current();
          const name = done.result.path.split("/").at(-1) ?? done.result.path;
          setStatus({ text: t("Saved as {name}.", { name }) });
          onSavedRef.current?.(done.result);
          return;
        }
        setConflict(false);
        // Keep the very text the textarea shows, so React leaves its value
        // — and with it the undo history — alone.
        setFile({ ...done.result, content: done.text });
        const newer = getDraft(saveKey); // typing went on during the write
        setDraft(newer);
        setStatus({ text: newer === null ? t("Saved.") : "" });
        onSavedRef.current?.(done.result);
      } catch (e) {
        if (keyRef.current !== saveKey) return;
        if (e instanceof ApiError && e.status === 409) {
          // Changed on disk since it loaded: autosave pauses until the user
          // picks discard / copy / overwrite. The text stays in the draft.
          setConflict(true);
          setStatus({ text: "" });
          return;
        }
        setStatus({ text: e instanceof Error ? e.message : t("Could not save file."), failed: true });
      }
    },
    [sessionId, fileRef?.root, fileRef?.path]
  );
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    editOpened.current = active === "edit";
    setFile(null);
    setError(null);
    setStatus({ text: "" });
    setConflict(false);
    setDraft(null);
    if (!sessionId || !fileRef) return;
    const loadKey = draftKey(sessionId, fileRef.root, fileRef.path);
    let cancelled = false;
    // Wait out a write from an earlier visit, so the load never reads the
    // disk from before our own save.
    afterWrites(loadKey)
      .then(() => loadFileContent(sessionId, fileRef))
      .then((loaded) => {
        if (cancelled) return;
        // Text still parked here means its write failed: it comes back and
        // retries against the version it was written over (a changed file
        // then shows the conflict bar instead of being overwritten).
        const parked = getDraft(loadKey);
        if (parked === null || !bases.has(loadKey)) bases.set(loadKey, loaded);
        setFile(loaded);
        setDraft(parked);
        if (parked !== null) void saveRef.current();
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : t("The current file is not available.")));
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
      // Leaving the file (another file, conversation, closing the pane)
      // saves at once; a failure keeps the draft for the next visit.
      if (getDraft(loadKey) !== null) persist(sessionId, fileRef, loadKey).catch(() => undefined);
    };
  }, [sessionId, fileRef?.root, fileRef?.path]);

  // Any conversation may rewrite the open file (they share project
  // folders): whenever one finishes a run, with no unsaved text here, show
  // the file's new version if it changed (a changed text resets undo).
  const running = useApp()
    .sessions.filter((row) => row.runStatus === "running" || row.runStatus === "awaiting-approval")
    .map((row) => row.sessionId);
  const runningKey = running.join("|");
  const seenRunning = useRef(running);
  useEffect(() => {
    const finished = seenRunning.current.some((id) => !running.includes(id));
    seenRunning.current = running;
    if (!finished || !sessionId || !fileRef || getDraft(key) !== null) return;
    const loadKey = key;
    afterWrites(loadKey)
      .then(() => {
        const before = bases.get(loadKey);
        return loadFileContent(sessionId, fileRef).then((loaded) => ({ loaded, before }));
      })
      .then(({ loaded, before }) => {
        if (keyRef.current !== loadKey || getDraft(loadKey) !== null) return;
        // A save landed during the fetch: its version wins over this read.
        if (bases.get(loadKey) !== before || loaded.updatedAt === before?.updatedAt) return;
        bases.set(loadKey, loaded);
        setFile(loaded);
      })
      .catch(() => undefined);
  }, [runningKey]);

  const doDiscard = useCallback(() => {
    window.clearTimeout(timer.current);
    setConflict(false);
    setStatus({ text: "" });
    setDraft(null);
    if (!sessionId || !fileRef) return;
    const clearKey = draftKey(sessionId, fileRef.root, fileRef.path);
    clearDraft(clearKey);
    loadFileContent(sessionId, fileRef)
      .then((loaded) => {
        // A late return must not clobber whatever file the pane shows now.
        if (keyRef.current !== clearKey) return;
        bases.set(clearKey, loaded);
        setFile(loaded);
      })
      .catch(() => undefined);
  }, [sessionId, fileRef?.root, fileRef?.path]);

  const discardRef = useRef(doDiscard);
  discardRef.current = doDiscard;

  const onChangeDraft = (value: string) => {
    if (!key) return;
    setDraft(value);
    cacheDraft(key, value);
    setStatus({ text: "" });
    window.clearTimeout(timer.current);
    // During the conflict bar nothing saves until the user picks.
    if (!conflictRef.current) timer.current = window.setTimeout(() => void saveRef.current(), AUTOSAVE_MS);
  };

  // Ctrl+S saves now. Registered in the conflict bar too, so it never falls
  // through to the browser's save-page default; it does nothing there.
  const hotkeySave = useCallback(() => {
    if (!conflictRef.current) void saveRef.current();
  }, []);
  useHotkey("save", active === "edit" ? hotkeySave : null);

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

  // Once opened, the editor stays mounted (hidden) while another mode shows,
  // so its undo history lasts until the file closes, as the user was told.
  if (active === "edit") editOpened.current = true;
  const showEditor = file !== null && !error && editOpened.current;

  // The mirror sits before the textarea so React never remounts it (undo,
  // focus and selection live on that element).
  const editor = () =>
    file ? (
      <div className={`file-edit-wrap${mirrored ? " mirrored" : ""}`} hidden={active !== "edit"}>
        {mirrored ? <div ref={mirrorRef} className="file-edit-mirror" aria-hidden="true" /> : null}
        <textarea
          ref={textareaRef}
          className="file-edit"
          spellCheck={false}
          value={draft ?? file.content}
          onChange={(event) => onChangeDraft(event.target.value)}
          onBlur={() => {
            if (getDraft(key) !== null && !conflictRef.current) void save();
          }}
          onScroll={(event) => {
            scrollSeen.current.textarea = event.currentTarget.scrollTop;
          }}
        />
      </div>
    ) : null;

  const body = () => {
    if (active === "diff") return <DiffLines diff={diff ?? ""} />;
    if (!fileRef) return <div className="rp-empty">{t("The current file is not available.")}</div>;
    if (error) return <div className="rp-empty">{error}</div>;
    if (!file) return <div className="rp-empty">{t("Loading…")}</div>;
    if (active === "rendered") {
      return /\.html?$/i.test(path) ? (
        <iframe className="file-html" sandbox="" srcDoc={file.content} title={path} />
      ) : (
        <MarkdownBody text={file.content} />
      );
    }
    return <pre>{file.content}</pre>;
  };

  // Ctrl+F searches what is shown as text; rendered HTML (a sandboxed
  // iframe) is not searchable, so the bar closes there.
  const searchable =
    active === "diff" || (file !== null && !(active === "rendered" && /\.html?$/i.test(path)));
  // The mirror's relayout makes typing noticeably slower from about this size.
  const slowMirror = editText !== null && editText.length > 200_000;
  useFindTarget(
    bodyRef,
    searchable ? (slowMirror ? { note: t("Large file: typing is slower while searching") } : {}) : null
  );

  // Edit is searched through a mirror (issue 2026-09-28): a transparent copy
  // of the text under the textarea, in the same grid cell with the same
  // typography, so find's DOM ranges paint behind the textarea's own
  // glyphs. While the bar is bound here the mirror sizes the cell and the
  // card scrolls both layers; otherwise the textarea scrolls itself as
  // before, with no per-keystroke mirror cost.
  useLayoutEffect(() => {
    const mirror = mirrorRef.current;
    if (!mirror || editText === null) return;
    // The textarea's value normalizes line breaks; the mirror must match it
    // offset for offset.
    const next = editText.replace(/\r\n?/g, "\n");
    const node = mirror.firstChild;
    // One minimal replaceData: live match ranges shift instead of collapsing.
    if (node instanceof Text) node.replaceData(...textPatch(node.data, next));
    else mirror.append(next);
  }, [mirrored, editText]);

  // Hand the scroll position between the textarea and the card when the
  // mirror comes or goes (both show the same content offset).
  const handoff = useRef({ edit: false, mirrored: false });
  useLayoutEffect(() => {
    const prev = handoff.current;
    handoff.current = { edit: active === "edit", mirrored };
    if (!prev.edit || active !== "edit" || prev.mirrored === mirrored) return;
    const textarea = textareaRef.current;
    const card = bodyRef.current;
    if (!textarea || !card) return;
    if (mirrored) card.scrollTop = scrollSeen.current.textarea;
    else textarea.scrollTop = scrollSeen.current.card;
  }, [active, mirrored]);

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
          <button className="flat" onClick={() => void save({ conflictCopy: true })}>
            {t("Save a copy")}
          </button>
          <button className="flat" onClick={() => void save({ force: true })}>
            {t("Overwrite")}
          </button>
        </div>
      );
    }
    // Autosave's only trace: a quiet line that says it happened (or why not).
    return (
      <div className="file-edit-actions">
        <span className={status.failed ? "conflict-note danger" : "wb-note"}>{status.text}</span>
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
      <div
        className="change-preview-body expanded"
        ref={bodyRef}
        onScroll={(event) => {
          scrollSeen.current.card = event.currentTarget.scrollTop;
        }}
      >
        {active === "edit" && showEditor ? null : body()}
        {showEditor ? editor() : null}
      </div>
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
