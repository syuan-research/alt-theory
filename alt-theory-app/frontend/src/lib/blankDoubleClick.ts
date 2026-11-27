import { useRef, type MouseEvent } from "react";

/**
 * Double-click on a side pane's blank space folds it (owner 2026-11-27).
 * `blank` names the pane's own containers: a double-click that lands on one
 * of them hit no row, control or text. The pane must already have been open
 * at the first press, so a double-click on a collapsed strip (whose single
 * click opens it) does not open and shut it.
 */
export function useFoldOnBlankDoubleClick(open: boolean, fold: () => void, blank: string) {
  const openAtPress = useRef(open);
  return {
    onMouseDown: (event: MouseEvent) => { if (event.detail === 1) openAtPress.current = open; },
    onDoubleClick: (event: MouseEvent) => {
      if (!open || !openAtPress.current || !(event.target instanceof Element) || !event.target.matches(blank)) return;
      // Chrome selects the nearest word on a blank double-click.
      window.getSelection()?.removeAllRanges();
      fold();
    },
  };
}
