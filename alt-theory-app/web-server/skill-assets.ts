import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { fileRef } from "../core/agent-assets.js";

export interface SkillAssetSummary {
  name: string;
  description: string;
  path: string;
  sha256: string | null;
  source: "alt-theory";
}

/**
 * Bundled skills plus local experimental skills under
 * agent-assets/experimental/skills when that tree exists.
 * Pack excludes experimental/; discovery still lists them for owner testing.
 */
export function listAltTheorySkills(skillsDir: string): SkillAssetSummary[] {
  const primary = resolve(skillsDir);
  const experimental = resolve(dirname(primary), "experimental", "skills");
  const dirs = [
    primary,
    ...(existsSync(experimental) ? [experimental] : []),
  ];
  const byName = new Map<string, SkillAssetSummary>();
  for (const dir of dirs) {
    for (const skill of loadSkillsFromDir({ dir, source: "alt-theory" }).skills) {
      // Bundled wins name collisions; experimental fills gaps.
      if (byName.has(skill.name)) continue;
      byName.set(skill.name, {
        name: skill.name,
        description: skill.description,
        path: skill.filePath,
        sha256: fileRef(skill.filePath).sha256,
        source: "alt-theory",
      });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
