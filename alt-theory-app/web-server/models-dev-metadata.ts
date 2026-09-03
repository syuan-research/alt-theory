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
  name?: string;
  reasoning?: boolean;
  provider?: { npm?: string };
  modalities?: { input?: unknown };
  limit?: { context?: unknown; output?: unknown };
  reasoning_options?: Array<{
    type?: string;
    values?: unknown;
  }>;
}

interface ModelsDevProvider {
  api?: string;
  npm?: string;
  models?: Record<string, ModelsDevModel>;
}

type ModelsDevCatalog = Record<string, ModelsDevProvider>;

const SOURCE = "https://models.dev/api.json";
const TTL_MS = 15 * 60 * 1000;
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
    return `${url.origin}${url.pathname.replace(/\/+$/, "").replace(/\/v1$/i, "")}`;
  } catch {
    return null;
  }
}

export type CatalogSdkFamily = "openai" | "anthropic";

/** Resolve a model's SDK family from models.dev, including model overrides. */
export function catalogSdkFamily(
  agentDir: string,
  providerName: string,
  baseUrl: string | undefined,
  modelId: string,
): CatalogSdkFamily | undefined {
  const catalog = loadCache(agentDir);
  if (!catalog) return undefined;
  const hit = pickCatalogProvider(catalog, providerName, baseUrl, modelId, () => true);
  if (hit) {
    const npm = hit.model.provider?.npm ?? hit.provider.npm;
    if (npm?.includes("anthropic")) return "anthropic";
    if (npm?.includes("openai")) return "openai";
  }

  // A provider may expose a model before its own models.dev entry catches up.
  // The same model id under another provider is still useful when every known
  // occurrence agrees on the SDK family.
  const families = new Set<CatalogSdkFamily>();
  for (const provider of Object.values(catalog)) {
    const model = provider.models?.[modelId];
    if (!model) continue;
    const npm = model.provider?.npm ?? provider.npm;
    if (npm?.includes("anthropic")) families.add("anthropic");
    if (npm?.includes("openai")) families.add("openai");
  }
  if (families.size === 1) return [...families][0];
  return undefined;
}

export interface CatalogModelMetadata {
  name?: string;
  reasoning?: boolean;
  availableThinkingLevels?: CatalogThinkingLevel[];
  input?: ("text" | "image")[];
  contextWindow?: number;
  maxTokens?: number;
}

/** Fill fields omitted by bare /models endpoints without persisting a fallback. */
export function catalogModelMetadata(
  agentDir: string,
  providerName: string,
  baseUrl: string | undefined,
  modelId: string,
): CatalogModelMetadata | undefined {
  const catalog = loadCache(agentDir);
  if (!catalog) return undefined;
  const hit = pickCatalogProvider(catalog, providerName, baseUrl, modelId, () => true);
  if (!hit) return undefined;
  const model = hit.model;
  const input = Array.isArray(model.modalities?.input)
    ? model.modalities.input.filter(
        (value): value is "text" | "image" =>
          value === "text" || value === "image",
      )
    : [];
  const contextWindow = Number(model.limit?.context);
  const maxTokens = Number(model.limit?.output);
  return {
    ...(model.name ? { name: model.name } : {}),
    ...(typeof model.reasoning === "boolean"
      ? { reasoning: model.reasoning }
      : {}),
    ...(Array.isArray(model.reasoning_options)
      ? {
          availableThinkingLevels:
            thinkingLevelsFromModel(model) ?? [],
        }
      : {}),
    ...(input.length ? { input } : {}),
    ...(Number.isInteger(contextWindow) && contextWindow > 0
      ? { contextWindow }
      : {}),
    ...(Number.isInteger(maxTokens) && maxTokens > 0 ? { maxTokens } : {}),
  };
}

function providerCandidates(
  catalog: ModelsDevCatalog,
  providerName: string,
  baseUrl?: string,
): { named: ModelsDevProvider[]; byUrl: ModelsDevProvider[] } {
  const named: ModelsDevProvider[] = [];
  const exact = catalog[providerName];
  if (exact) named.push(exact);

  // Pi's OAuth provider suffix identifies the auth route, while models.dev
  // catalogs the underlying model provider.
  if (providerName.endsWith("-codex")) {
    const baseProvider = catalog[providerName.slice(0, -"-codex".length)];
    if (baseProvider && !named.includes(baseProvider)) named.push(baseProvider);
  }

  const byUrl: ModelsDevProvider[] = [];
  const normalizedBaseUrl = normalizeUrl(baseUrl);
  if (normalizedBaseUrl) {
    for (const provider of Object.values(catalog)) {
      if (
        normalizeUrl(provider.api) === normalizedBaseUrl &&
        !named.includes(provider)
      ) {
        byUrl.push(provider);
      }
    }
  }
  return { named, byUrl };
}

/**
 * The catalog provider answering for this model, or undefined. Named
 * matches (exact id, `-codex` base) are authoritative and first-match.
 * URL-only matches are unordered in the catalog, so they answer only when
 * exactly one of them carries the model — two would make the answer depend
 * on catalog key order, and the caller falls back instead.
 */
function pickCatalogProvider(
  catalog: ModelsDevCatalog,
  providerName: string,
  baseUrl: string | undefined,
  modelId: string,
  usable: (model: ModelsDevModel) => boolean,
): { provider: ModelsDevProvider; model: ModelsDevModel } | undefined {
  const { named, byUrl } = providerCandidates(catalog, providerName, baseUrl);
  for (const provider of named) {
    const model = provider.models?.[modelId];
    if (model && usable(model)) return { provider, model };
  }
  const urlMatches = byUrl
    .map((provider) => ({ provider, model: provider.models?.[modelId] }))
    .filter(
      (candidate): candidate is { provider: ModelsDevProvider; model: ModelsDevModel } =>
        candidate.model !== undefined && usable(candidate.model),
    );
  return urlMatches.length === 1 ? urlMatches[0] : undefined;
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
  const hit = pickCatalogProvider(
    catalog,
    providerName,
    baseUrl,
    modelId,
    (model) => Array.isArray(model.reasoning_options),
  );
  return hit ? (thinkingLevelsFromModel(hit.model) ?? []) : undefined;
}

function thinkingLevelsFromModel(
  model: ModelsDevModel,
): CatalogThinkingLevel[] | undefined {
  const effort = model.reasoning_options?.find(
    (option) => option?.type === "effort",
  );
  if (!effort || !Array.isArray(effort.values)) return undefined;
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
