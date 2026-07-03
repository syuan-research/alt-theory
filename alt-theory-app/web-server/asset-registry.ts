import { existsSync, readdirSync } from "fs";
import { basename, extname, resolve } from "path";
import { loadKbDomainMetadata } from "../core/kb-metadata.js";

export interface DiscoveredAsset {
  slug: string;
  displayName: string;
  shortLabel?: string;
  userLabel?: string;
  description?: string;
}

function displayName(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function listMarkdownAssets(dir: string): DiscoveredAsset[] {
  const root = resolve(dir);
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.name.startsWith(".") &&
        extname(entry.name).toLowerCase() === ".md"
    )
    .map((entry) => basename(entry.name, extname(entry.name)))
    .sort((left, right) => left.localeCompare(right))
    .map((slug) => ({ slug, displayName: displayName(slug) }));
}

export function listRolePresets(rolePresetsDir: string): DiscoveredAsset[] {
  return listMarkdownAssets(rolePresetsDir);
}

/** Deprecated compatibility alias. Use listRolePresets. */
export const listProfiles = listRolePresets;

export function listSouls(
  soulDir: string,
  _legacySoulPath?: string | null
): DiscoveredAsset[] {
  return listMarkdownAssets(soulDir);
}

export function listKbDomains(kbDir: string): DiscoveredAsset[] {
  const root = resolve(kbDir);
  if (!existsSync(root)) {
    return [];
  }
  const metadataBySlug = new Map(
    loadKbDomainMetadata(root).map((domain) => [domain.slug, domain])
  );

  return readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== "metadata"
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
    .map((slug) => {
      const metadata = metadataBySlug.get(slug);
      return {
        slug,
        displayName: metadata?.displayName ?? displayName(slug),
        ...(metadata?.shortLabel ? { shortLabel: metadata.shortLabel } : {}),
        ...(metadata?.userLabel ? { userLabel: metadata.userLabel } : {}),
        ...(metadata?.description ? { description: metadata.description } : {}),
      };
    });
}

export function resolveRolePresetSlug(
  rolePresetsDir: string,
  slug: string
): string | null {
  if (!listRolePresets(rolePresetsDir).some((preset) => preset.slug === slug)) {
    return null;
  }
  return resolve(rolePresetsDir, `${slug}.md`);
}

/** Deprecated compatibility alias. Use resolveRolePresetSlug. */
export const resolveProfileSlug = resolveRolePresetSlug;

export function resolveSoulSlug(
  soulDir: string,
  slug: string,
  legacySoulPath?: string | null
): string | null {
  if (!listSouls(soulDir, legacySoulPath).some((soul) => soul.slug === slug)) {
    return null;
  }

  const candidate = resolve(soulDir, `${slug}.md`);
  if (existsSync(candidate)) {
    return candidate;
  }

  return null;
}

export function isKnownKbDomain(kbDir: string, slug: string): boolean {
  return (
    slug === "all" ||
    listKbDomains(kbDir).some((domain) => domain.slug === slug)
  );
}



