import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadBookmarks, setBookmark, useBookmarks } from "@/lib/bookmarks";
import { useConversationContext } from "@/context/ConversationContext";
import { scrollAffectsAnchor, useContextMenu } from "@/components/shell/ContextMenu";
import { t } from "@/i18n";

function BookmarkGlyph({ marked }: { marked: boolean }) {
  return <svg className={`bookmark-glyph${marked ? " is-bookmarked" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 3h12v18l-6-4-6 4z" fill={marked ? "currentColor" : "none"} stroke={marked ? "none" : "currentColor"} strokeWidth="1.5" strokeLinejoin="round" />
  </svg>;
}

/** Both entry points open this one note card; saved nodes also get a corner marker. */
export function BookmarkAction({ row }: { row: string }) {
  const { sessionId, notify } = useConversationContext();
  const bookmarks = useBookmarks(sessionId);
  const marked = bookmarks.some((item) => item.row === row);
  const retained = useRef(marked);
  retained.current = marked;
  const menu = useContextMenu();
  const [editor, setEditor] = useState<{ left: number; top: number } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bubble, setBubble] = useState<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const corner = useRef<HTMLButtonElement>(null);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const draft = useRef("");
  const saved = useRef("");
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    if (marked) setBubble(trigger.current?.closest(".msg")?.querySelector<HTMLElement>(".bubble") ?? null);
  }, [marked]);

  const report = (reason: unknown) => {
    notify({ kind: "text", text: reason instanceof Error ? reason.message : String(reason), icon: "warning" });
  };
  const persist = (value: string | null) => {
    if (!sessionId) return Promise.reject(new Error("No conversation"));
    const next = writes.current.catch(() => undefined).then(async () => {
      await setBookmark(sessionId, row, value);
      retained.current = value !== null;
      if (value !== null) saved.current = value;
    });
    writes.current = next;
    return next;
  };
  const flush = async () => {
    await writes.current.catch(() => undefined);
    if (retained.current && draft.current !== saved.current) await persist(draft.current);
  };
  const close = () => {
    void flush().then(() => {
      if (retained.current && draft.current !== saved.current) { close(); return; }
      const restoreFocus = panel.current?.contains(document.activeElement);
      setEditor(null);
      if (restoreFocus) (anchor.current?.isConnected ? anchor.current : trigger.current)?.focus();
    }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  };
  const openEditor = async (source: HTMLButtonElement) => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const bookmark = (await loadBookmarks(sessionId)).find((item) => item.row === row);
      if (!bookmark) await persist("");
      draft.current = saved.current = bookmark?.note ?? "";
      setNote(draft.current);
      setError("");
      anchor.current = source;
      const point = source.getBoundingClientRect();
      setEditor({ left: Math.max(8, Math.min(point.left, window.innerWidth - 288)), top: Math.max(8, Math.min(point.bottom + 6, window.innerHeight - 224)) });
    } catch (reason) { report(reason); }
    finally { setBusy(false); }
  };
  const toggle = () => {
    setBusy(true);
    setError("");
    void persist(retained.current ? null : draft.current).catch((reason) =>
      setError(reason instanceof Error ? reason.message : String(reason)),
    ).finally(() => setBusy(false));
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
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target) && !corner.current?.contains(target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); close(); }
    };
    const scroll = (event: Event) => {
      if (scrollAffectsAnchor(anchor.current, event.target)) close();
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
      void flush().catch(report);
    };
  }, [editor]);

  return <>
    <button ref={trigger} type="button" aria-label={t("More message actions")} aria-haspopup="menu" data-tip={t("More message actions")} disabled={busy || !sessionId}
      onClick={async () => {
        if (editor) { close(); return; }
        const source = trigger.current;
        if (!sessionId || !source) return;
        setBusy(true);
        try {
          const bookmark = (await loadBookmarks(sessionId)).find((item) => item.row === row);
          const rect = source.getBoundingClientRect();
          menu.openAt(rect.left, rect.bottom, [
            { label: t("Bookmark"), icon: "ph-bookmark-simple", onSelect: () => void openEditor(source) },
            ...(bookmark ? [{ label: t("Remove bookmark"), icon: "ph-bookmark-simple-slash", onSelect: () => {
              setBusy(true);
              void persist(null).catch(report).finally(() => setBusy(false));
            } }] : []),
          ], source);
        } catch (reason) { report(reason); }
        finally { setBusy(false); }
      }}
    ><i className="ph ph-dots-three" aria-hidden="true" /></button>
    {marked && bubble ? createPortal(
      <button ref={corner} className="bookmark-corner" type="button" aria-label={t("Open bookmark note")} data-tip={t("Bookmark note")} aria-haspopup="dialog" disabled={busy}
        onClick={(event) => { event.stopPropagation(); if (editor) close(); else void openEditor(event.currentTarget); }}>
        <BookmarkGlyph marked />
      </button>, bubble,
    ) : null}
    {menu.element}
    {editor ? createPortal(
      <div ref={panel} className="bookmark-popover" style={editor} role="dialog" aria-label={t("Bookmark note")}>
        <div className="bookmark-popover-head">
          <div className="bookmark-popover-title">
            <button type="button" className="bookmark-toggle" aria-pressed={marked} aria-label={marked ? t("Remove bookmark") : t("Bookmark")} data-tip={marked ? t("Remove bookmark") : t("Bookmark")} disabled={busy} onClick={toggle}>
              <BookmarkGlyph marked={marked} />
            </button>
            <span>{t("Bookmark")}</span>
          </div>
          <button type="button" className="flat" onClick={close} aria-label={t("Close")}><i className="ph ph-x" aria-hidden="true" /></button>
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
