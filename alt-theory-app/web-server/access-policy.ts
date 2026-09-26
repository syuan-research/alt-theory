import type { IncomingMessage } from "http";

/**
 * Who may see a conversation in a list, and who may read or act on an
 * existing conversation's content. Every per-conversation REST route and
 * WebSocket action asks through this policy, never inline; the guards around
 * it only check that the conversation exists (and, on the socket, that it is
 * not in Trash). Machine-level actions — creating a conversation, projects
 * and their main folders, model keys and app settings — are the machine
 * owner's and do not ask it; a multi-user deployment has to gate them too.
 *
 * The desktop app has one owner, who sees everything: `localAccess` is the
 * only policy. A multi-user deployment would supply its own here, deciding
 * from the request (its sign-in) and whatever it keeps about the conversation.
 * The hosted accounts, ownership and private content that once lived inline
 * were removed on 2026-09-26 (see research-identity-visibility-privacy-and-
 * retention.md).
 */
export interface AccessPolicy {
  canList(viewer: IncomingMessage, sessionId: string): boolean;
  canReadContent(viewer: IncomingMessage, sessionId: string): boolean;
}

export const localAccess: AccessPolicy = {
  canList: () => true,
  canReadContent: () => true,
};
