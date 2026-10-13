import { useEffect, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { t } from "@/i18n";
import { copyText } from "@/lib/clipboard";
import { useContextMenu, type ContextMenuItem } from "@/components/shell/ContextMenu";
import {
  COLOR_KINDS,
  addMark,
  isColorMark,
  marksAt,
  recolorMark,
  registerMarksHost,
  removeMarks,
  rowsInRange,
  type MarkKind,
  type TextMark,
} from "@/lib/marks";

const COLOR_NAMES = ["Yellow", "Green", "Orange", "Blue"];

function swatches(onPick: (kind: MarkKind) => void, current?: MarkKind): ContextMenuItem {
  return {
    label: t("Highlight"),
    onSelect: () => undefined,
    swatches: COLOR_KINDS.map((kind, index) => ({
      color: `var(--${kind})`,
      label: t(COLOR_NAMES[index]),
      current: kind === current,
      onSelect: () => onPick(kind),
    })),
  };
}

/** Copy through the page's own copy path (links keep their markdown), with
 *  the selection put back first in case opening the menu dropped it. */
function copyRange(range: Range): void {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  if (!document.execCommand("copy")) void copyText(range.toString());
}

/**
 * Reader marks for one conversation pane (center or side): registers the
 * pane so its rows' marks paint, and gives the right-click menu — on a
 * selection: highlight colors, underline, strikethrough, copy; on a mark:
 * recolor, remove. A right-click on neither keeps the default behavior.
 */
export function useMarks(
  ref: RefObject<HTMLElement | null>,
  sessionId: string | null,
  onError: (reason: unknown) => void,
) {
  const menu = useContextMenu();
  useEffect(() => {
    const el = ref.current;
    if (!el || !sessionId) return;
    return registerMarksHost(el, sessionId);
  }, [ref, sessionId]);

  const onContextMenu = (event: ReactMouseEvent) => {
    const host = ref.current;
    if (event.defaultPrevented || !host || !sessionId) return; // a link's own menu
    const selection = window.getSelection();
    const range = selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0).cloneRange() : null;
    if (range && host.contains(range.commonAncestorContainer)) {
      const mark = (kind: MarkKind) => {
        selection?.removeAllRanges();
        addMark(host, sessionId, range, kind).catch(onError);
      };
      const markable = rowsInRange(host, range).length > 0;
      menu.open(event, [
        ...(markable
          ? [
              swatches(mark),
              { label: t("Underline"), icon: "ph-text-underline", onSelect: () => mark("under") },
              { label: t("Strikethrough"), icon: "ph-text-strikethrough", onSelect: () => mark("strike") },
            ]
          : []),
        { label: t("Copy"), icon: "ph-copy", separator: markable, onSelect: () => copyRange(range) },
      ]);
      return;
    }
    const hits = marksAt(host, sessionId, event.clientX, event.clientY);
    if (!hits.length) return;
    const color: TextMark | undefined = hits.find((hit) => isColorMark(hit.kind));
    menu.open(event, [
      ...(color ? [swatches((kind) => recolorMark(sessionId, color, kind).catch(onError), color.kind)] : []),
      {
        label: t("Remove mark"),
        icon: "ph-eraser",
        separator: Boolean(color),
        onSelect: () => removeMarks(sessionId, hits).catch(onError),
      },
    ]);
  };

  return { onContextMenu, menu: menu.element };
}
