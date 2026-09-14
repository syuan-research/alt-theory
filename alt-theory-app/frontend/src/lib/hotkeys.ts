import { useEffect } from "react";

/**
 * The app's one hotkey table (owner ruling 2026-09-15: a unified table, no
 * config surface yet — a future settings page only swaps this data source,
 * and Electron menu accelerators should be generated from it too).
 * "mod" = Cmd on macOS, Ctrl elsewhere. The global listener only swallows a
 * key when a handler is actually registered, so browser defaults elsewhere
 * stay untouched.
 */
const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent);

export const HOTKEYS = {
  save: { combo: "mod+s" },
} as const;

export type HotkeyName = keyof typeof HOTKEYS;

type Handler = () => void;
const handlers = new Map<HotkeyName, Set<Handler>>();

function dispatch(event: KeyboardEvent): void {
  for (const [name, spec] of Object.entries(HOTKEYS) as [HotkeyName, { combo: string }][]) {
    const [mod, key] = spec.combo.split("+");
    const modActive =
      mod === "mod" ? (IS_MAC ? event.metaKey : event.ctrlKey) : false;
    if (!modActive || event.key.toLowerCase() !== key) continue;
    const set = handlers.get(name);
    if (!set || set.size === 0) continue;
    event.preventDefault();
    for (const handler of set) handler();
    return;
  }
}

let installed = false;
function install(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("keydown", dispatch);
}

/** Register a handler for a table entry while the calling component lives;
 *  pass null to unregister (no handler = the key falls through). */
export function useHotkey(name: HotkeyName, handler: Handler | null): void {
  useEffect(() => {
    if (!handler) return;
    install();
    const set = handlers.get(name) ?? new Set<Handler>();
    set.add(handler);
    handlers.set(name, set);
    return () => {
      set.delete(handler);
      if (set.size === 0) handlers.delete(name);
    };
  }, [name, handler]);
}
