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
