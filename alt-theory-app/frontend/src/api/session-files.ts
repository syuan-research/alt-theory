import { ApiError, fetchJson, readErrorMessage } from "./http";
import type {
  DeleteWorkspaceFileResult,
  SessionChanges,
  SessionFilesResponse,
  SessionTextFileContent,
  UploadWorkspaceFileResult,
  WorkspaceFilesResponse,
  WorkingDirectoryResponse,
  WorkingFoldersResponse,
  WriteSessionFileInput,
} from "./types";

export function classifyDroppedFiles(input: {
  paths: string[];
  sessionId: string | null;
  workspacePrimaryDir: string | null;
  fullAccess: boolean;
}): Promise<Array<"reference" | "copy" | "blocked">> {
  return fetchJson("/api/attachments/classify-drop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchSessionChanges(
  sessionId: string
): Promise<SessionChanges> {
  return fetchJson<SessionChanges>(
    `/api/sessions/${encodeURIComponent(sessionId)}/changes`
  );
}

function sessionFilesBase(sessionId: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/files`;
}

export type FileOwner = string | { primaryDir: string | null };

function readFilesUrl(owner: FileOwner, qs: URLSearchParams, suffix = ""): string {
  if (typeof owner === "string") return sessionFilesBase(owner) + suffix + "?" + qs;
  if (owner.primaryDir) qs.set("primaryDir", owner.primaryDir);
  return "/api/draft/files" + suffix + "?" + qs;
}

export async function listSessionFiles(
  sessionId: string,
  root?: "records" | "workspace"
): Promise<SessionFilesResponse> {
  const qs = root ? `?root=${encodeURIComponent(root)}` : "";
  return fetchJson<SessionFilesResponse>(`${sessionFilesBase(sessionId)}${qs}`);
}

export async function listWorkspaceFiles(
  sessionId: string
): Promise<WorkspaceFilesResponse> {
  return fetchJson<WorkspaceFilesResponse>(
    `${sessionFilesBase(sessionId)}?root=workspace`
  );
}

export async function getSessionFileContent(
  owner: FileOwner,
  root: string,
  path: string
): Promise<SessionTextFileContent> {
  const qs = new URLSearchParams({ root, path });
  return fetchJson<SessionTextFileContent>(
    readFilesUrl(owner, qs, "/content")
  );
}

export async function putSessionFileContent(
  owner: FileOwner,
  input: WriteSessionFileInput
): Promise<SessionTextFileContent> {
  return fetchJson<SessionTextFileContent>(
    readFilesUrl(owner, new URLSearchParams(), "/content"),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
}

export async function deleteSessionFileContent(
  sessionId: string,
  root: string,
  path: string
): Promise<DeleteWorkspaceFileResult> {
  const qs = new URLSearchParams({ root, path });
  return fetchJson<DeleteWorkspaceFileResult>(
    `${sessionFilesBase(sessionId)}/content?${qs}`,
    { method: "DELETE" }
  );
}

export async function retryWorkspaceExtract(
  sessionId: string,
  path: string
): Promise<UploadWorkspaceFileResult> {
  return fetchJson<UploadWorkspaceFileResult>(
    `${sessionFilesBase(sessionId)}/retry-extract`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    }
  );
}

export function workspaceDownloadUrl(sessionId: string, path: string): string {
  const qs = new URLSearchParams({ root: "workspace", path });
  return `${sessionFilesBase(sessionId)}/download?${qs}`;
}

export async function downloadWorkspaceFile(
  sessionId: string,
  path: string
): Promise<Blob> {
  const res = await fetch(workspaceDownloadUrl(sessionId, path));
  if (!res.ok) {
    throw new ApiError(await readErrorMessage(res), res.status);
  }
  return res.blob();
}

export async function listWorkingFolders(
  owner: FileOwner
): Promise<WorkingFoldersResponse> {
  return fetchJson<WorkingFoldersResponse>(
    readFilesUrl(owner, new URLSearchParams({ root: "working" }))
  );
}

export async function listWorkingDirectory(
  owner: FileOwner,
  folderId: string,
  path: string,
): Promise<WorkingDirectoryResponse> {
  const qs = new URLSearchParams({ root: "working", folderId, path });
  return fetchJson<WorkingDirectoryResponse>(readFilesUrl(owner, qs));
}

/** A folder's most recently modified files, newest first (capped by the server). */
export async function listRecentWorkingFiles(owner: FileOwner, folderId: string): Promise<WorkingDirectoryResponse> {
  const qs = new URLSearchParams({ root: "working", folderId, recent: "1" });
  return fetchJson<WorkingDirectoryResponse>(readFilesUrl(owner, qs));
}

export async function searchWorkingDirectory(
  owner: FileOwner,
  folderId: string,
  search: string,
  options: { searchToken: string; signal: AbortSignal },
): Promise<WorkingDirectoryResponse> {
  // The token lets the server reuse one folder walk while this search lasts.
  const qs = new URLSearchParams({ root: "working", folderId, search, searchToken: options.searchToken });
  return fetchJson<WorkingDirectoryResponse>(readFilesUrl(owner, qs), { signal: options.signal });
}

/** Which staged attachments of a restored draft are gone (local form only). */
export async function missingAttachments(
  sessionId: string | null,
  paths: string[]
): Promise<string[]> {
  const result = await fetchJson<{ missing: string[] }>("/api/attachments/missing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, paths }),
  });
  return result.missing;
}

/**
 * Attach a file by copy (paperclip, read-only drop, pasted image): the
 * server copies it, converts office/PDF files to text, and returns the path
 * to attach; the send moves it into the conversation's folder.
 */
export async function stageAttachmentFile(
  file: File,
): Promise<{ path: string; extractError?: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/attachments/stage", { method: "POST", body: form });
  if (!res.ok) {
    throw new ApiError(await readErrorMessage(res), res.status);
  }
  return res.json() as Promise<{ path: string; extractError?: string }>;
}

/** An executable/resource URL on the file-only preview origin. */
export async function sessionArtifactUrl(owner: FileOwner, root: string, path: string): Promise<string> {
  const qs = new URLSearchParams({ root, path });
  return (await fetchJson<{ url: string }>(readFilesUrl(owner, qs, "/preview-url"))).url;
}
