import type { DragEvent } from "react";

/** A dragged conversation carries its session ID under this type. */
export const SESSION_MIME = "text/alt-theory-session";

/** The conversation being dropped, if any. */
export function draggedSession(event: DragEvent): string | null {
  if (!event.dataTransfer.types.includes(SESSION_MIME)) return null;
  return event.dataTransfer.getData(SESSION_MIME) || null;
}

/** The text a dragged conversation leaves where text goes (a note, another app):
 *  a Markdown link with its name and Session ID, the link the notes already use. */
export function sessionLinkText(sessionId: string, name?: string): string {
  const label = (name ?? "").replace(/[\[\]\n]/g, " ").trim();
  return label ? `[${label}](conversation:${sessionId})` : `conversation:${sessionId}`;
}

/** What makes a conversation draggable wherever it is shown: a list row, a tab, a name in a conversation. */
export function draggableSession(sessionId: string | undefined, name?: string) {
  return sessionId ? {
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.setData(SESSION_MIME, sessionId);
      event.dataTransfer.setData("text/plain", sessionLinkText(sessionId, name));
      event.dataTransfer.effectAllowed = "copyMove";
    },
  } : { draggable: false };
}
