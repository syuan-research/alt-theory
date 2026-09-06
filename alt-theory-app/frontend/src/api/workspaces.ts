import { fetchJson } from "@/api/http";
import type { SessionSnapshot } from "@/api/types";

/** Known working folders (local mode; empty folders the user added). */
export async function listWorkspaces(): Promise<{ workspaces: string[] }> {
  return fetchJson<{ workspaces: string[] }>("/api/workspaces");
}

export async function addWorkspace(
  path: string
): Promise<{ workspaces: string[] }> {
  return fetchJson<{ workspaces: string[] }>("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

export async function removeWorkspace(
  path: string
): Promise<{ workspaces: string[] }> {
  return fetchJson<{ workspaces: string[] }>("/api/workspaces", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

/** Re-point an existing session's working folder (M4). */
export async function setSessionWorkspace(
  sessionId: string,
  primaryDir: string | null
): Promise<{ sessionId: string; snapshot: SessionSnapshot | null }> {
  return fetchJson<{ sessionId: string; snapshot: SessionSnapshot | null }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/workspace`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryDir }),
    }
  );
}

/** Change a project's main folder (v1.5.1); every conversation moves. */
export async function setProjectMainFolder(
  projectId: string,
  primaryDir: string
): Promise<{
  project: { id: string; primaryDir: string };
  movedCount: number;
  workspaces: string[];
}> {
  return fetchJson(
    `/api/projects/${encodeURIComponent(projectId)}/main-folder`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryDir }),
    }
  );
}
