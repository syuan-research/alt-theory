/**
 * What a side view shows beyond its list, and how it moves (WP-3,
 * state-architecture plan 2026-09-24). One owner: ShellContext holds a
 * `PaneState` and changes it only through `navigate`.
 *
 * A target names the conversation it belongs to and is drawn against that
 * conversation, whatever the center shows meanwhile: switching the center
 * leaves an open file, change or side conversation as it was. Nothing here
 * says "right pane" — a tab or a split could hold the same targets.
 */

/** The side view's rails. Records, provenance and runtime are researcher-only. */
export type RailKey = "chats" | "changes" | "workspace" | "records" | "provenance" | "runtime";

export type ViewTarget =
  /** A conversation of the family, shown on its own (BTW, Helper, branch, subagent). */
  | { kind: "conversation"; sessionId: string }
  /** A file of a conversation: its managed workspace, or a working folder
   *  (`path` = "<folderId>/<path in folder>"). */
  | { kind: "file"; sessionId: string; root: "workspace" | "working"; path: string }
  /** A file a conversation changed; `title` is its display path. */
  | { kind: "change"; sessionId: string; path: string; title: string };

/** The rail a target opens on. */
export function railOf(target: ViewTarget): RailKey {
  switch (target.kind) {
    case "conversation":
      return "chats";
    case "file":
      return "workspace";
    case "change":
      return "changes";
    default: {
      const unhandled: never = target;
      return unhandled;
    }
  }
}

/** The header line; a conversation says what it is in its own words. */
export function targetTitle(target: ViewTarget): string | undefined {
  switch (target.kind) {
    case "conversation":
      return undefined;
    case "file":
      return target.root === "working" ? target.path.slice(target.path.indexOf("/") + 1) : target.path;
    case "change":
      return target.title;
    default: {
      const unhandled: never = target;
      return unhandled;
    }
  }
}

/** A stable string for view memory (scroll, preview mode). */
export function targetKey(target: ViewTarget): string {
  switch (target.kind) {
    case "conversation":
      return `conversation:${target.sessionId}`;
    case "file":
      return `file:${target.sessionId}:${target.root}:${target.path}`;
    case "change":
      return `change:${target.sessionId}:${target.path}`;
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
}

export type PaneAction =
  | { type: "open"; target: ViewTarget }
  /** Back: to where the user came from, else to the rail's list. */
  | { type: "back" }
  /** Show a rail's list, remembering where the user came from. */
  | { type: "rail"; rail: RailKey }
  /** A rail button: open it with what it showed last, or collapse it. */
  | { type: "toggle"; rail: RailKey }
  | { type: "collapse" }
  /** Show a rail's list without a way back (reveal in the file tree). */
  | { type: "show"; rail: RailKey };

export const INITIAL_PANE: PaneState = { rail: null, target: null, lastByRail: {}, returnTo: null };

function place(state: PaneState, rail: RailKey | null, target: ViewTarget | null, returnTo: PaneState["returnTo"]): PaneState {
  return {
    rail,
    target,
    returnTo,
    lastByRail: rail ? { ...state.lastByRail, [rail]: target } : state.lastByRail,
  };
}

/** The one transition of the side view. */
export function navigate(state: PaneState, action: PaneAction): PaneState {
  switch (action.type) {
    case "open": {
      const rail = railOf(action.target);
      const leaving = state.rail && state.rail !== rail ? { rail: state.rail, target: state.target } : state.returnTo;
      return place(state, rail, action.target, leaving);
    }
    case "back":
      return state.returnTo
        ? place(state, state.returnTo.rail, state.returnTo.target, null)
        : place(state, state.rail, null, null);
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
    case "show":
      return place(state, action.rail, null, state.returnTo);
    default: {
      const unhandled: never = action;
      return unhandled;
    }
  }
}
