import { resolve } from "path";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { fileRef } from "../core/agent-assets.js";

export interface SkillAssetSummary {
  name: string;
  description: string;
  path: string;
  sha256: string | null;
  source: "alt-theory";
}

/** Every skill under the skills root; Pi's loader descends on its own. */
export function listAltTheorySkills(skillsDir: string): SkillAssetSummary[] {
  const byName = new Map<string, SkillAssetSummary>();
  for (const skill of loadSkillsFromDir({
    dir: resolve(skillsDir),
    source: "alt-theory",
  }).skills) {
    if (byName.has(skill.name)) continue;
    byName.set(skill.name, {
      name: skill.name,
      description: skill.description,
      path: skill.filePath,
      sha256: fileRef(skill.filePath).sha256,
      source: "alt-theory",
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
