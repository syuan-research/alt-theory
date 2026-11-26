import { isImagePath, isHtmlPath } from "../../../shared/artifact-types";
import type { PreviewMode } from "./fileContent";
/**
 * What a side view shows beyond its list, and how it moves (WP-3,
 * state-architecture plan 2026-09-24). One owner: ShellContext holds a
 * `PaneState` and changes it only through `navigate`.
 *
 * A target names the conversation it belongs to and is drawn against that
 * conversation, whatever the center shows meanwhile: switching the center
 * leaves an open file, change or side conversation as it was. Nothing here
 * says "right pane" — a tab or a split could hold the same targets.
 *
 * Files are not targets (owner 2026-11-25): a file opened from Changes, from
 * Files or from a link in a conversation becomes an open file instead, and
 * the entry it came from goes on showing its list.
 */

/** The side view's rails. Records and provenance are researcher-only. */
export type RailKey = "chats" | "changes" | "workspace" | "open" | "marks" | "records" | "provenance";

export type ViewTarget = (
  /** A local interactive page; it can be opened before a conversation exists. */
  | { kind: "page"; sessionId: string | null; url: string; image?: boolean }
  /** A conversation of the family, shown on its own (BTW, branch, subagent). */
  | { kind: "conversation"; sessionId: string }
  /** A file of a conversation: its managed workspace, or a working folder
   *  (`path` = "<folderId>/<path in folder>"). */
  | { kind: "file"; sessionId: string; root: "workspace" | "working"; path: string; absolutePath?: string }
  | { kind: "file"; sessionId: null; draftPrimaryDir: string | null; root: "working"; path: string; absolutePath?: string }
  | { kind: "file"; sessionId: string | null; draftPrimaryDir?: string | null; root: "local"; path: string }
  /** A file a conversation changed; `title` is its display path. */
  | { kind: "change"; sessionId: string; path: string; title: string }
  /** A record of a conversation (researcher Records rail). */
  | { kind: "record"; sessionId: string; root: "records" | "workspace"; path: string }) & { revision?: number };

export type FileTarget = Extract<ViewTarget, { kind: "file" }>;
export type ChangeTarget = Extract<ViewTarget, { kind: "change" }>;

/**
 * One file of the open-files view (owner 2026-11-25). The files opened from
 * Changes and Files, and from links in a conversation, are collected there and
 * switched at the top of the viewing area, while an entry goes on showing
 * its list. A file is one open file whichever entry it came from, and its
 * last entry decides what it shows: the change for Changes, the file otherwise.
 */
export interface OpenFile {
  /** What makes it the same file: its absolute path, else its address. */
  key: string;
  /** Where the current file lives; null when only a change exists (outside every root). */
  file: FileTarget | null;
  /** Set while it was last opened from Changes. */
  change: ChangeTarget | null;
  /** How many times it was opened; a reopen returns the view to its entry's first view. */
  opened: number;
  /** Bumped when the file on show is opened again, to reload an image or a page. */
  revision: number;
  /** The view on show; a reopen returns it to its entry's first view. */
  view: PreviewMode;
}

/** The rail a target opens on; a file or a change opens in the open files. */
export function railOf(target: ViewTarget): RailKey {
  switch (target.kind) {
    case "page":
      return "workspace";
    case "conversation":
      return "chats";
    case "file":
      return "open";
    case "change":
      return "open";
    case "record":
      return "records";
    default: {
      const unhandled: never = target;
      return unhandled;
    }
  }
}

/** The header line; a conversation says what it is in its own words. */
export function targetTitle(target: ViewTarget): string | undefined {
  switch (target.kind) {
    case "page":
      return target.url;
    case "conversation":
      return undefined;
    case "file":
      return target.root === "working" ? target.path.slice(target.path.indexOf("/") + 1) : target.path;
    case "change":
      return target.title;
    case "record":
      return target.path;
    default: {
      const unhandled: never = target;
      return unhandled;
    }
  }
}

/** A stable string for view memory (scroll, preview mode). */
export function targetKey(target: ViewTarget): string {
  switch (target.kind) {
    case "page":
      return `page:${target.sessionId}:${target.url}`;
    case "conversation":
      return `conversation:${target.sessionId}`;
    case "file":
      return `file:${target.sessionId === null ? `draft:${target.draftPrimaryDir}` : target.sessionId}:${target.root}:${target.path}`;
    case "change":
      return `change:${target.sessionId}:${target.path}`;
    case "record":
      return `record:${target.sessionId}:${target.root}:${target.path}`;
    default: {
      const unhandled: never = target;
      return unhandled;
    }
  }
}

