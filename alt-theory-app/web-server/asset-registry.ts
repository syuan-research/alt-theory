import { existsSync, readdirSync } from "fs";
import { basename, dirname, extname, join, resolve } from "path";
import { loadKbDomainMetadata } from "../core/kb-metadata.js";

/**
 * Every asset root is scanned recursively and nothing here knows what a
 * subdirectory is called. Optional assets (history snapshots, experimental
 * work) are ordinary assets that packaging leaves out of the installed app,
 * so the owner's tree and a friend's build differ by their contents alone.
 */

export interface DiscoveredAsset {
  slug: string;
  displayName: string;
  shortLabel?: string;
  userLabel?: string;
  description?: string;
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

/**
 * Every Markdown file under a root, its own files before its subdirectories,
 * so a slug that exists at both levels resolves to the top-level one.
 */
function scanMarkdownAssets(dir: string): Array<{ slug: string; path: string }> {
  const root = resolve(dir);
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true }).filter(
    (entry) => !entry.name.startsWith(".")
  );
  const files = entries
    .filter(
      (entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".md"
    )
    .map((entry) => ({
      slug: basename(entry.name, extname(entry.name)),
      path: join(root, entry.name),
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const nested = entries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => scanMarkdownAssets(join(root, entry.name)));
  return [...files, ...nested];
}

function listMarkdownAssets(dir: string): DiscoveredAsset[] {
  return scanMarkdownAssets(dir).map(({ slug }) => ({
    slug,
    displayName: displayName(slug),
  }));
}

export function listRolePresets(rolePresetsDir: string): DiscoveredAsset[] {
  const seen = new Set<string>();
  const merged: DiscoveredAsset[] = [];
  const dirs = [resolve(rolePresetsDir), ...extraRoleDirs];
  for (const [index, dir] of dirs.entries()) {
    for (const asset of listMarkdownAssets(dir)) {
      if (seen.has(asset.slug)) continue;
      seen.add(asset.slug);
      // index 0 = bundled primary; user-added dirs are "added"
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
  return listMarkdownAssets(soulDir);
}

/**
 * A KB domain is a directory holding the Markdown itself — the files inside it
 * are its material, not separate assets. Directories that only hold other
 * directories are grouping, so the scan keeps descending through them.
 */
function scanKbDomainDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== "metadata"
    )
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const dir = join(root, entry.name);
      if (dirHoldsMarkdown(dir)) return [dir];
      // Only a directory that groups other domains is not one itself; an
      // empty domain is still the domain the user made.
      const nested = scanKbDomainDirs(dir);
      return nested.length ? nested : [dir];
    });
}

function dirHoldsMarkdown(dir: string): boolean {
  return readdirSync(dir, { withFileTypes: true }).some(
    (entry) =>
      entry.isFile() &&
      !entry.name.startsWith(".") &&
      extname(entry.name).toLowerCase() === ".md"
  );
}

function listKbDomainsInDir(kbDir: string): DiscoveredAsset[] {
  const root = resolve(kbDir);
  const metadataBySlug = new Map(
    loadKbDomainMetadata(root).map((domain) => [domain.slug, domain])
  );

  return scanKbDomainDirs(root)
    .map((dir) => basename(dir))
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
  const dirs = [resolve(kbDir), ...extraKbDirs];
  for (const [index, dir] of dirs.entries()) {
    for (const asset of listKbDomainsInDir(dir)) {
      // The historical EP tree keeps its versioned directory name; the product
      // domain is ep-core, and listing both would offer the same knowledge twice.
      if (asset.slug === "ep-core-v0-2-0" && seen.has("ep-core")) continue;
      if (seen.has(asset.slug)) continue;
      seen.add(asset.slug);
      merged.push(index === 0 ? asset : { ...asset, source: "added" });
    }
  }
  return merged;
}

/**
 * The directory a KB domain sits directly inside — sessions carry one kbDir and
 * join the domain onto it, so a domain nested deeper (or in a user-added
 * location) has to report its own parent.
 */
export function resolveKbDirForDomain(
  kbDir: string,
  domain: string | null | undefined
): string {
  const primary = resolve(kbDir);
  if (!domain || domain === "all") return primary;
  for (const dir of [primary, ...extraKbDirs]) {
    const match = scanKbDomainDirs(dir).find(
      (candidate) => basename(candidate) === domain
    );
    if (match) return dirname(match);
  }
  return primary;
}

export function resolveRolePresetSlug(
  rolePresetsDir: string,
  slug: string
): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(slug)) return null;
  for (const dir of [resolve(rolePresetsDir), ...extraRoleDirs]) {
    const match = scanMarkdownAssets(dir).find((asset) => asset.slug === slug);
    if (match) return match.path;
  }
  return null;
}

/** Deprecated compatibility alias. Use resolveRolePresetSlug. */
export const resolveProfileSlug = resolveRolePresetSlug;

export function resolveSoulSlug(
  soulDir: string,
  slug: string,
  _legacySoulPath?: string | null
): string | null {
  return (
    scanMarkdownAssets(soulDir).find((asset) => asset.slug === slug)?.path ??
    null
  );
}

export function isKnownKbDomain(kbDir: string, slug: string): boolean {
  return (
    slug === "all" ||
    listKbDomains(kbDir).some((domain) => domain.slug === slug)
  );
}



