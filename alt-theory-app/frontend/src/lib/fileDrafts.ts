/**
 * Unsaved editor text (owner ruling 2026-09-28: edits save themselves a
 * second after typing stops, and at once on leaving). A draft lives here,
 * keyed by session + root + path, only until its write lands, so a write
 * still in flight — or one that failed — outlives the editor: reopening the
 * file restores the text and retries. Memory only: an app restart drops
 * everything (accepted boundary, at most the last second of typing).
 */
const drafts = new Map<string, string>();
/** One write chain per file, so writes land in typing order. */
const writing = new Map<string, Promise<unknown>>();

export function draftKey(
  sessionId: string | null,
  root: string,
  path: string
): string {
  return `${sessionId ?? ""}|${root}|${path}`;
}

export function getDraft(key: string): string | null {
  return drafts.get(key) ?? null;
}

export function setDraft(key: string, value: string): void {
  drafts.set(key, value);
}

export function clearDraft(key: string): void {
  drafts.delete(key);
}

/** Settles once every write queued for the key has; a load waits on this
 *  so it never reads the disk from before our own write. */
export function afterWrites(key: string): Promise<unknown> {
  return (writing.get(key) ?? Promise.resolve()).catch(() => undefined);
}

/** Write the key's current draft once every earlier write for the key has
 *  settled. Resolves null when there is nothing to write; on success the
 *  draft clears unless newer text arrived during the write; on failure it
 *  stays (the caller shows why; reopening retries). */
export function flushDraft<T>(
  key: string,
  write: (text: string) => Promise<T>
): Promise<{ text: string; result: T } | null> {
  const next = (writing.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      const text = drafts.get(key);
      if (text === undefined) return null;
      const result = await write(text);
      if (drafts.get(key) === text) drafts.delete(key);
      return { text, result };
    });
  writing.set(key, next);
  const settle = () => {
    if (writing.get(key) === next) writing.delete(key);
  };
  next.then(settle, settle);
  return next;
}
