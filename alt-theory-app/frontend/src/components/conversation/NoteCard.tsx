import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { scrollAffectsAnchor } from "@/components/shell/ContextMenu";
import { t } from "@/i18n";

/** Where a note card opens: under `rect`, kept on screen. */
export function noteCardAt(rect: { left: number; bottom: number }) {
  return {
    left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)),
    top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 224)),
  };
}

/**
 * The one card for a reader's note (owner 2026-11-26): a bookmark's note and
 * a mark's note open the same card, so whatever it gains later (tags) both
 * gain. The caller owns the text and its saving; the card closes on Escape,
 * a click outside, a scroll that moves its anchor, or a resize.
 */
export function NoteCard({ at, head, label, value, onChange, onClose, error, anchor, inside }: {
  at: { left: number; top: number };
  /** Leading part of the head: what this note belongs to. */
  head: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  error?: string;
  anchor: HTMLElement | null;
  /** Clicks on these do not count as outside (e.g. the control that opened the card). */
  inside?: (target: Node) => boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const within = useRef(inside);
  within.current = inside;

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !within.current?.(target)) close.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); close.current(); }
    };
    const scroll = (event: Event) => {
      if (scrollAffectsAnchor(anchor, event.target)) close.current();
    };
    const resize = () => close.current();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [anchor]);

  return createPortal(
    <div ref={panel} className="bookmark-popover" style={at} role="dialog" aria-label={label}>
      <div className="bookmark-popover-head">
        <div className="bookmark-popover-title">{head}</div>
        <button type="button" className="flat" onClick={onClose} aria-label={t("Close")}><i className="ph ph-x" aria-hidden="true" /></button>
      </div>
      <textarea autoFocus className="ui-field" rows={5} maxLength={20000} aria-label={label} value={value}
        onChange={(event) => onChange(event.target.value)} placeholder={t("Note…")} />
      {error ? <p role="alert">{error}</p> : null}
    </div>,
    document.body,
  );
}
