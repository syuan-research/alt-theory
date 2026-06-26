import { fetchJson } from "./http";
import type { ResearchProject } from "./types";

export interface ProjectsListResponse {
  projects: ResearchProject[];
}

export interface UpsertProjectInput {
  displayName?: string;
  defaults?: ResearchProject["defaults"];
  notes?: string;
}

export async function listProjects(): Promise<ProjectsListResponse> {
  return fetchJson<ProjectsListResponse>("/api/projects");
}

export async function upsertProject(
  projectId: string,
  input: UpsertProjectInput
): Promise<ResearchProject> {
  return fetchJson<ResearchProject>(
    `/api/projects/${encodeURIComponent(projectId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
}