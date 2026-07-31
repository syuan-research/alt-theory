/**
 * One-way resource discovery (spec §6.1): list skills from the standard Pi
 * and cross-harness locations so the settings surface can offer them for
 * per-mode enablement. Metadata reads only — nothing here loads extension
 * code or mutates external directories.
 *
 * Project-level locations (.pi/skills, .agents/skills under working
 * directories) join when Work/Native sessions use working directories.
 */
import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";

export type SkillSource = "alt-theory" | "pi-user" | "agents-global";

export interface DiscoveredSkill {
  name: string;
  description: string;
  path: string;
  source: SkillSource;
}

export interface ResourceDiscoveryResult {
  skills: DiscoveredSkill[];
  diagnostics: Array<{ message: string; path?: string }>;
}

/**
 * Dev/local experimental skills: agent-assets/experimental/skills
 * (sibling of agent-assets/skills). Packaged builds exclude experimental/;
 * when present on disk they are still discoverable for owner testing.
 */
function experimentalSkillsDir(altSkillsDir: string | null | undefined): string | null {
  if (!altSkillsDir) return null;
  return resolve(dirname(altSkillsDir), "experimental", "skills");
}

export function discoverSkillResources(options: {
  altSkillsDir?: string | null;
  agentDir: string;
}): ResourceDiscoveryResult {
  const experimental = experimentalSkillsDir(options.altSkillsDir ?? null);
  const locations: Array<{ dir: string | null | undefined; source: SkillSource }> = [
    { dir: options.altSkillsDir, source: "alt-theory" },
    // Experimental skills share the alt-theory source label so Settings can
    // enable them like other bundled skills; they are simply not in the pack.
    { dir: experimental, source: "alt-theory" },
    { dir: join(options.agentDir, "skills"), source: "pi-user" },
    { dir: join(homedir(), ".agents", "skills"), source: "agents-global" },
  ];

  const skills: DiscoveredSkill[] = [];
  const diagnostics: ResourceDiscoveryResult["diagnostics"] = [];
  const seenPaths = new Set<string>();
  for (const { dir, source } of locations) {
    if (!dir || !existsSync(dir)) continue;
    const result = loadSkillsFromDir({ dir, source });
    for (const skill of result.skills) {
      if (seenPaths.has(skill.filePath)) continue;
      seenPaths.add(skill.filePath);
      skills.push({
        name: skill.name,
        description: skill.description,
        path: skill.filePath,
        source,
      });
    }
    for (const diagnostic of result.diagnostics) {
      diagnostics.push({ message: diagnostic.message, path: diagnostic.path });
    }
  }
  skills.sort(
    (a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name)
  );
  return { skills, diagnostics };
}
