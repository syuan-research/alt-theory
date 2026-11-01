export type Column = "left" | "center" | "right";

export const COLUMN_ROOT: Record<Column, string> = {
  left: "aside.left",
  center: "main.center",
  right: "aside.right",
};

/** One bounded history; consumers query it, never maintain their own attention. */
export class AttentionHistory {
  private recent: { column: Column; scope: string | null }[] = [];
  private scopes: Record<Column, string | null> = { left: null, center: null, right: null };

  note(column: Column): void {
    this.recent = [
      { column, scope: this.scopes[column] },
      ...this.recent.filter((entry) => entry.column !== column),
    ];
  }

  setScope(column: Column, scope: string | null): void {
    this.scopes[column] = scope;
  }

  forget(column: Column): void {
    this.recent = this.recent.filter((entry) => entry.column !== column);
  }

  latest(columns: readonly Column[] = ["left", "center", "right"], current = false): Column | null {
    return this.recent.find((entry) => columns.includes(entry.column)
      && (!current || entry.scope === this.scopes[entry.column]))?.column ?? null;
  }
}

export const attention = new AttentionHistory();

function columnOf(target: EventTarget | null): Column | null {
  if (!(target instanceof Element)) return null;
  if (target.closest('.pane-resizer, [data-attention-ignore], [aria-modal="true"]')) return null;
  // Conversation rows point at the content they open, not the rail they occupy.
  const hit = target.closest("[data-find-attention], aside.left, main.center, aside.right");
  if (!hit) return null;
  const marked = (hit as HTMLElement).dataset.findAttention;
  if (marked === "left" || marked === "center" || marked === "right") return marked;
  return hit.matches("aside.left") ? "left" : hit.matches("main.center") ? "center" : "right";
}

/** Installed once by Shell; scroll restoration and autofocus never count. */
export function trackAttention(): () => void {
  const note = (event: Event) => {
    const column = columnOf(event.target);
    if (column) attention.note(column);
  };
  const key = (event: KeyboardEvent) => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey) note(event);
  };
  document.addEventListener("pointerdown", note, true);
  document.addEventListener("keydown", key, true);
  document.addEventListener("wheel", note, { capture: true, passive: true });
  return () => {
    document.removeEventListener("pointerdown", note, true);
    document.removeEventListener("keydown", key, true);
    document.removeEventListener("wheel", note, true);
  };
}
