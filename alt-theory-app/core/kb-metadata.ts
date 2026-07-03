import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export interface KbDomainMetadata {
  slug: string;
  displayName: string;
  shortLabel?: string;
  userLabel?: string;
  description?: string;
  promptInstructions?: string[];
}

interface KbMetadataFile {
  schemaVersion?: number;
  domains?: KbDomainMetadata[];
}

export function kbMetadataPath(kbDir: string): string {
  return resolve(kbDir, "metadata", "domains.json");
}

export function loadKbDomainMetadata(kbDir: string): KbDomainMetadata[] {
  const path = kbMetadataPath(kbDir);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as KbMetadataFile;
    if (!parsed || !Array.isArray(parsed.domains)) return [];
    return parsed.domains.filter(
      (domain): domain is KbDomainMetadata =>
        Boolean(
          domain &&
            typeof domain.slug === "string" &&
            domain.slug.trim() &&
            typeof domain.displayName === "string" &&
            domain.displayName.trim()
        )
    );
  } catch {
    return [];
  }
}

export function findKbDomainMetadata(
  kbDir: string,
  slug: string
): KbDomainMetadata | null {
  return (
    loadKbDomainMetadata(kbDir).find((domain) => domain.slug === slug) ?? null
  );
}

export function formatKbMetadataPrompt(
  metadata: KbDomainMetadata | null
): string | null {
  if (!metadata) return null;
  const lines = [
    `Active domain: ${metadata.displayName} (${metadata.slug})`,
    metadata.description ? `Scope: ${metadata.description}` : null,
    ...(metadata.promptInstructions ?? []).map(
      (instruction) => `- ${instruction}`
    ),
  ].filter((line): line is string => Boolean(line));
  if (lines.length <= 1) return null;
  return lines.join("\n");
}
