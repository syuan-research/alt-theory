/**
 * One-way resource discovery (spec §6.1): list skills from the standard Pi
 * and cross-harness locations so the settings surface can offer them for
 * per-mode enablement. Metadata reads only — nothing here loads extension
 * code or mutates external directories.
 *
 * Project-level locations (.pi/skills, .agents/skills under working
 * directories) join in M3 when Full sessions gain user working directories.
 */
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
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

export function discoverSkillResources(options: {
  altSkillsDir?: string | null;
  agentDir: string;
}): ResourceDiscoveryResult {
  const locations: Array<{ dir: string | null | undefined; source: SkillSource }> = [
    { dir: options.altSkillsDir, source: "alt-theory" },
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
