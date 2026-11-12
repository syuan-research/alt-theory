import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchBookmarks, saveBookmark } from "@/api/sessions";
import { useConversationContext } from "@/context/ConversationContext";
import { scrollAffectsAnchor, useContextMenu } from "@/components/shell/ContextMenu";
import { t } from "@/i18n";

/** Read on demand rather than loading bookmarks for every transcript row. */
export function BookmarkAction({ row }: { row: string }) {
  const { sessionId, notify } = useConversationContext();
  const menu = useContextMenu();
  const [editor, setEditor] = useState<{ left: number; top: number } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const draft = useRef("");
  const saved = useRef("");
  const writes = useRef(Promise.resolve());

  const report = (reason: unknown) => {
    notify({ kind: "text", text: reason instanceof Error ? reason.message : String(reason), icon: "warning" });
  };
  const persist = (value: string | null) => {
    if (!sessionId) return Promise.reject(new Error("No conversation"));
    const next = writes.current.catch(() => undefined).then(async () => {
      await saveBookmark(sessionId, row, value);
      saved.current = value ?? "";
    });
    writes.current = next;
    return next;
  };
  const flush = async () => {
    await writes.current.catch(() => undefined);
    if (draft.current !== saved.current) await persist(draft.current);
  };
  const close = () => {
    void flush().then(() => {
      if (draft.current !== saved.current) { close(); return; }
      const restoreFocus = panel.current?.contains(document.activeElement);
      setEditor(null);
      if (restoreFocus) trigger.current?.focus();
    }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  };

  useEffect(() => {
    if (!editor) return;
    const timer = window.setTimeout(() => {
      void flush().then(() => setError("")).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [editor, note]);

  useEffect(() => {
    if (!editor) return;
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); close(); }
    };
    const scroll = (event: Event) => {
      if (scrollAffectsAnchor(trigger.current, event.target)) close();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
      // Leaving a conversation must also save the last keystrokes.
      void flush().catch(report);
    };
  }, [editor]);

  return <>
    <button ref={trigger} type="button" aria-label={t("More message actions")} aria-haspopup="menu" data-tip={t("More message actions")} disabled={busy || !sessionId}
      onClick={async () => {
        if (editor) { close(); return; }
        const anchor = trigger.current;
        if (!sessionId || !anchor) return;
        setBusy(true);
        try {
          const bookmark = (await fetchBookmarks(sessionId)).find((item) => item.row === row);
          const rect = anchor.getBoundingClientRect();
          menu.openAt(rect.left, rect.bottom, [
            {
              label: t("Bookmark"), icon: "ph-bookmark-simple",
              onSelect: () => {
                setBusy(true);
                void (bookmark ? Promise.resolve() : persist("")).then(() => {
                  draft.current = saved.current = bookmark?.note ?? "";
                  setNote(draft.current);
                  setError("");
                  const point = anchor.getBoundingClientRect();
                  setEditor({ left: Math.max(8, Math.min(point.left, window.innerWidth - 288)), top: Math.max(8, Math.min(point.bottom + 6, window.innerHeight - 192)) });
                }).catch(report).finally(() => setBusy(false));
              },
            },
            ...(bookmark ? [{ label: t("Remove bookmark"), icon: "ph-bookmark-simple-slash", onSelect: () => {
              setBusy(true);
              void persist(null).catch(report).finally(() => setBusy(false));
            } }] : []),
          ], anchor);
        } catch (reason) { report(reason); }
        finally { setBusy(false); }
      }}
    ><i className="ph ph-dots-three" aria-hidden="true" /></button>
    {menu.element}
    {editor ? createPortal(
      <div ref={panel} className="bookmark-popover" style={editor} role="dialog" aria-label={t("Bookmark note")}>
        <div className="bookmark-popover-head">
          <i className="ph ph-bookmark-simple" aria-hidden="true" />
          <button className="flat" onClick={close} aria-label={t("Close")}><i className="ph ph-x" aria-hidden="true" /></button>
        </div>
        <textarea autoFocus className="ui-field" rows={5} maxLength={20000} aria-label={t("Bookmark note")} value={note} onChange={(event) => {
          draft.current = event.target.value;
          setNote(event.target.value);
        }} placeholder={t("Note…")} />
        {error ? <p role="alert">{error}</p> : null}
      </div>, document.body,
    ) : null}
  </>;
}