export interface PaneState {
  /** The open rail; null = collapsed. */
  rail: RailKey | null;
  /** What the open rail shows beyond its list; always one of that rail's targets. */
  target: ViewTarget | null;
  /** What each rail showed last, so a collapse or a rail switch forgets nothing. */
  lastByRail: Partial<Record<RailKey, ViewTarget | null>>;
  /** Where the user was before a target on another rail took over; Back returns there. */
  returnTo: { rail: RailKey; target: ViewTarget | null } | null;
  /** The rail open last: dragging or keying the collapsed pane open reopens it. */
  lastRail: RailKey;
  /** The open files, oldest first; they outlive a collapse and a rail switch. */
  openFiles: OpenFile[];
  /** `OpenFile.key` of the file on show; null when none is open. */
  activeFile: string | null;
}

export type PaneAction =
  | { type: "open"; target: ViewTarget; view?: PreviewMode }
  /** Back: to where the user came from, else to the rail's list. */
  | { type: "back" }
  /** Show a rail's list, remembering where the user came from. */
  | { type: "rail"; rail: RailKey }
  /** A rail button: open it with what it showed last, or collapse it. */
  | { type: "toggle"; rail: RailKey }
  | { type: "collapse" }
  /** Open the collapsed pane on the rail open last, as its button would. */
  | { type: "reopen" }
  /** Show a rail's list without a way back (reveal in the file tree). */
  | { type: "show"; rail: RailKey }
  /** These conversations are gone: nothing of theirs stays on show or comes back. */
  | { type: "forget"; sessionIds: string[] }
  | { type: "closeFile"; key: string }
  | { type: "activateFile"; key: string }
  | { type: "fileView"; key: string; view: PreviewMode }
  /** The user renamed a file: an open copy follows it, in place. */
  | { type: "renameFile"; from: FileTarget; to: FileTarget }
  /** Another workspace comes on show: its pane, or a fresh one on the rail open now. */
  | { type: "restore"; pane: PaneState | null };

export const INITIAL_PANE: PaneState = {
  rail: null,
  target: null,
  lastByRail: {},
  returnTo: null,
  lastRail: "workspace",
  openFiles: [],
  activeFile: null,
};

function place(state: PaneState, rail: RailKey | null, target: ViewTarget | null, returnTo: PaneState["returnTo"]): PaneState {
  return {
    rail,
    target,
    returnTo,
    lastByRail: rail ? { ...state.lastByRail, [rail]: target } : state.lastByRail,
    lastRail: rail ?? state.lastRail,
    openFiles: state.openFiles,
    activeFile: state.activeFile,
  };
}

/** Two addresses are the same file when they name the same absolute path; an
 *  address without one is its own identity. */
function fileIdentity(target: FileTarget | ChangeTarget): string {
  const absolute = target.kind === "change" ? target.path : "absolutePath" in target ? target.absolutePath : undefined;
  if (absolute) return `path:${absolute.replace(/\\/g, "/")}`;
  if (target.kind === "change") return `change:${target.sessionId}:${target.path}`;
  return `file:${target.sessionId === null ? `draft:${target.draftPrimaryDir}` : target.sessionId}:${target.root}:${target.path}`;
}

/** A file or a change becomes an open file on show; one already open is reused. */
function openFile(state: PaneState, target: FileTarget | ChangeTarget, view?: PreviewMode): PaneState {
  const key = fileIdentity(target);
  const at = state.openFiles.findIndex((open) => open.key === key);
  const previous = at >= 0 ? state.openFiles[at] : null;
  const onShow = previous !== null && state.rail === "open" && state.activeFile === key;
  const media = isImagePath(target.path) || isHtmlPath(target.path);
  const open: OpenFile = {
    key,
    file: target.kind === "file" ? target : previous?.file ?? null,
    // Opened as a file, it shows the file: the change belongs to an opening from Changes.
    change: target.kind === "change" ? target : null,
    opened: (previous?.opened ?? 0) + 1,
    revision: (previous?.revision ?? 0) + (onShow && media ? 1 : 0),
    view: view ?? (target.kind === "change" ? "diff" : "rendered"),
  };
  const openFiles = previous ? state.openFiles.map((item) => (item.key === key ? open : item)) : [...state.openFiles, open];
  return { ...place(state, "open", null, null), openFiles, activeFile: key };
}

