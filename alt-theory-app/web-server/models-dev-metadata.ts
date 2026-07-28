import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { randomUUID } from "crypto";

export type CatalogThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

interface ModelsDevModel {
  reasoning_options?: Array<{
    type?: string;
    values?: unknown;
  }>;
}

interface ModelsDevProvider {
  api?: string;
  models?: Record<string, ModelsDevModel>;
}

type ModelsDevCatalog = Record<string, ModelsDevProvider>;

const SOURCE = "https://models.dev/api.json";
const TTL_MS = 5 * 60 * 1000;
const caches = new Map<string, ModelsDevCatalog>();
const refreshes = new Map<string, Promise<void>>();

function cachePath(agentDir: string): string {
  return join(agentDir, "models-dev-cache.json");
}

function parseCatalog(value: unknown): ModelsDevCatalog | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as ModelsDevCatalog;
}

function loadCache(agentDir: string): ModelsDevCatalog | null {
  const path = cachePath(agentDir);
  const memory = caches.get(path);
  if (memory) return memory;
  if (!existsSync(path)) return null;
  try {
    const parsed = parseCatalog(JSON.parse(readFileSync(path, "utf-8")));
    if (parsed) caches.set(path, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function cacheIsFresh(agentDir: string): boolean {
  try {
    return Date.now() - statSync(cachePath(agentDir)).mtimeMs < TTL_MS;
  } catch {
    return false;
  }
}

function writeCache(agentDir: string, catalog: ModelsDevCatalog): void {
  const path = cachePath(agentDir);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(catalog), "utf-8");
  renameSync(temporary, path);
  caches.set(path, catalog);
}

/** Refresh models.dev without making the app depend on network availability. */
export async function refreshModelsDevMetadata(agentDir: string): Promise<void> {
  loadCache(agentDir);
  if (cacheIsFresh(agentDir)) return;
  const path = cachePath(agentDir);
  const existing = refreshes.get(path);
  if (existing) return existing;
  const refresh = (async () => {
    try {
      const response = await fetch(SOURCE, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`models.dev returned ${response.status}`);
      const catalog = parseCatalog(await response.json());
      if (!catalog) throw new Error("models.dev returned invalid metadata");
      writeCache(agentDir, catalog);
    } catch {
      // A stale cache remains useful. Pi's bundled metadata is the final
      // offline fallback; provider/model setup must not fail with the network.
    } finally {
      refreshes.delete(path);
    }
  })();
  refreshes.set(path, refresh);
  return refresh;
}

function normalizeUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

function providerCandidates(
  catalog: ModelsDevCatalog,
  providerName: string,
  baseUrl?: string,
): ModelsDevProvider[] {
  const result: ModelsDevProvider[] = [];
  const exact = catalog[providerName];
  if (exact) result.push(exact);

  // Pi's OAuth provider suffix identifies the auth route, while models.dev
  // catalogs the underlying model provider.
  if (providerName.endsWith("-codex")) {
    const baseProvider = catalog[providerName.slice(0, -"-codex".length)];
    if (baseProvider && !result.includes(baseProvider)) result.push(baseProvider);
  }

  const normalizedBaseUrl = normalizeUrl(baseUrl);
  if (normalizedBaseUrl) {
    for (const provider of Object.values(catalog)) {
      if (
        normalizeUrl(provider.api) === normalizedBaseUrl &&
        !result.includes(provider)
      ) {
        result.push(provider);
      }
    }
  }
  return result;
}

/**
 * Return provider-specific effort levels maintained by models.dev.
 * `[]` is meaningful: the model may reason, but exposes no effort selector.
 */
export function catalogThinkingLevels(
  agentDir: string,
  providerName: string,
  baseUrl: string | undefined,
  modelId: string,
): CatalogThinkingLevel[] | undefined {
  const catalog = loadCache(agentDir);
  if (!catalog) return undefined;
  for (const provider of providerCandidates(catalog, providerName, baseUrl)) {
    const model = provider.models?.[modelId];
    if (!model || !Array.isArray(model.reasoning_options)) continue;
    const effort = model.reasoning_options.find(
      (option) => option?.type === "effort",
    );
    if (!effort || !Array.isArray(effort.values)) return [];
    const levels: CatalogThinkingLevel[] = [];
    for (const value of effort.values) {
      const normalized = value === "none" ? "off" : value;
      if (
        (normalized === "off" ||
          normalized === "minimal" ||
          normalized === "low" ||
          normalized === "medium" ||
          normalized === "high" ||
          normalized === "xhigh" ||
          normalized === "max") &&
        !levels.includes(normalized)
      ) {
        levels.push(normalized);
      }
    }
    return levels;
  }
  return undefined;
}
