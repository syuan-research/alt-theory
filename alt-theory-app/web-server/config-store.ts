/**
 * Pi-native model/key config store.
 *
 * This is a thin management layer over Pi's own native config files so that the
 * Alt Theory config GUI edits the SAME store Pi's own `/login` and `/model`
 * read and write. It does not invent a parallel store.
 *
 * Native files (resolved via Pi's getAgentDir(), overridable in this app by
 * PI_CODING_AGENT_DIR because Alt Theory has no piConfig.name):
 *
 *   <agentDir>/models.json     { providers: { <name>: { baseUrl, api, apiKey, models: [...] } } }
 *   <agentDir>/auth.json       { <provider>: { type: "api_key", key } }
 *   <agentDir>/settings.json   { defaultProvider, defaultModel, ... }   (active set)
 *
 * Design rule: the read view NEVER returns key plaintext; it returns a boolean
 * `hasKey`. Write paths reject `!command` apiKey values to avoid the shell-exec
 * footgun Pi permits in models.json.
 */

import {
  AuthStorage,
  getAgentDir,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { getProviders } from "@mariozechner/pi-ai";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { randomUUID } from "crypto";
import { ensureLocalModeDefaults } from "./local-mode-paths.js";

// ---------------------------------------------------------------------------
// Paths (Pi-native; local bundle points this at %USERPROFILE%\.alt-theory\pi-agent)
// ---------------------------------------------------------------------------

export function resolveAgentConfigDir(): string {
  // getAgentDir() honors PI_CODING_AGENT_DIR for this package and otherwise
  // returns ~/.pi/agent. Local mode defaults to ~/.alt-theory/pi-agent.
  ensureLocalModeDefaults();
  return getAgentDir();
}

function modelsJsonPath(agentDir: string): string {
  return join(agentDir, "models.json");
}
export function modelsConfigPath(agentDir: string): string {
  return modelsJsonPath(agentDir);
}
function authJsonPath(agentDir: string): string {
  return join(agentDir, "auth.json");
}

// ---------------------------------------------------------------------------
// Types (subset of Pi's models.json schema that the GUI manages)
// ---------------------------------------------------------------------------

export type ApiType =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai";

const API_TYPES = new Set<string>([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
]);

export interface ModelCompat {
  thinkingFormat?: string;
  requiresReasoningContentOnAssistantMessages?: boolean;
  maxTokensField?: string;
}

export interface ConfigModel {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  contextWindow?: number;
  maxTokens?: number;
  compat?: ModelCompat;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

export interface ConfigProviderInput {
  /** Provider name (key in models.json `providers`). Required. */
  name: string;
  baseUrl?: string;
  api?: ApiType;
  options?: Record<string, unknown>;
  /** Literal key or env var name. Never a `!command` (rejected). */
  apiKey?: string;
  models: ConfigModel[];
}

/** Safe, plaintext-free view returned to the GUI. */
export interface ProviderView {
  name: string;
  baseUrl?: string;
  api?: ApiType;
  options?: Record<string, unknown>;
  keyState: "stored" | "env-set" | "env-missing" | "missing";
  hasKey: boolean;
  models: ConfigModel[];
  active: boolean;
}

export interface ConfigStatus {
  agentDir: string;
  anyUsable: boolean;
  activeUsable: boolean;
  activeIssue: string | null;
  activeProvider: string | null;
  activeModel: string | null;
}

export interface FetchedModel {
  id: string;
  name?: string;
}

export interface RuntimeModelConfig {
  modelProvider?: string;
  modelId?: string;
  modelsPath?: string;
}

// ---------------------------------------------------------------------------
// models.json read/write (direct file I/O; atomic)
// ---------------------------------------------------------------------------

interface ModelsFile {
  providers?: Record<
    string,
    {
      baseUrl?: string;
      api?: string;
      apiKey?: string;
      authHeader?: boolean;
      options?: Record<string, unknown>;
      models?: ConfigModel[];
    }
  >;
}

/** MiMo Token Plan rejects Anthropic SDK x-api-key auth; Bearer is required. */
function anthropicBearerAuthRequired(
  api: string | undefined,
  baseUrl: string | undefined
): boolean {
  if (api !== "anthropic-messages" || !baseUrl) return false;
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "token-plan-cn.xiaomimimo.com";
  } catch {
    return false;
  }
}

function readModelsFile(agentDir: string): ModelsFile {
  const path = modelsJsonPath(agentDir);
  if (!existsSync(path)) return { providers: {} };
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as ModelsFile;
    if (!parsed || typeof parsed !== "object") return { providers: {} };
    if (!parsed.providers || typeof parsed.providers !== "object") {
      parsed.providers = {};
    }
    return parsed;
  } catch {
    return { providers: {} };
  }
}

