/**
 * The unsaved-draft leave guard (owner rulings 2026-09-15): a dirty editor
 * blocks the FIRST leave attempt with an inline red bar; any further leave
 * attempt saves and proceeds — the user is never trapped. Rail and session
 * switches bypass the guard entirely (lib/fileDrafts keeps the text), so
 * only the two direct exits from the editor surface go through guardLeave:
 * opening another file in the tree, and closing/leaving the pane.
 */
export interface GuardEditor {
  key: string;
  isDirty: () => boolean;
  /** Returns true when the draft reached disk (409 counts as failure). */
  save: () => Promise<boolean>;
  discard: () => void;
}

let editor: GuardEditor | null = null;
let armedKey: string | null = null;
let pendingLeave: (() => void) | null = null;
const armedListeners = new Set<(armed: string | null) => void>();

function emit(): void {
  for (const listener of armedListeners) listener(armedKey);
}

/** The mounted editor registers itself; null on unmount. One slot — only
 *  one file editor is ever mounted at a time. */
export function registerGuardEditor(next: GuardEditor | null): void {
  editor = next;
  armedKey = null;
  pendingLeave = null;
  emit();
}

/** Subscribe to which file's leave is currently blocked (null = none). */
export function onArmedChange(fn: (armed: string | null) => void): () => void {
  armedListeners.add(fn);
  fn(armedKey);
  return () => {
    armedListeners.delete(fn);
  };
}

/** Wrap a leave action: clean editor → straight through; dirty → block the
 *  first attempt, save-and-leave on any further one (to whatever target the
 *  user just clicked). A failed save (save conflict) aborts the leave; the
 *  conflict bar takes over. */
export async function guardLeave(action: () => void): Promise<void> {
  if (!editor || !editor.isDirty()) {
    action();
    return;
  }
  if (armedKey === editor.key) {
    armedKey = null;
    pendingLeave = null;
    emit();
    const ok = await editor.save();
    if (ok) action();
    return;
  }
  armedKey = editor.key;
  pendingLeave = action;
  emit();
}

/** The red bar's two buttons: save (or discard), then finish the leave. */
export function resolveArmed(saveFirst: boolean): void {
  const action = pendingLeave;
  armedKey = null;
  pendingLeave = null;
  emit();
  if (!action) return;
  if (saveFirst) {
    void editor?.save().then((ok) => {
      if (ok) action();
    });
  } else {
    editor?.discard();
    action();
  }
}

/** Typing again means "stay": the red bar clears, the draft remains. */
export function clearArmed(): void {
  if (armedKey === null) return;
  armedKey = null;
  pendingLeave = null;
  emit();
}
