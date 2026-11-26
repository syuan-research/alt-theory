import type { DragEvent } from "react";

/** A dragged conversation carries its session ID under this type. */
export const SESSION_MIME = "text/alt-theory-session";

/** The conversation being dropped, if any. */
export function draggedSession(event: DragEvent): string | null {
  if (!event.dataTransfer.types.includes(SESSION_MIME)) return null;
  return event.dataTransfer.getData(SESSION_MIME) || null;
}

/** What makes a conversation draggable wherever it is shown: a list row, a tab, a name in a conversation. */
export function draggableSession(sessionId: string | undefined) {
  return sessionId ? {
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.setData(SESSION_MIME, sessionId);
      event.dataTransfer.effectAllowed = "copyMove";
    },
  } : { draggable: false };
}
