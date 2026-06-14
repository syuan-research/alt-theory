import { loadSkillsFromDir } from "@mariozechner/pi-coding-agent";
import { fileRef } from "../core/agent-assets.js";

export interface SkillAssetSummary {
  name: string;
  description: string;
  path: string;
  sha256: string | null;
  source: "alt-theory";
}

export function listAltTheorySkills(skillsDir: string): SkillAssetSummary[] {
  return loadSkillsFromDir({ dir: skillsDir, source: "alt-theory" }).skills
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      path: skill.filePath,
      sha256: fileRef(skill.filePath).sha256,
      source: "alt-theory" as const,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
