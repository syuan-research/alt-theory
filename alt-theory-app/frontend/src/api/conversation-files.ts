export type ConversationFileKind = "doc" | "image" | "video";

export interface ConversationFile {
  /** Path inside the conversation folder (workspace/), forward slashes. */
  path: string;
  section: "product" | "attachment";
  kind: ConversationFileKind;
  size: number;
  updatedAt: string;
}

export interface ConversationFilesGroup {
  sessionId: string;
  state: "live" | "trash" | "purged";
  title: string;
  workspacePrimaryDir: string | null;
  at: string | null;
  folderPath: string;
  files: ConversationFile[];
}

async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error || `${fallback} (${res.status})`);
}

export async function fetchConversationFiles(): Promise<ConversationFilesGroup[]> {
  const res = await fetch("/api/conversation-files");
  if (!res.ok) throw await failure(res, "Conversation files failed");
  const data = (await res.json()) as { groups?: ConversationFilesGroup[] };
  return Array.isArray(data.groups) ? data.groups : [];
}

export function conversationFileUrl(sessionId: string, path: string): string {
  return `/api/conversation-files/${encodeURIComponent(sessionId)}/raw?path=${encodeURIComponent(path)}`;
}

/** Delete a permanently deleted conversation's kept files (its whole folder). */
export async function deleteKeptFiles(sessionId: string): Promise<void> {
  const res = await fetch(`/api/conversation-files/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  if (!res.ok) throw await failure(res, "Delete failed");
}

/** What a permanent delete of this Trash item would ask about. */
export async function fetchPermanentDeletionFiles(
  sessionId: string,
): Promise<{ sessionId: string; path: string; section: "product" | "attachment" }[]> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/permanent/files`);
  if (!res.ok) throw await failure(res, "File list failed");
  const data = (await res.json()) as { files?: { sessionId: string; path: string; section: "product" | "attachment" }[] };
  return Array.isArray(data.files) ? data.files : [];
}
