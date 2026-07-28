import { existsSync, readdirSync } from "fs";
import { basename, extname, resolve } from "path";
import { loadKbDomainMetadata } from "../core/kb-metadata.js";

export interface DiscoveredAsset {
  slug: string;
  displayName: string;
  shortLabel?: string;
  userLabel?: string;
  description?: string;
  /** Historical snapshot (lives in <dir>/snapshots); hidden from user-facing
   *  pickers, collapsed under "History" in researcher surfaces (M5). */
  snapshot?: boolean;
  /** Present when the asset comes from a user-added location (alpha.5).
   *  Bundled assets carry no source. */
  source?: "added";
}

/**
 * User-added asset locations (alpha.5, add-only): extra directories join the
 * bundled ones for listing and slug resolution; the bundled directory always
 * wins a slug collision. Registered once at server startup and re-applied
 * when the user edits them in Settings — module state so every existing
 * caller keeps its single-dir signature.
 */
let extraRoleDirs: string[] = [];
let extraKbDirs: string[] = [];

export function setExtraAssetDirs(dirs: {
  roleDirs?: string[];
  kbDirs?: string[];
}): void {
  if (dirs.roleDirs) extraRoleDirs = dirs.roleDirs.map((dir) => resolve(dir));
  if (dirs.kbDirs) extraKbDirs = dirs.kbDirs.map((dir) => resolve(dir));
}

export function getExtraAssetDirs(): { roleDirs: string[]; kbDirs: string[] } {
  return { roleDirs: [...extraRoleDirs], kbDirs: [...extraKbDirs] };
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

function listWithSnapshots(dir: string): DiscoveredAsset[] {
  return [
    ...listMarkdownAssets(dir),
    ...listMarkdownAssets(resolve(dir, "snapshots")).map((asset) => ({
      ...asset,
      snapshot: true as const,
    })),
  ];
}

export function listRolePresets(rolePresetsDir: string): DiscoveredAsset[] {
  const seen = new Set<string>();
  const merged: DiscoveredAsset[] = [];
  for (const [index, dir] of [resolve(rolePresetsDir), ...extraRoleDirs].entries()) {
    for (const asset of listWithSnapshots(dir)) {
      const key = `${asset.slug}${asset.snapshot ? ":snapshot" : ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(index === 0 ? asset : { ...asset, source: "added" });
    }
  }
  return merged;
}

/** Deprecated compatibility alias. Use listRolePresets. */
export const listProfiles = listRolePresets;

export function listSouls(
  soulDir: string,
  _legacySoulPath?: string | null
): DiscoveredAsset[] {
  return listWithSnapshots(soulDir);
}

function listKbDomainsInDir(kbDir: string): DiscoveredAsset[] {
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

export function listKbDomains(kbDir: string): DiscoveredAsset[] {
  const seen = new Set<string>();
  const merged: DiscoveredAsset[] = [];
  for (const [index, dir] of [resolve(kbDir), ...extraKbDirs].entries()) {
    for (const asset of listKbDomainsInDir(dir)) {
      if (seen.has(asset.slug)) continue;
      seen.add(asset.slug);
      merged.push(index === 0 ? asset : { ...asset, source: "added" });
    }
  }
  return merged;
}

/**
 * The directory that owns a KB domain slug — the bundled dir when it hosts
 * the domain (or for "all"/off/unknown), otherwise the first user-added dir
 * that does. Sessions keep a single kbDir; this picks the right one.
 */
export function resolveKbDirForDomain(
  kbDir: string,
  domain: string | null | undefined
): string {
  const primary = resolve(kbDir);
  if (!domain || domain === "all") return primary;
  if (listKbDomainsInDir(primary).some((entry) => entry.slug === domain)) {
    return primary;
  }
  for (const dir of extraKbDirs) {
    if (listKbDomainsInDir(dir).some((entry) => entry.slug === domain)) {
      return dir;
    }
  }
  return primary;
}

export function resolveRolePresetSlug(
  rolePresetsDir: string,
  slug: string
): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(slug)) return null;
  for (const dir of [resolve(rolePresetsDir), ...extraRoleDirs]) {
    for (const candidate of [
      resolve(dir, `${slug}.md`),
      resolve(dir, "snapshots", `${slug}.md`),
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/** Deprecated compatibility alias. Use resolveRolePresetSlug. */
export const resolveProfileSlug = resolveRolePresetSlug;

export function resolveSoulSlug(
  soulDir: string,
  slug: string,
  legacySoulPath?: string | null
): string | null {
  const match = listSouls(soulDir, legacySoulPath).find(
    (soul) => soul.slug === slug
  );
  if (!match) {
    return null;
  }

  const candidate = match.snapshot
    ? resolve(soulDir, "snapshots", `${slug}.md`)
    : resolve(soulDir, `${slug}.md`);
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



