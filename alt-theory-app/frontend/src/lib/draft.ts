/**
 * Drafts (M2, state-architecture plan 2026-09-24): what the user is writing
 * in a conversation — text and staged files, plus, for the new-conversation
 * draft, the settings it will be created with. One per conversation key (a
 * session id, or NEW_DRAFT), wherever the conversation is displayed.
 *
 * Lifetime: kept on this device across switching, reconnects and restarts
 * (localStorage — the browser already scopes it per server origin; the
 * account is part of the key here). A draft ends only by being sent, its
 * conversation being deleted or leaving the list, or signing out. There is
 * no eviction: unsent text is never dropped to make room — a failed write
 * is reported instead.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { NewConversationSettings } from "../api/types";

export const NEW_DRAFT = "new";

export interface Draft {
  text: string;
  attachments: string[];
  /** New-conversation draft only: what the user chose on that screen. */
  settings?: NewConversationSettings;
  /** New-conversation draft only: the knowledge/role/soul/instruction of the
   *  conversation New was pressed in; the user's own choices win. */
  inherited?: NewConversationSettings;
}

const EMPTY: Draft = { text: "", attachments: [] };
const PREFIX = "alt-theory:draft:";
const WRITE_DELAY_MS = 400;

/** null until the account is known: nothing is read or written before. */
let scope: string | null = null;
const drafts = new Map<string, Draft>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const failed = new Set<string>();
const listeners = new Set<() => void>();

function storageKey(key: string): string {
  return `${PREFIX}${scope}:${key}`;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function hasKeys(value: object | undefined): boolean {
  return Boolean(value && Object.keys(value).length);
}

function isEmpty(draft: Draft): boolean {
  return !draft.text && !draft.attachments.length && !hasKeys(draft.settings) && !hasKeys(draft.inherited);
}

function load(key: string): Draft {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      attachments: Array.isArray(parsed.attachments)
        ? parsed.attachments.filter((path): path is string => typeof path === "string")
        : [],
      ...(parsed.settings && typeof parsed.settings === "object" ? { settings: parsed.settings } : {}),
      ...(parsed.inherited && typeof parsed.inherited === "object" ? { inherited: parsed.inherited } : {}),
    };
  } catch {
    return EMPTY;
  }
}

function write(key: string): void {
  const timer = timers.get(key);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(key);
  if (scope === null) return;
  const draft = drafts.get(key) ?? EMPTY;
  try {
    if (isEmpty(draft)) localStorage.removeItem(storageKey(key));
    else localStorage.setItem(storageKey(key), JSON.stringify(draft));
    if (failed.delete(key)) notify();
  } catch {
    // Quota or storage off: the draft stays in memory for this run, and the
    // editor says it is not saved on this device.
    if (!failed.has(key)) {
      failed.add(key);
      notify();
    }
  }
}

/** Write every pending draft now (page hide, scope change). */
export function flushDrafts(): void {
  for (const key of [...timers.keys()]) write(key);
}

if (typeof window !== "undefined") window.addEventListener("pagehide", flushDrafts);

/** The account the drafts belong to ("local" for the local form). */
export function setDraftScope(next: string): void {
  if (next === scope) return;
  flushDrafts();
  scope = next;
  drafts.clear();
  failed.clear();
  notify();
}

export function draftsReady(): boolean {
  return scope !== null;
}

export function readDraft(key: string): Draft {
  if (scope === null) return EMPTY;
  let draft = drafts.get(key);
  if (!draft) {
    draft = load(key);
    drafts.set(key, draft);
  }
  return draft;
}

export function updateDraft(key: string, change: (draft: Draft) => Draft): void {
  if (scope === null) return;
  const current = readDraft(key);
  const next = change(current);
  if (next === current) return;
  drafts.set(key, next);
  const timer = timers.get(key);
  if (timer !== undefined) clearTimeout(timer);
  timers.set(key, setTimeout(() => write(key), WRITE_DELAY_MS));
  notify();
}

/**
 * Text joins what is typed on its own line — ahead of it for what a send
 * hands back, after it for a queued message taken back to edit; paths join
 * the staged ones.
 */
export function appendToDraft(
  key: string,
  text: string,
  paths: string[] = [],
  place: "before" | "after" = "before",
): void {
  updateDraft(key, (draft) => {
    const joined = place === "before" ? appendDraft(text, draft.text) : appendDraft(draft.text, text);
    const added = paths.filter((path) => path && !draft.attachments.includes(path));
    if (joined === draft.text && !added.length) return draft;
    return { ...draft, text: joined, attachments: [...draft.attachments, ...added] };
  });
}

/** A conversation that is gone takes its draft with it (no delay). */
export function discardDraft(key: string): void {
  if (scope === null) return;
  drafts.set(key, EMPTY);
  write(key);
  notify();
}

/**
 * Drop the drafts of conversations no longer in the list. `listed` must be
 * the complete list of this account's conversations. The new-conversation
 * draft always stays, and so does any draft opened this run — a list read
 * just before a conversation was created must not take its draft.
 */
export function pruneDrafts(listed: ReadonlySet<string>): void {
  if (scope === null) return;
  const prefix = `${PREFIX}${scope}:`;
  const gone: string[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const name = localStorage.key(index);
      if (!name?.startsWith(prefix)) continue;
      const key = name.slice(prefix.length);
      if (key !== NEW_DRAFT && !listed.has(key) && !drafts.has(key)) gone.push(key);
    }
  } catch {
    return;
  }
  for (const key of gone) discardDraft(key);
}

/** Signing out: every draft of the account goes. */
export function clearDraftScope(): void {
  if (scope === null) return;
  const prefix = `${PREFIX}${scope}:`;
  try {
    const names: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const name = localStorage.key(index);
      if (name?.startsWith(prefix)) names.push(name);
    }
    for (const name of names) localStorage.removeItem(name);
  } catch {
    /* nothing more to do */
  }
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  drafts.clear();
  failed.clear();
  notify();
}

/** The last write of this draft failed (it lives only in memory). */
export function draftUnsaved(key: string): boolean {
  return failed.has(key);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One conversation's draft, and whether its last write failed. */
export function useDraft(key: string): { draft: Draft; saveFailed: boolean; ready: boolean } {
  const draft = useSyncExternalStore(subscribe, useCallback(() => readDraft(key), [key]));
  const saveFailed = useSyncExternalStore(subscribe, useCallback(() => draftUnsaved(key), [key]));
  const ready = useSyncExternalStore(subscribe, draftsReady);
  return { draft, saveFailed, ready };
}

/**
 * Text recalled from the queue joins whatever is already typed, on its own
 * line; an empty side contributes nothing.
 */
export function appendDraft(current: string, text: string): string {
  return [current, text].filter((part) => part.trim()).join("\n");
}
