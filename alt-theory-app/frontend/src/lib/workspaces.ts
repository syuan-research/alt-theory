import type { OpenFile, PaneState } from "./viewTarget";

/**
 * Workspaces (owner 2026-11-26): places the user stays in and switches
 * between, listed at the top of the left list once there are two. Each keeps
 * its center conversation and its right pane; only the one on show is live,
 * so switching reopens its conversation and puts its right pane back. Within
 * one workspace the center/right relation is as it always was.
 *
 * A list click stays in the current workspace unless the setting says this
 * click crosses into another place: then it goes to the workspace already
 * holding that place (a project, by default), else a new one. Cmd/Ctrl+click
 * or "Open in new workspace" always opens a new one. Nothing restricts which
 * conversation a workspace may hold.
 */
export type AutoWorkspace = "always" | "family" | "project" | "never";

export interface Slot {
  id: number;
  /** The conversation it shows; null = a new conversation's draft. The live
   *  one's is the center's, kept here only while it is not on show. */
  sessionId: string | null;
  /** Its right pane while it is not on show; null = a fresh pane. */
  pane: PaneState | null;
  /** What was sent to the center from the right pane while it is not on show (center). */
  center?: CenterState;
}

/**
 * Sent to the center (owner 2026-11-27): a file shown over the desk's
 * conversation, or the conversation the center showed before another one was
 * sent there. Either way the center offers one step back; nothing new is
 * added to the desks.
 */
export interface CenterState {
  file: OpenFile | null;
  back: { from: string; to: string } | null;
}
export const EMPTY_CENTER: CenterState = { file: null, back: null };

/** Where a conversation sits: its project (main folder, "" = standalone) and family. */
export interface Place {
  project: string;
  family: string;
}

export type SlotChoice = { kind: "here" } | { kind: "switch"; id: number } | { kind: "new" };

export function chooseSlot(
  slots: Slot[],
  activeId: number,
  activeSessionId: string | null,
  target: string,
  placeOf: (sessionId: string) => Place | null,
  mode: AutoWorkspace,
  forceNew: boolean,
): SlotChoice {
  const others = slots.filter((slot) => slot.id !== activeId);
  if (forceNew) {
    const showing = others.find((slot) => slot.sessionId === target);
    return showing ? { kind: "switch", id: showing.id } : { kind: "new" };
  }
  if (mode === "never" || activeSessionId === null || target === activeSessionId) return { kind: "here" };
  if (mode === "always") {
    const showing = others.find((slot) => slot.sessionId === target);
    return showing ? { kind: "switch", id: showing.id } : { kind: "new" };
  }
  const here = placeOf(activeSessionId);
  const there = placeOf(target);
  if (!here || !there || here[mode] === there[mode]) return { kind: "here" };
  const holder = others.find((slot) => slot.sessionId !== null && placeOf(slot.sessionId)?.[mode] === there[mode]);
  return holder ? { kind: "switch", id: holder.id } : { kind: "new" };
}
