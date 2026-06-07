import { existsSync, readdirSync } from "fs";
import { basename, extname, resolve } from "path";

export interface DiscoveredAsset {
  slug: string;
  displayName: string;
}

function displayName(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function listProfiles(profilesDir: string): DiscoveredAsset[] {
  const root = resolve(profilesDir);
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

export function listKbDomains(kbDir: string): DiscoveredAsset[] {
  const root = resolve(kbDir);
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
    .map((slug) => ({ slug, displayName: displayName(slug) }));
}

export function resolveProfileSlug(
  profilesDir: string,
  slug: string
): string | null {
  if (!listProfiles(profilesDir).some((profile) => profile.slug === slug)) {
    return null;
  }
  return resolve(profilesDir, `${slug}.md`);
}

export function isKnownKbDomain(kbDir: string, slug: string): boolean {
  return (
    slug === "all" ||
    listKbDomains(kbDir).some((domain) => domain.slug === slug)
  );
}