/** The one transition of the side view. */
export function navigate(state: PaneState, action: PaneAction): PaneState {
  switch (action.type) {
    case "open": {
      if (action.target.kind === "file" || action.target.kind === "change") {
        return openFile(state, action.target, action.view);
      }
      const rail = railOf(action.target);
      if (state.rail === rail && state.target && targetKey(state.target) === targetKey(action.target)) {
        if (action.target.kind !== "page" && !("path" in action.target && (isImagePath(action.target.path) || isHtmlPath(action.target.path)))) return state;
        return place(state, rail, { ...action.target, revision: (state.target.revision ?? 0) + 1 }, state.returnTo);
      }
      const leaving = state.rail && (state.rail !== rail || (action.target.kind === "page" && state.target?.kind !== "page"))
        ? { rail: state.rail, target: state.target } : state.returnTo;
      return place(state, rail, action.target, leaving);
    }
    case "back": {
      if (state.rail === "open") {
        // Back returns to the entry the file on show was opened from.
        const active = state.openFiles.find((open) => open.key === state.activeFile);
        return place(state, active?.change ? "changes" : "workspace", null, null);
      }
      return state.returnTo
        ? place(state, state.returnTo.rail, state.returnTo.target, null)
        : place(state, state.rail, null, null);
    }
    case "rail": {
      const leaving = state.rail && state.rail !== action.rail ? { rail: state.rail, target: state.target } : state.returnTo;
      return place(state, action.rail, null, leaving);
    }
    case "toggle":
      return state.rail === action.rail
        ? place(state, null, null, null)
        : place(state, action.rail, state.lastByRail[action.rail] ?? null, null);
    case "collapse":
      return place(state, null, null, null);
    case "reopen":
      return state.rail ? state : place(state, state.lastRail, state.lastByRail[state.lastRail] ?? null, null);
    case "show":
      return place(state, action.rail, null, state.returnTo);
    case "forget": {
      const gone = (target: ViewTarget | null | undefined) =>
        Boolean(target?.sessionId && action.sessionIds.includes(target.sessionId));
      const lastByRail = Object.fromEntries(
        Object.entries(state.lastByRail).map(([rail, target]) => [rail, gone(target) ? null : target]),
      ) as PaneState["lastByRail"];
      const openFiles = state.openFiles.filter((open) => !gone(open.file) && !gone(open.change));
      return {
        ...state,
        target: gone(state.target) ? null : state.target,
        lastByRail,
        returnTo: state.returnTo && gone(state.returnTo.target) ? { ...state.returnTo, target: null } : state.returnTo,
        openFiles,
        activeFile: openFiles.some((open) => open.key === state.activeFile)
          ? state.activeFile : (openFiles.at(-1)?.key ?? null),
      };
    }
    case "closeFile": {
      const at = state.openFiles.findIndex((open) => open.key === action.key);
      if (at < 0) return state;
      const openFiles = state.openFiles.filter((open) => open.key !== action.key);
      // The file that took the closed one's place goes on show.
      const activeFile = state.activeFile === action.key
        ? (openFiles[Math.min(at, openFiles.length - 1)]?.key ?? null)
        : state.activeFile;
      return { ...state, openFiles, activeFile };
    }
    case "activateFile":
      return state.openFiles.some((open) => open.key === action.key)
        ? { ...place(state, "open", null, null), activeFile: action.key }
        : state;
    case "restore":
      return action.pane ?? { ...INITIAL_PANE, rail: state.rail, lastRail: state.lastRail };
    case "renameFile": {
      const from = fileIdentity(action.from);
      const key = fileIdentity(action.to);
      return {
        ...state,
        openFiles: state.openFiles.map((open) => (open.key === from ? { ...open, key, file: action.to } : open)),
        activeFile: state.activeFile === from ? key : state.activeFile,
      };
    }
    case "fileView":
      return {
        ...state,
        openFiles: state.openFiles.map((open) => (open.key === action.key ? { ...open, view: action.view } : open)),
      };
    default: {
      const unhandled: never = action;
      return unhandled;
    }
  }
}
