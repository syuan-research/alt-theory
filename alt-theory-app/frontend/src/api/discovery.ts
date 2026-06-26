import type { DiscoveryLists } from "./types";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Discovery request failed for ${path} (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchDiscovery(): Promise<DiscoveryLists> {
  const [
    rolePresetsRes,
    soulsRes,
    domainsRes,
    instructionsRes,
    skillsRes,
    projectsRes,
  ] = await Promise.all([
    fetchJson<{ rolePresets: DiscoveryLists["rolePresets"] }>(
      "/api/role-presets"
    ),
    fetchJson<{ souls: DiscoveryLists["souls"] }>("/api/souls"),
    fetchJson<{ domains: DiscoveryLists["kbDomains"] }>("/api/kb-domains"),
    fetchJson<{ instructions: DiscoveryLists["instructions"] }>(
      "/api/instruction-assets"
    ),
    fetchJson<{ skills: DiscoveryLists["skills"] }>("/api/skills"),
    fetchJson<{ projects: DiscoveryLists["projects"] }>("/api/projects"),
  ]);

  return {
    rolePresets: rolePresetsRes.rolePresets ?? [],
    souls: soulsRes.souls ?? [],
    kbDomains: domainsRes.domains ?? [],
    instructions: instructionsRes.instructions ?? [],
    skills: skillsRes.skills ?? [],
    projects: projectsRes.projects ?? [],
  };
}