function writeModelsFileAtomic(agentDir: string, data: ModelsFile): void {
  const path = modelsJsonPath(agentDir);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  renameSync(tmp, path);
}

// ---------------------------------------------------------------------------
// auth.json (via Pi's AuthStorage so locking/merge semantics match the CLI)
// ---------------------------------------------------------------------------

function readAuthStorage(agentDir: string): AuthStorage {
  return AuthStorage.create(authJsonPath(agentDir));
}

function providerHasKey(agentDir: string, provider: string): boolean {
  const storage = readAuthStorage(agentDir);
  // has() checks only the auth.json store. Do NOT use hasAuth(): it also
  // returns true for env-var keys and runtime overrides, which would make the
  // GUI misreport an env key as a "saved" key.
  return storage.has(provider);
}

function keyStateForProvider(
  agentDir: string,
  provider: string,
  block: { apiKey?: string }
): ProviderView["keyState"] {
  if (providerHasKey(agentDir, provider)) return "stored";
  if (!block.apiKey || block.apiKey === provider) return "missing";
  return process.env[block.apiKey] ? "env-set" : "env-missing";
}

function resolveEnvApiKey(envName: string): string {
  const value = process.env[envName];
  if (!value) {
    throw new ConfigValidationError(
      `Environment variable '${envName}' is not set for model refresh`
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// settings.json active provider/model (via Pi's SettingsManager)
// ---------------------------------------------------------------------------

function readActive(agentDir: string): {
  provider: string | null;
  model: string | null;
} {
  // SettingsManager.create(cwd, agentDir) reads <agentDir>/settings.json.
  const manager = SettingsManager.create(process.cwd(), agentDir);
  return {
    provider: manager.getDefaultProvider() ?? null,
    model: manager.getDefaultModel() ?? null,
  };
}

async function writeActive(
  agentDir: string,
  provider: string,
  model: string
): Promise<void> {
  const manager = SettingsManager.create(process.cwd(), agentDir);
  manager.setDefaultModelAndProvider(provider, model);
  await manager.flush();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all provider sets as a safe view (no key plaintext).
 */
export function listProviders(agentDir: string): ProviderView[] {
  const models = readModelsFile(agentDir);
  let changed = false;
  if (repairStaleLiteralAuthMarkers(agentDir, models)) {
    changed = true;
  }
  if (sanitizeCustomProviderAuth(agentDir, models)) {
    changed = true;
  }
  if (changed) {
    writeModelsFileAtomic(agentDir, models);
  }
  const active = readActive(agentDir);
  const names = Object.keys(models.providers ?? {});
  return names.map((name) => {
    const block = models.providers?.[name] ?? {};
    const keyState = keyStateForProvider(agentDir, name, block);
    return {
      name,
      baseUrl: block.baseUrl,
      api: (block.api as ApiType | undefined) ?? undefined,
      options:
        block.options && typeof block.options === "object"
          ? block.options
          : undefined,
      keyState,
      hasKey: keyState === "stored",
      models: Array.isArray(block.models) ? block.models : [],
      active: active.provider === name,
    };
  });
}

function isBuiltInProvider(name: string): boolean {
  return getProviders().includes(name);
}

function customProviderNeedsApiKey(
  name: string,
  block: { baseUrl?: string; models?: ConfigModel[] }
): boolean {
  return !isBuiltInProvider(name) && (block.models ?? []).length > 0;
}

function providerHasModels(block: { models?: ConfigModel[] }): boolean {
  return (block.models ?? []).length > 0;
}

function providerHasRuntimeAuth(
  agentDir: string,
  provider: string,
  block: { apiKey?: string }
): boolean {
  if (providerHasKey(agentDir, provider)) return true;
  if (!block.apiKey || block.apiKey === provider) return false;
  return Boolean(process.env[block.apiKey]);
}

function willHaveEffectiveKey(
  agentDir: string,
  providerName: string,
  input: ConfigProviderInput,
  options: { keyStorage?: "literal" | "env"; clearKey?: boolean }
): boolean {
  if (options.clearKey) return false;
  if (options.keyStorage === "literal" && input.apiKey) return true;
  if (options.keyStorage === "env" && input.apiKey) return true;
  return providerHasKey(agentDir, providerName);
}

function fetchApiKeyFromStoredMarker(
  provider: string,
  marker: string | undefined
): string | undefined {
  if (!marker || marker === provider) return undefined;
  return resolveEnvApiKey(marker);
}

function repairStaleLiteralAuthMarkers(
  agentDir: string,
  models: ModelsFile
): boolean {
  let changed = false;
  const providers = models.providers ?? {};
  for (const [name, block] of Object.entries(providers)) {
    if (block.apiKey === name && !providerHasKey(agentDir, name)) {
      delete block.apiKey;
      changed = true;
    }
  }
  return changed;
}

function normalizeRuntimeBaseUrl(api: string | undefined, baseUrl: string | undefined): string | undefined {
  if (!baseUrl) return undefined;
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (api === "anthropic-messages") {
    return trimmed.replace(/\/v1$/i, "");
  }
  return trimmed;
}

function modelListUrls(api: ApiType | undefined, baseUrl: string): string[] {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  const urls = [`${trimmed}/models`];
  if (api === "anthropic-messages" && !/\/v1$/i.test(trimmed)) {
    urls.unshift(`${trimmed}/v1/models`);
  }
  return [...new Set(urls)];
}

function sanitizeCustomProviderAuth(agentDir: string, models: ModelsFile): boolean {
  let changed = false;
  const providers = models.providers ?? {};
  for (const [name, block] of Object.entries(providers)) {
    const normalizedBaseUrl = normalizeRuntimeBaseUrl(block.api, block.baseUrl);
    if (normalizedBaseUrl && normalizedBaseUrl !== block.baseUrl) {
      block.baseUrl = normalizedBaseUrl;
      changed = true;
    }
    if (
      anthropicBearerAuthRequired(block.api, block.baseUrl) &&
      block.authHeader !== true
    ) {
      block.authHeader = true;
      changed = true;
    }
    if (!customProviderNeedsApiKey(name, block)) continue;
    if (!block.baseUrl) {
      delete providers[name];
      changed = true;
      continue;
    }
    if (block.apiKey) continue;
    if (providerHasKey(agentDir, name)) {
      block.apiKey = name;
    } else {
      delete providers[name];
    }
    changed = true;
  }
  return changed;
}

export async function fetchProviderModels(
  agentDir: string,
  provider: string
): Promise<FetchedModel[]> {
  assertValidProviderName(provider);
  const modelsFile = readModelsFile(agentDir);
  const block = modelsFile.providers?.[provider];
  if (!block) {
    throw new ConfigValidationError(`Unknown provider: ${provider}`);
  }
  return fetchModelsFromEndpoint(agentDir, {
    provider,
    baseUrl: block.baseUrl,
    api: block.api as ApiType | undefined,
    apiKey: fetchApiKeyFromStoredMarker(provider, block.apiKey),
  });
}

export async function fetchProviderModelsFromDraft(
  agentDir: string,
  input: {
    provider: string;
    baseUrl?: string;
    api?: ApiType;
    apiKey?: string;
    keyStorage?: "literal" | "env";
  }
): Promise<FetchedModel[]> {
  assertValidProviderName(input.provider);
  assertValidApiType(input.api);
  assertNotCommandKey(input.apiKey);
  return fetchModelsFromEndpoint(agentDir, {
    ...input,
    apiKey:
      input.keyStorage === "env" && input.apiKey
        ? resolveEnvApiKey(input.apiKey)
        : input.apiKey,
  });
}

async function fetchModelsFromEndpoint(
  agentDir: string,
  input: {
    provider: string;
    baseUrl?: string;
    api?: ApiType;
    apiKey?: string;
  }
): Promise<FetchedModel[]> {
  if (!input.baseUrl) {
    throw new ConfigValidationError(
      "Model refresh needs a Base URL. Use manual model entry for built-in providers."
    );
  }

  const storage = readAuthStorage(agentDir);
  storage.setFallbackResolver((name) =>
    name === input.provider ? input.apiKey : undefined
  );
  const apiKey = await storage.getApiKey(input.provider);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey) {
    if (input.api === "anthropic-messages") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
    }
  }

  const errors: string[] = [];
  for (const endpoint of modelListUrls(input.api, input.baseUrl)) {
    const response = await fetch(endpoint, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      errors.push(`${endpoint}: HTTP ${response.status}`);
      continue;
    }
    const payload = (await response.json()) as unknown;
    const candidates = normalizeModelListPayload(payload);
    if (candidates.length === 0) {
      errors.push(`${endpoint}: no recognizable model ids`);
      continue;
    }
    return candidates;
  }
  if (
    anthropicBearerAuthRequired(input.api, input.baseUrl) &&
    errors.every((entry) => entry.includes("HTTP 404"))
  ) {
    throw new ConfigValidationError(
      "MiMo Token Plan does not expose a model list API. Enter the model id manually (for example mimo-v2.5-pro)."
    );
  }
  throw new ConfigValidationError(`Model refresh failed: ${errors.join("; ")}`);
}

export function getRuntimeModelConfig(agentDir: string): RuntimeModelConfig {
  const active = readActive(agentDir);
  if (!active.provider || !active.model) return {};

  const models = readModelsFile(agentDir);
  if (sanitizeCustomProviderAuth(agentDir, models)) {
    writeModelsFileAtomic(agentDir, models);
  }
  const block = models.providers?.[active.provider];
  const knownIds = (block?.models ?? []).map((m) => m.id);
  if (!block) {
    throw new ConfigValidationError(
      `Active provider '${active.provider}' is not configured`
    );
  }
  if (!knownIds.includes(active.model)) {
    throw new ConfigValidationError(
      `Active model '${active.model}' is not defined under provider '${active.provider}'`
    );
  }
  const hasStoredKey = providerHasKey(agentDir, active.provider);
  if (!providerHasRuntimeAuth(agentDir, active.provider, block)) return {};
  if (block.apiKey === active.provider && !hasStoredKey) return {};
  if (hasStoredKey && !block.apiKey) {
    block.apiKey = active.provider;
    writeModelsFileAtomic(agentDir, models);
  }

  return {
    modelProvider: active.provider,
    modelId: active.model,
    modelsPath: modelsJsonPath(agentDir),
  };
}

/**
 * Is any provider usable (present in models.json AND has a key)?
 * Drives the first-run landing decision.
 */
export function getConfigStatus(agentDir: string): ConfigStatus {
  const providers = listProviders(agentDir);
  const anyUsable = providers.some(
    (p) =>
      (p.keyState === "stored" || p.keyState === "env-set") &&
      p.models.length > 0
  );
  const active = readActive(agentDir);
  const activeProvider = providers.find((p) => p.name === active.provider);
  const activeUsable = Boolean(
    activeProvider &&
      active.model &&
      (activeProvider.keyState === "stored" ||
        activeProvider.keyState === "env-set") &&
      activeProvider.models.some((model) => model.id === active.model)
  );
  const activeIssue =
    active.provider && active.model && !activeUsable
      ? "Active provider/model is not usable. Save a key and choose a model before starting a session."
      : null;
  return {
    agentDir,
    anyUsable,
    activeUsable,
    activeIssue,
    activeProvider: active.provider,
    activeModel: active.model,
  };
}

export class ConfigValidationError extends Error {}

function normalizeModelListPayload(payload: unknown): FetchedModel[] {
  const source = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : [];
  const seen = new Set<string>();
  const result: FetchedModel[] = [];
  for (const item of source) {
    const id =
      typeof item === "string"
        ? item
        : item && typeof item === "object"
          ? String(
              (item as { id?: unknown; name?: unknown; model?: unknown }).id ??
                (item as { id?: unknown; name?: unknown; model?: unknown }).name ??
                (item as { id?: unknown; name?: unknown; model?: unknown }).model ??
                ""
            )
          : "";
    const normalized = id.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push({ id: normalized, name: normalized });
  }
  return result;
}

function assertValidProviderName(name: string): void {
  if (!name || typeof name !== "string") {
    throw new ConfigValidationError("Provider name is required");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
    throw new ConfigValidationError(
      "Provider name must be alphanumeric (dashes/dots/underscores allowed)"
    );
  }
}

function assertValidApiType(api: string | undefined): void {
  if (api === undefined) return;
  if (!API_TYPES.has(api)) {
    throw new ConfigValidationError(`Unsupported API type: ${api}`);
  }
}

function assertNotCommandKey(key: string | undefined): void {
  if (typeof key === "string" && key.startsWith("!")) {
    throw new ConfigValidationError(
      "Shell-command keys (!command) are not allowed in the GUI; use a literal key or an env var name"
    );
  }
}

/**
 * Upsert a provider set into models.json and (if a key is supplied) write the
 * key into auth.json. `apiKey` may be:
 *   - undefined / empty: key is not touched (leave existing key as-is)
 *   - a literal key: stored verbatim into auth.json
 *   - an env var name (no `!`): stored into models.json `apiKey` field so Pi
 *     resolves it from the environment at request time
 *
 * The `keyStorage` field makes the intent explicit on write.
 */
export function upsertProvider(
  agentDir: string,
  input: ConfigProviderInput,
  options: { keyStorage?: "literal" | "env"; clearKey?: boolean } = {}
): ProviderView {
  assertValidProviderName(input.name);
  assertValidApiType(input.api);
  assertNotCommandKey(input.apiKey);
  if (!Array.isArray(input.models) || input.models.length === 0) {
    throw new ConfigValidationError("At least one model is required");
  }
  for (const m of input.models) {
    if (!m.id) {
      throw new ConfigValidationError("Each model needs an id");
    }
  }

  const models = readModelsFile(agentDir);
  models.providers = models.providers ?? {};
  const existingBlock = models.providers[input.name];

  const runtimeBaseUrl = normalizeRuntimeBaseUrl(input.api, input.baseUrl);
  const providerBlock: Record<string, unknown> = { models: input.models };
  if (runtimeBaseUrl) providerBlock.baseUrl = runtimeBaseUrl;
  if (input.api) providerBlock.api = input.api;
  if (input.options && Object.keys(input.options).length > 0) {
    providerBlock.options = input.options;
  }
  if (anthropicBearerAuthRequired(input.api, runtimeBaseUrl)) {
    providerBlock.authHeader = true;
  }

  // Env-var-named keys live in models.json apiKey field (Pi resolves at runtime).
  // Literal keys live in auth.json (Pi's standard api_key credential), but Pi
  // still requires an apiKey marker in models.json for non-built-in custom
  // providers with model definitions.
  let apiKeyConfig: string | undefined;
  if (options.keyStorage === "env" && input.apiKey) {
    apiKeyConfig = input.apiKey;
  } else if (options.keyStorage === "literal" && input.apiKey) {
    apiKeyConfig = input.name;
  } else if (!options.clearKey && existingBlock?.apiKey) {
    const existingMarker = existingBlock.apiKey;
    if (existingMarker === input.name) {
      if (providerHasKey(agentDir, input.name)) {
        apiKeyConfig = existingMarker;
      }
    } else {
      apiKeyConfig = existingMarker;
    }
  } else if (!options.clearKey && providerHasKey(agentDir, input.name)) {
    apiKeyConfig = input.name;
  }

  const hasEffectiveKey = willHaveEffectiveKey(agentDir, input.name, input, options);

  if (
    providerHasModels({ models: input.models }) &&
    customProviderNeedsApiKey(input.name, {
      baseUrl: runtimeBaseUrl,
      models: input.models,
    }) &&
    !runtimeBaseUrl
  ) {
    throw new ConfigValidationError(
      "Base URL is required for custom providers."
    );
  }
  if (apiKeyConfig) {
    providerBlock.apiKey = apiKeyConfig;
  }
  models.providers[input.name] = providerBlock as {
    baseUrl?: string;
    api?: string;
    apiKey?: string;
    options?: Record<string, unknown>;
    models?: ConfigModel[];
  };
  writeModelsFileAtomic(agentDir, models);

  // Key handling for auth.json.
  if (options.clearKey) {
    const storage = readAuthStorage(agentDir);
    storage.remove(input.name);
  } else if (options.keyStorage === "literal" && input.apiKey) {
    const storage = readAuthStorage(agentDir);
    storage.set(input.name, { type: "api_key", key: input.apiKey });
  }

  const keyState = keyStateForProvider(agentDir, input.name, {
    apiKey: apiKeyConfig,
  });
  return {
    name: input.name,
    baseUrl: runtimeBaseUrl,
    api: input.api,
    options: input.options,
    keyState: options.clearKey ? "missing" : keyState,
    hasKey: options.clearKey ? false : keyState === "stored",
    models: input.models,
    active: false,
  };
}

export function deleteProvider(agentDir: string, name: string): void {
  assertValidProviderName(name);
  const models = readModelsFile(agentDir);
  if (models.providers && models.providers[name]) {
    delete models.providers[name];
    writeModelsFileAtomic(agentDir, models);
  }
  const storage = readAuthStorage(agentDir);
  if (storage.hasAuth(name)) {
    storage.remove(name);
  }
  // If the deleted provider was the active one, clear the active pointer.
  const active = readActive(agentDir);
  if (active.provider === name) {
    // Clear by setting to empty is not supported by Pi's API; instead write
    // settings.json with defaultProvider/defaultModel removed.
    clearActive(agentDir);
  }
}

export async function setActive(
  agentDir: string,
  provider: string,
  model: string
): Promise<void> {
  assertValidProviderName(provider);
  const models = readModelsFile(agentDir);
  const block = models.providers?.[provider];
  if (!block) {
    throw new ConfigValidationError(`Unknown provider: ${provider}`);
  }
  const knownIds = (block.models ?? []).map((m) => m.id);
  if (!knownIds.includes(model)) {
    throw new ConfigValidationError(
      `Model '${model}' is not defined under provider '${provider}'`
    );
  }
  if (!providerHasRuntimeAuth(agentDir, provider, block)) {
    throw new ConfigValidationError(
      `Provider '${provider}' needs a saved API key or env-var key before it can be active`
    );
  }
  await writeActive(agentDir, provider, model);
}

/**
 * Clear the active provider/model pointer. Writes an empty settings.json so
 * Pi does not launch with a stale default after a provider is deleted.
 */
export function clearActive(agentDir: string): void {
  // Write minimal settings.json with no default provider/model. SettingsManager
  // reads this on next launch; absence of defaultProvider/defaultModel makes Pi
  // pick the first available model with auth (Pi's findInitialModel fallback).
  const path = join(agentDir, "settings.json");
  mkdirSync(dirname(path), { recursive: true });
  // Preserve any existing settings fields, just drop the two default fields.
  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      existing = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }
  delete existing.defaultProvider;
  delete existing.defaultModel;
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(existing, null, 2)}\n`, "utf-8");
  renameSync(tmp, path);
}

/** Resolve the agent config dir once at request time (used by server.ts). */
export function agentConfigDir(): string {
  return resolveAgentConfigDir();
}
