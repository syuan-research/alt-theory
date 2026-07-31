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
  getAgentDir,
  ModelRuntime,
  readStoredCredential,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  getBuiltinModels,
  getBuiltinProviders,
  type BuiltinProvider,
} from "@earendil-works/pi-ai/providers/all";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
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
import { catalogThinkingLevels } from "./models-dev-metadata.js";

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
  /** Optional user correction persisted in models.json. */
  thinkingLevels?: ThinkingLevel[];
  /** Resolved catalog/user levels returned to the UI; never persisted. */
  availableThinkingLevels?: ThinkingLevel[];
  thinkingLevelMap?: Partial<
    Record<"off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", string | null>
  >;
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
  keyState: "stored" | "oauth" | "env-set" | "env-missing" | "missing";
  hasKey: boolean;
  models: ConfigModel[];
  active: boolean;
  warning?: string;
}

export interface ConfigStatus {
  agentDir: string;
  anyUsable: boolean;
  activeUsable: boolean;
  activeIssue: string | null;
  activeProvider: string | null;
  activeModel: string | null;
}

export interface FetchedModel extends ConfigModel {}

export interface RuntimeModelConfig {
  modelProvider?: string;
  modelId?: string;
  modelsPath?: string;
  authPath?: string;
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

/** MiMo Token Plan CN Anthropic-compatible endpoint rejects SDK x-api-key auth; Bearer is required. */
function anthropicBearerAuthRequired(
  api: string | undefined,
  baseUrl: string | undefined,
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
// auth.json (reads use Pi's safe metadata helper; writes go through ModelRuntime)
// ---------------------------------------------------------------------------

function storedCredential(agentDir: string, provider: string) {
  return readStoredCredential(provider, authJsonPath(agentDir));
}

function providerHasCredential(agentDir: string, provider: string): boolean {
  return Boolean(storedCredential(agentDir, provider));
}

function keyStateForProvider(
  agentDir: string,
  provider: string,
  block: { apiKey?: string },
): ProviderView["keyState"] {
  const credential = storedCredential(agentDir, provider);
  if (credential?.type === "oauth") return "oauth";
  if (credential?.type === "api_key") return "stored";
  if (!block.apiKey || block.apiKey === provider) return "missing";
  return process.env[block.apiKey] ? "env-set" : "env-missing";
}

async function runtimeFor(agentDir: string): Promise<ModelRuntime> {
  return ModelRuntime.create({
    authPath: authJsonPath(agentDir),
    modelsPath: modelsJsonPath(agentDir),
  });
}

async function persistApiKey(
  agentDir: string,
  provider: string,
  apiKey: string,
): Promise<void> {
  const runtime = await runtimeFor(agentDir);
  await runtime.login(provider, "api_key", {
    prompt: async () => apiKey,
    notify: () => {},
  });
}

async function removeCredential(
  agentDir: string,
  provider: string,
): Promise<void> {
  const runtime = await runtimeFor(agentDir);
  await runtime.logout(provider);
}

async function resolvedProviderApiKey(
  agentDir: string,
  provider: string,
): Promise<string | undefined> {
  const runtime = await runtimeFor(agentDir);
  return (await runtime.getAuth(provider))?.auth.apiKey;
}

function resolveEnvApiKey(envName: string): string {
  const value = process.env[envName];
  if (!value) {
    throw new ConfigValidationError(
      `Environment variable '${envName}' is not set for model refresh`,
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
  model: string,
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
  const names = new Set(Object.keys(models.providers ?? {}));
  for (const name of ["openrouter", "xai", "openai-codex"]) {
    if (providerHasCredential(agentDir, name)) names.add(name);
  }
  return [...names].map((name) => {
    const block = models.providers?.[name] ?? {};
    const configuredModels = Array.isArray(block.models) ? block.models : [];
    const sourceModels =
      configuredModels.length > 0
        ? configuredModels
        : builtinConfigModels(name);
    const firstBuiltin = builtinModelList(name).find(
      (model) => model.id === sourceModels[0]?.id,
    );
    const baseUrl = block.baseUrl ?? firstBuiltin?.baseUrl;
    const viewModels = sourceModels.map((model) => {
      const builtin = builtinModelList(name).find(
        (candidate) => candidate.id === model.id,
      );
      return {
        ...model,
        availableThinkingLevels:
          model.thinkingLevels ??
          catalogThinkingLevels(agentDir, name, baseUrl, model.id) ??
          piBuiltinThinkingLevels(builtin),
      };
    });
    const keyState = keyStateForProvider(agentDir, name, block);
    return {
      name,
      baseUrl,
      api:
        keyState === "oauth"
          ? undefined
          : ((block.api as ApiType | undefined) ??
            (firstBuiltin?.api as ApiType | undefined)),
      options:
        block.options && typeof block.options === "object"
          ? block.options
          : undefined,
      keyState,
      hasKey: keyState === "stored",
      models: viewModels,
      active: active.provider === name,
      warning: providerWarning(name),
    };
  });
}

export function initialThinkingLevelForModel(
  agentDir: string,
  providerName: string,
  modelId: string,
): ThinkingLevel {
  const model = listProviders(agentDir)
    .find((provider) => provider.name === providerName)
    ?.models.find((candidate) => candidate.id === modelId);
  if (!model?.reasoning) return "off";
  const levels =
    model.availableThinkingLevels?.filter((level) => level !== "off") ?? [];
  return levels[Math.floor((levels.length - 1) / 2)] ?? "off";
}

function isBuiltInProvider(name: string): boolean {
  return (getBuiltinProviders() as string[]).includes(name);
}

function builtinModelList(name: string) {
  if (!isBuiltInProvider(name)) return [];
  return getBuiltinModels(name as BuiltinProvider);
}

function builtinConfigModels(name: string): ConfigModel[] {
  return builtinModelList(name).map((model) => ({
    id: model.id,
    name: model.name,
    reasoning: model.reasoning,
    thinkingLevelMap: model.thinkingLevelMap,
    input: model.input,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    compat: model.compat,
    cost: model.cost,
  }));
}

function piBuiltinThinkingLevels(
  model:
    | {
        reasoning?: boolean;
        thinkingLevelMap?: ConfigModel["thinkingLevelMap"];
      }
    | undefined,
): ThinkingLevel[] {
  if (!model?.reasoning) return [];
  const map = model.thinkingLevelMap;
  const levels: ThinkingLevel[] = (
    ["off", "minimal", "low", "medium", "high"] as const
  ).filter(
    (level) => map?.[level] !== null,
  );
  for (const level of ["xhigh", "max"] as const) {
    if (typeof map?.[level] === "string") levels.push(level);
  }
  return levels;
}

function customProviderNeedsApiKey(
  name: string,
  block: { baseUrl?: string; models?: ConfigModel[] },
): boolean {
  return !isBuiltInProvider(name) && (block.models ?? []).length > 0;
}

function providerHasModels(block: { models?: ConfigModel[] }): boolean {
  return (block.models ?? []).length > 0;
}

function providerWarning(name: string): string | undefined {
  if (name === "opencode-go") {
    return "This legacy OpenCode Go provider mixed OpenAI-compatible and Anthropic-compatible models. Recreate it as opencode-go-openai or opencode-go-anthropic.";
  }
  return undefined;
}

function providerHasRuntimeAuth(
  agentDir: string,
  provider: string,
  block: { apiKey?: string },
): boolean {
  if (providerHasCredential(agentDir, provider)) return true;
  if (!block.apiKey || block.apiKey === provider) return false;
  return Boolean(process.env[block.apiKey]);
}

function willHaveEffectiveKey(
  agentDir: string,
  providerName: string,
  input: ConfigProviderInput,
  options: { keyStorage?: "literal" | "env"; clearKey?: boolean },
): boolean {
  if (options.clearKey) return false;
  if (options.keyStorage === "literal" && input.apiKey) return true;
  if (options.keyStorage === "env" && input.apiKey) return true;
  return providerHasCredential(agentDir, providerName);
}

function fetchApiKeyFromStoredMarker(
  provider: string,
  marker: string | undefined,
): string | undefined {
  if (!marker || marker === provider) return undefined;
  return resolveEnvApiKey(marker);
}

function repairStaleLiteralAuthMarkers(
  agentDir: string,
  models: ModelsFile,
): boolean {
  let changed = false;
  const providers = models.providers ?? {};
  for (const [name, block] of Object.entries(providers)) {
    if (block.apiKey === name && !providerHasCredential(agentDir, name)) {
      delete block.apiKey;
      changed = true;
    }
  }
  return changed;
}

function normalizeRuntimeBaseUrl(
  api: string | undefined,
  baseUrl: string | undefined,
): string | undefined {
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

function sanitizeCustomProviderAuth(
  agentDir: string,
  models: ModelsFile,
): boolean {
  let changed = false;
  const providers = models.providers ?? {};
  for (const [name, block] of Object.entries(providers)) {
    if (
      ["openrouter", "xai", "openai-codex"].includes(name) &&
      storedCredential(agentDir, name)?.type === "oauth"
    ) {
      delete providers[name];
      changed = true;
      continue;
    }
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
    if (providerHasCredential(agentDir, name)) {
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
  provider: string,
): Promise<FetchedModel[]> {
  assertValidProviderName(provider);
  const modelsFile = readModelsFile(agentDir);
  const block = modelsFile.providers?.[provider];
  const builtins = builtinConfigModels(provider);
  if (
    provider === "xai" &&
    storedCredential(agentDir, provider)?.type === "oauth"
  ) {
    const first = builtinModelList(provider)[0];
    const fetched = await fetchModelsFromEndpoint(agentDir, {
      provider,
      baseUrl: first?.baseUrl,
      api: first?.api as ApiType | undefined,
    });
    const accessible = new Set(fetched.map((model) => model.id));
    return builtins
      .filter((model) => accessible.has(model.id))
      .map((model) => ({ ...model }));
  }
  if (!block) {
    if (builtins.length > 0) {
      return builtins.map((model) => ({ ...model }));
    }
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
  },
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
  },
): Promise<FetchedModel[]> {
  if (!input.baseUrl) {
    throw new ConfigValidationError(
      "Model refresh needs a Base URL. Use manual model entry for built-in providers.",
    );
  }

  const apiKey =
    input.apiKey ?? (await resolvedProviderApiKey(agentDir, input.provider));
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
    // One retry: a dropped connection or a 5xx is usually the network having a
    // bad second, and making the user click Fetch again teaches them the
    // feature is unreliable.
    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const attempted = await fetch(endpoint, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(10000),
        });
        if (attempted.ok || attempted.status < 500 || attempt === 1) {
          response = attempted;
          break;
        }
        errors.push(`${endpoint}: HTTP ${attempted.status}`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "request failed";
        if (attempt === 1) {
          errors.push(`${endpoint}: ${message}`);
          break;
        }
      }
    }
    if (!response) continue;
    if (!response.ok) {
      errors.push(`${endpoint}: HTTP ${response.status}`);
      continue;
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      errors.push(`${endpoint}: invalid JSON`);
      continue;
    }
    const candidates = normalizeModelListPayload(payload);
    if (candidates.length === 0) {
      errors.push(`${endpoint}: no recognizable model ids`);
      continue;
    }
    // The provider entry already declares its SDK through its API type and
    // base URL, and that is what the runtime will speak to these models. A
    // third-party catalog is metadata, never a gate: an id it has not indexed
    // yet — or a lookup that failed because models.dev was unreachable — must
    // not make a model the provider itself listed disappear.
    return candidates;
  }
  if (
    anthropicBearerAuthRequired(input.api, input.baseUrl) &&
    errors.every((entry) => entry.includes("HTTP 404"))
  ) {
    throw new ConfigValidationError(
      "MiMo Token Plan CN Anthropic-compatible endpoint does not expose a model list API. Enter the model id manually (for example mimo-v2.5-pro).",
    );
  }
  throw new ConfigValidationError(
    `Model refresh failed: ${errors[0] ?? "no model-list endpoint responded"}`,
  );
}

export function getRuntimeModelConfig(agentDir: string): RuntimeModelConfig {
  const active = readActive(agentDir);
  if (!active.provider || !active.model) return {};

  const models = readModelsFile(agentDir);
  if (sanitizeCustomProviderAuth(agentDir, models)) {
    writeModelsFileAtomic(agentDir, models);
  }
  const block = models.providers?.[active.provider];
  const knownIds = (
    block?.models?.length ? block.models : builtinConfigModels(active.provider)
  ).map((m) => m.id);
  if (!block && knownIds.length === 0) {
    throw new ConfigValidationError(
      `Active provider '${active.provider}' is not configured`,
    );
  }
  if (!knownIds.includes(active.model)) {
    throw new ConfigValidationError(
      `Active model '${active.model}' is not defined under provider '${active.provider}'`,
    );
  }
  const hasStoredKey = providerHasCredential(agentDir, active.provider);
  if (!providerHasRuntimeAuth(agentDir, active.provider, block)) return {};
  if (block?.apiKey === active.provider && !hasStoredKey) return {};
  if (block && hasStoredKey && !block.apiKey) {
    block.apiKey = active.provider;
    writeModelsFileAtomic(agentDir, models);
  }

  return {
    modelProvider: active.provider,
    modelId: active.model,
    modelsPath: modelsJsonPath(agentDir),
    authPath: authJsonPath(agentDir),
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
      (p.keyState === "stored" ||
        p.keyState === "oauth" ||
        p.keyState === "env-set") &&
      p.models.length > 0,
  );
  const active = readActive(agentDir);
  const activeProvider = providers.find((p) => p.name === active.provider);
  const activeUsable = Boolean(
    activeProvider &&
    active.model &&
    (activeProvider.keyState === "stored" ||
      activeProvider.keyState === "oauth" ||
      activeProvider.keyState === "env-set") &&
    activeProvider.models.some((model) => model.id === active.model),
  );
  const activeWarning = activeProvider
    ? providerWarning(activeProvider.name)
    : undefined;
  const activeIssue =
    activeWarning ??
    (active.provider && active.model && !activeUsable
      ? "Active provider/model is not usable. Save a key and choose a model before starting a session."
      : null);
  return {
    agentDir,
    anyUsable,
    activeUsable,
    activeIssue,
    activeProvider: active.provider,
    activeModel: active.model,
  };
}

/**
 * Verify an expired active OAuth credential through the same ModelRuntime
 * resolver used by real turns. A stored refresh token is connection metadata,
 * not proof that the active model is currently usable.
 */
export async function getVerifiedConfigStatus(
  agentDir: string,
  resolveOAuth: (provider: string) => Promise<boolean> = async (provider) => {
    const runtime = await runtimeFor(agentDir);
    return Boolean(await runtime.getAuth(provider));
  },
): Promise<ConfigStatus> {
  const status = getConfigStatus(agentDir);
  if (!status.activeUsable || !status.activeProvider) return status;
  const credential = storedCredential(agentDir, status.activeProvider);
  if (credential?.type !== "oauth" || credential.expires > Date.now()) {
    return status;
  }
  try {
    if (await resolveOAuth(status.activeProvider)) return getConfigStatus(agentDir);
  } catch {
    // The precise provider error remains in the runtime/send path. Config UI
    // only needs a safe, actionable truth state without exposing auth details.
  }
  return {
    ...status,
    activeUsable: false,
    activeIssue: `OAuth for '${status.activeProvider}' could not be refreshed. Reconnect this account before starting a conversation.`,
  };
}

export class ConfigValidationError extends Error {}

export function normalizeModelListPayload(payload: unknown): FetchedModel[] {
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
    const row =
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : null;
    const id =
      typeof item === "string"
        ? item
        : row
          ? String(
              row.id ??
                row.name ??
                row.model ??
                "",
            )
          : "";
    const normalized = id.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    const name =
      typeof row?.name === "string" && row.name.trim()
        ? row.name.trim()
        : normalized;
    const contextWindow = positiveInteger(
      row?.contextWindow ??
        row?.context_window ??
        row?.context_length ??
        row?.max_context_length,
    );
    const maxTokens = positiveInteger(
      row?.maxTokens ?? row?.max_tokens ?? row?.max_output_tokens,
    );
    const input = normalizeModelInput(row?.input ?? row?.input_modalities);
    const thinkingLevels =
      normalizeThinkingLevels(row?.thinkingLevels ?? row?.thinking_levels) ??
      normalizeReasoningOptions(row?.reasoning_options);
    const thinkingLevelMap = normalizeThinkingLevelMap(
      row?.thinkingLevelMap ?? row?.thinking_level_map,
    );
    result.push({
      id: normalized,
      name,
      ...(typeof row?.reasoning === "boolean"
        ? { reasoning: row.reasoning }
        : thinkingLevels?.length
          ? { reasoning: true }
          : {}),
      ...(thinkingLevels !== undefined ? { thinkingLevels } : {}),
      ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
      ...(input ? { input } : {}),
      ...(contextWindow ? { contextWindow } : {}),
      ...(maxTokens ? { maxTokens } : {}),
    });
  }
  return result;
}

function positiveInteger(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function normalizeModelInput(value: unknown): ("text" | "image")[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const input = value.filter(
    (entry): entry is "text" | "image" => entry === "text" || entry === "image",
  );
  return input.length > 0 ? [...new Set(input)] : undefined;
}

function normalizeThinkingLevels(
  value: unknown,
): ThinkingLevel[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const allowed = new Set<ThinkingLevel>([
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
  const result: ThinkingLevel[] = [];
  for (const entry of value) {
    const normalized = entry === "none" ? "off" : entry;
    if (
      typeof normalized === "string" &&
      allowed.has(normalized as ThinkingLevel) &&
      !result.includes(normalized as ThinkingLevel)
    ) {
      result.push(normalized as ThinkingLevel);
    }
  }
  return result;
}

function normalizeReasoningOptions(value: unknown): ThinkingLevel[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const effort = value.find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      (entry as { type?: unknown }).type === "effort",
  ) as { values?: unknown } | undefined;
  return effort ? (normalizeThinkingLevels(effort.values) ?? []) : [];
}

function normalizeThinkingLevelMap(
  value: unknown,
): ConfigModel["thinkingLevelMap"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const allowed = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
  const result: NonNullable<ConfigModel["thinkingLevelMap"]> = {};
  for (const level of allowed) {
    const mapped = (value as Record<string, unknown>)[level];
    if (typeof mapped === "string") result[level] = mapped;
    else if (mapped === null) result[level] = null;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function assertValidProviderName(name: string): void {
  if (!name || typeof name !== "string") {
    throw new ConfigValidationError("Provider name is required");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
    throw new ConfigValidationError(
      "Provider name must be alphanumeric (dashes/dots/underscores allowed)",
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
      "Shell-command keys (!command) are not allowed in the GUI; use a literal key or an env var name",
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
export async function upsertProvider(
  agentDir: string,
  input: ConfigProviderInput,
  options: { keyStorage?: "literal" | "env"; clearKey?: boolean } = {},
): Promise<ProviderView> {
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
  const persistedModels = input.models.map(
    ({
      availableThinkingLevels: _availableThinkingLevels,
      thinkingLevels,
      ...model
    }) => ({
      ...model,
      ...(thinkingLevels !== undefined
        ? { thinkingLevels: normalizeThinkingLevels(thinkingLevels) ?? [] }
        : {}),
    }),
  );
  const providerBlock: Record<string, unknown> = { models: persistedModels };
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
      if (providerHasCredential(agentDir, input.name)) {
        apiKeyConfig = existingMarker;
      }
    } else {
      apiKeyConfig = existingMarker;
    }
  } else if (!options.clearKey && providerHasCredential(agentDir, input.name)) {
    apiKeyConfig = input.name;
  }

  const hasEffectiveKey = willHaveEffectiveKey(
    agentDir,
    input.name,
    input,
    options,
  );

  if (
    providerHasModels({ models: input.models }) &&
    customProviderNeedsApiKey(input.name, {
      baseUrl: runtimeBaseUrl,
      models: persistedModels,
    }) &&
    !runtimeBaseUrl
  ) {
    throw new ConfigValidationError(
      "Base URL is required for custom providers.",
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
    await removeCredential(agentDir, input.name);
  } else if (options.keyStorage === "literal" && input.apiKey) {
    await persistApiKey(agentDir, input.name, input.apiKey);
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
    models: persistedModels,
    active: false,
  };
}

export async function deleteProvider(
  agentDir: string,
  name: string,
): Promise<void> {
  assertValidProviderName(name);
  const models = readModelsFile(agentDir);
  if (models.providers && models.providers[name]) {
    delete models.providers[name];
    writeModelsFileAtomic(agentDir, models);
  }
  if (providerHasCredential(agentDir, name)) {
    await removeCredential(agentDir, name);
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
  model: string,
): Promise<void> {
  assertValidProviderName(provider);
  const models = readModelsFile(agentDir);
  const block = models.providers?.[provider];
  const knownIds = (
    block?.models?.length ? block.models : builtinConfigModels(provider)
  ).map((m) => m.id);
  if (!block && knownIds.length === 0) {
    throw new ConfigValidationError(`Unknown provider: ${provider}`);
  }
  if (!knownIds.includes(model)) {
    throw new ConfigValidationError(
      `Model '${model}' is not defined under provider '${provider}'`,
    );
  }
  if (!providerHasRuntimeAuth(agentDir, provider, block ?? {})) {
    throw new ConfigValidationError(
      `Provider '${provider}' needs a saved API key or env-var key before it can be active`,
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
      existing = JSON.parse(readFileSync(path, "utf-8")) as Record<
        string,
        unknown
      >;
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

/**
 * Minimal live probe of a provider draft (M-final settings review): one tiny
 * completion request against the draft's endpoint/key/model. Works for
 * manual-model providers where the /models fetch cannot validate anything.
 */
export async function testProviderConnectionFromDraft(
  agentDir: string,
  input: {
    provider: string;
    baseUrl?: string;
    api?: ApiType;
    apiKey?: string;
    keyStorage?: "literal" | "env";
    modelId?: string;
  },
): Promise<{ ok: true; modelId: string }> {
  assertValidProviderName(input.provider);
  assertValidApiType(input.api);
  assertNotCommandKey(input.apiKey);
  if (!input.baseUrl) {
    throw new ConfigValidationError("Connection test needs a Base URL.");
  }
  if (!input.modelId) {
    throw new ConfigValidationError("Connection test needs a model id.");
  }
  const resolvedKey =
    input.keyStorage === "env" && input.apiKey
      ? resolveEnvApiKey(input.apiKey)
      : input.apiKey;
  const apiKey =
    resolvedKey ?? (await resolvedProviderApiKey(agentDir, input.provider));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (apiKey) {
    if (
      input.api === "anthropic-messages" &&
      !anthropicBearerAuthRequired(input.api, input.baseUrl)
    ) {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
      if (input.api === "anthropic-messages") {
        headers["anthropic-version"] = "2023-06-01";
      }
    }
  }

  const base = input.baseUrl.replace(/\/+$/, "");
  const probes: Array<{ url: string; body: Record<string, unknown> }> = [];
  if (input.api === "anthropic-messages") {
    probes.push({
      url: base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`,
      body: {
        model: input.modelId,
        max_tokens: 16,
        messages: [{ role: "user", content: "ping" }],
      },
    });
  } else {
    if (input.api === "openai-responses") {
      probes.push({
        url: `${base}/responses`,
        body: { model: input.modelId, input: "ping", max_output_tokens: 16 },
      });
    }
    // chat/completions works as a fallback for most openai-compatible hosts.
    probes.push({
      url: `${base}/chat/completions`,
      body: {
        model: input.modelId,
        max_tokens: 16,
        messages: [{ role: "user", content: "ping" }],
      },
    });
  }

  const errors: string[] = [];
  for (const probe of probes) {
    const response = await fetch(probe.url, {
      method: "POST",
      headers,
      body: JSON.stringify(probe.body),
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      return { ok: true, modelId: input.modelId };
    }
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    errors.push(
      `${probe.url}: HTTP ${response.status}${detail ? ` ${detail}` : ""}`,
    );
    // Auth failures will not change across endpoints; report immediately.
    if (response.status === 401 || response.status === 403) break;
  }
  throw new ConfigValidationError(
    `Connection test failed: ${errors.join("; ")}`,
  );
}
