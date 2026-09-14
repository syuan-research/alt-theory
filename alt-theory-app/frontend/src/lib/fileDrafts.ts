/**
 * Drafts that outlive their surface (owner ruling 2026-09-15): switching
 * rails or sessions never blocks and never loses an unsaved edit — the text
 * waits here, keyed by session + root + path, and the editor restores it on
 * mount. Memory only: an app restart drops everything (accepted boundary);
 * a draft dies by saving, explicit discard, or that restart — nothing else.
 */
const drafts = new Map<string, string>();

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
