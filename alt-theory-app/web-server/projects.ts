import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { writeJsonAtomic } from "../core/data-dir.js";

export interface ResearchProject {
  projectId: string;
  displayName: string;
  defaults: {
    rolePresetSlug?: string | null;
    soulSlug?: string | null;
    kbDomain?: string | null;
    modelProvider?: string | null;
    modelId?: string | null;
  };
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export function listProjects(dataDir: string): { projects: ResearchProject[] } {
  const root = projectsRoot(dataDir);
  if (!existsSync(root)) return { projects: [] };
  const projects = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readProjectFile(join(root, entry.name)))
    .filter((project): project is ResearchProject => project !== null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { projects };
}

export function upsertProject(
  dataDir: string,
  projectId: string,
  input: {
    displayName?: unknown;
    defaults?: unknown;
    notes?: unknown;
  }
): ResearchProject {
  assertProjectId(projectId);
  const root = projectsRoot(dataDir);
  mkdirSync(root, { recursive: true });
  const path = join(root, `${projectId}.json`);
  const existing = readProjectFile(path);
  const now = new Date().toISOString();
  const displayName =
    typeof input.displayName === "string" && input.displayName.trim()
      ? input.displayName.trim()
      : existing?.displayName ?? projectId;
  const project: ResearchProject = {
    projectId,
    displayName,
    defaults: normalizeDefaults(input.defaults, existing?.defaults ?? {}),
    ...(typeof input.notes === "string" ? { notes: input.notes } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  writeJsonAtomic(path, project);
  return project;
}

function projectsRoot(dataDir: string): string {
  return resolve(dataDir, "projects");
}

function assertProjectId(projectId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectId)) {
    throw new Error(`Invalid project id: ${projectId}`);
  }
}

function normalizeDefaults(
  value: unknown,
  fallback: ResearchProject["defaults"]
): ResearchProject["defaults"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const input = value as Record<string, unknown>;
  return {
    ...optionalString(input.rolePresetSlug, "rolePresetSlug"),
    ...optionalString(input.soulSlug, "soulSlug"),
    ...optionalString(input.kbDomain, "kbDomain"),
    ...optionalString(input.modelProvider, "modelProvider"),
    ...optionalString(input.modelId, "modelId"),
  };
}

function optionalString(
  value: unknown,
  key: keyof ResearchProject["defaults"]
): Partial<ResearchProject["defaults"]> {
  if (value === null) return { [key]: null };
  if (typeof value === "string") return { [key]: value.trim() || null };
  return {};
}

function readProjectFile(path: string): ResearchProject | null {
  if (!existsSync(path)) return null;
  try {
    const project = JSON.parse(readFileSync(path, "utf-8")) as ResearchProject;
    if (!project.projectId || !project.displayName) return null;
    return project;
  } catch {
    return null;
  }
}
