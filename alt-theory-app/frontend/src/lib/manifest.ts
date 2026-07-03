import type { AssemblyManifest, DiscoveryLists } from "@/api/types";

export function displaySlug(slug: string | null | undefined): string {
  if (!slug) return "—";
  return slug;
}

export function displayKb(
  domain: string | null | undefined,
  discovery?: DiscoveryLists | null
): string {
  if (!domain) return "—";
  if (domain === "none") return "Off";
  if (domain === "all") return "All";
  const match = discovery?.kbDomains.find((item) => item.slug === domain);
  return match?.displayName || domain;
}

export function manifestPathEntries(
  manifest: AssemblyManifest | null
): Array<{ label: string; path: string }> {
  if (!manifest) return [];
  const entries: Array<{ label: string; path: string | null | undefined }> = [
    ["Workspace", manifest.sessionCwd],
    ["History", manifest.piSessionDir],
    ["Session File", manifest.piSessionFile],
    ["Records", manifest.recordsDir],
    ["Write Dir", manifest.writeDir],
    ["App Context", manifest.appContext?.path],
    ["Soul", manifest.soul?.path],
    ["Role", manifest.rolePreset?.path],
    ["KB Root", manifest.kb?.rootDir],
    ["KB Domain", manifest.kb?.domainPath],
    ["Pi Prompts", manifest.piAdapter?.promptTemplatesDir],
  ].map(([label, path]) => ({ label: String(label), path }));

  const writableRoots = Array.isArray(manifest.writableRoots)
    ? manifest.writableRoots
    : [];
  writableRoots.forEach((path, index) => {
    entries.push({ label: `Writable Root ${index + 1}`, path });
  });

  return entries
    .filter((entry): entry is { label: string; path: string } =>
      Boolean(entry.path)
    )
    .map((entry) => ({ label: entry.label, path: entry.path }));
}
