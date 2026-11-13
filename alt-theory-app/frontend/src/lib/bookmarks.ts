import { useCallback, useSyncExternalStore } from "react";
import { fetchBookmarks, saveBookmark, type NodeBookmark } from "@/api/sessions";

const empty: NodeBookmark[] = [];
const snapshots = new Map<string, NodeBookmark[]>();
const loading = new Map<string, Promise<NodeBookmark[]>>();
const listeners = new Map<string, Set<() => void>>();
const saving = new Map<string, Promise<unknown>>();

function publish(sessionId: string, bookmarks: NodeBookmark[]) {
  snapshots.set(sessionId, bookmarks);
  listeners.get(sessionId)?.forEach((listener) => listener());
}

export function loadBookmarks(sessionId: string): Promise<NodeBookmark[]> {
  const cached = snapshots.get(sessionId);
  if (cached) return Promise.resolve(cached);
  let pending = loading.get(sessionId);
  if (!pending) {
    pending = fetchBookmarks(sessionId).then((bookmarks) => {
      publish(sessionId, bookmarks);
      return bookmarks;
    }).finally(() => loading.delete(sessionId));
    loading.set(sessionId, pending);
  }
  return pending;
}

/** One collection read per conversation, shared by its visible nodes and panes. */
export function useBookmarks(sessionId: string | null) {
  const subscribe = useCallback((listener: () => void) => {
    if (!sessionId) return () => undefined;
    let set = listeners.get(sessionId);
    if (!set) { set = new Set(); listeners.set(sessionId, set); }
    set.add(listener);
    return () => { set.delete(listener); };
  }, [sessionId]);
  const snapshot = useCallback(() => sessionId ? snapshots.get(sessionId) ?? empty : empty, [sessionId]);
  return useSyncExternalStore(subscribe, snapshot);
}

/** Serialize collection responses so an older save cannot hide a newer corner marker. */
export function setBookmark(sessionId: string, row: string, note: string | null): Promise<void> {
  const next = (saving.get(sessionId) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    await loadBookmarks(sessionId);
    publish(sessionId, await saveBookmark(sessionId, row, note));
  });
  saving.set(sessionId, next);
  return next;
}
