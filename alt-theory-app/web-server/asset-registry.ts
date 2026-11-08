import { existsSync, readdirSync } from "fs";
import { basename, extname, join, resolve } from "path";
import { KB_CARD_FILE, KB_DISABLED_DOMAIN, readKbCard, type KbLibrary } from "../core/kb-metadata.js";

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

export function listSouls(
  soulDir: string,
  _legacySoulPath?: string | null
): DiscoveredAsset[] {
  return listMarkdownAssets(soulDir);
}

/**
 * A knowledge base is a folder holding `at-kb.md`, found anywhere under a
 * location. A user-added location with no card anywhere is itself one
 * knowledge base (a plain folder of notes still works; the agent can add the
 * card later).
 */
// ponytail: rescanned on every root check (the readable roots are live); a
// card deeper than 4 levels under a location is not found. Cache if slow.
function findKbLibraryDirs(dir: string, depth = 0): string[] {
  if (existsSync(join(dir, KB_CARD_FILE))) return [dir];
  if (depth >= 4) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => findKbLibraryDirs(join(dir, entry.name), depth + 1));
}

/** Every knowledge base, bundled first; a slug already taken keeps its first owner. */
export function listKbLibraries(kbDir: string): KbLibrary[] {
  const seen = new Set<string>();
  const libraries: KbLibrary[] = [];
  for (const [index, root] of [resolve(kbDir), ...extraKbDirs].entries()) {
    if (!existsSync(root)) continue;
    const found = findKbLibraryDirs(root);
    for (const dir of found.length || index === 0 ? found : [root]) {
      const slug = basename(dir);
      if (seen.has(slug)) continue;
      seen.add(slug);
      const card = readKbCard(dir);
      libraries.push({
        slug,
        name: card.name ?? displayName(slug),
        ...(card.description ? { description: card.description } : {}),
        dir,
        ...(index === 0 ? {} : { source: "added" as const }),
      });
    }
  }
  return libraries;
}

export function listKbDomains(kbDir: string): DiscoveredAsset[] {
  return listKbLibraries(kbDir).map(({ slug, name, description, source }) => ({
    slug,
    displayName: name,
    ...(description ? { description } : {}),
    ...(source ? { source } : {}),
  }));
}

/** The knowledge bases a selection reads: one, all, or none. */
export function selectedKbLibraries(kbDir: string, domain: string | null | undefined): KbLibrary[] {
  if (domain === KB_DISABLED_DOMAIN) return [];
  const libraries = listKbLibraries(kbDir);
  if (!domain || domain === "all") return libraries;
  return libraries.filter((library) => library.slug === domain);
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



