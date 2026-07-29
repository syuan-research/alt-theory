import { existsSync, readdirSync } from "fs";
import { basename, dirname, extname, resolve } from "path";
import { loadKbDomainMetadata } from "../core/kb-metadata.js";

/**
 * Dev/local experimental assets live under agent-assets/experimental/ and are
 * excluded from electron-builder packaging. When present on disk they are still
 * discoverable so the owner's machine sees experimental roles/KB without shipping them.
 */
function experimentalRoleDir(rolePresetsDir: string): string {
  // role-presets → agent-assets/experimental/role-presets
  return resolve(dirname(rolePresetsDir), "experimental", "role-presets");
}

function experimentalKbDir(kbDir: string): string {
  // kb → agent-assets/experimental/kb
  return resolve(dirname(kbDir), "experimental", "kb");
}

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
  const experimental = experimentalRoleDir(rolePresetsDir);
  const dirs = [
    resolve(rolePresetsDir),
    ...(existsSync(experimental) ? [experimental] : []),
    ...extraRoleDirs,
  ];
  for (const [index, dir] of dirs.entries()) {
    for (const asset of listWithSnapshots(dir)) {
      const key = `${asset.slug}${asset.snapshot ? ":snapshot" : ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // index 0 = bundled primary; experimental + user-added are "added"
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
  // Experimental KB is scanned for local/dev only; pack excludes experimental/.
  // Primary product domain remains ep-core (domains.json). Duplicate historical
  // trees under experimental are not dual-shipped in the installer.
  const experimental = experimentalKbDir(kbDir);
  const dirs = [
    resolve(kbDir),
    ...(existsSync(experimental) ? [experimental] : []),
    ...extraKbDirs,
  ];
  for (const [index, dir] of dirs.entries()) {
    for (const asset of listKbDomainsInDir(dir)) {
      // Prefer the canonical ep-core slug; skip legacy duplicate names if both exist.
      if (
        asset.slug === "ep-core-v0-2-0" &&
        (seen.has("ep-core") ||
          listKbDomainsInDir(resolve(kbDir)).some((d) => d.slug === "ep-core"))
      ) {
        continue;
      }
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
  const experimental = experimentalRoleDir(rolePresetsDir);
  const dirs = [
    resolve(rolePresetsDir),
    ...(existsSync(experimental) ? [experimental] : []),
    ...extraRoleDirs,
  ];
  for (const dir of dirs) {
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



