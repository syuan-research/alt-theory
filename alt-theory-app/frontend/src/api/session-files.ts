import { ApiError, fetchJson, readErrorMessage } from "./http";
import type {
  DeleteWorkspaceFileResult,
  SessionFilesResponse,
  SessionTextFileContent,
  UploadWorkspaceFileResult,
  WorkspaceFilesResponse,
  WriteSessionFileInput,
} from "./types";

function sessionFilesBase(sessionId: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/files`;
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
  sessionId: string,
  root: string,
  path: string
): Promise<SessionTextFileContent> {
  const qs = new URLSearchParams({ root, path });
  return fetchJson<SessionTextFileContent>(
    `${sessionFilesBase(sessionId)}/content?${qs}`
  );
}

export async function putSessionFileContent(
  sessionId: string,
  input: WriteSessionFileInput
): Promise<SessionTextFileContent> {
  return fetchJson<SessionTextFileContent>(
    `${sessionFilesBase(sessionId)}/content`,
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

export async function uploadWorkspaceFile(
  sessionId: string,
  file: File
): Promise<UploadWorkspaceFileResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${sessionFilesBase(sessionId)}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new ApiError(await readErrorMessage(res), res.status);
  }
  return res.json() as Promise<UploadWorkspaceFileResult>;
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