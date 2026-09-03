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
  writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { ensureLocalModeDefaults } from "./local-mode-paths.js";
import { writeJsonAtomic } from "../core/data-dir.js";
import { PROVIDER_AUTH_IDS } from "./provider-auth.js";
import {
  catalogModelMetadata,
  catalogSdkFamily,
  catalogThinkingLevels,
} from "./models-dev-metadata.js";

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

export interface FetchModelsResult {
  models: FetchedModel[];
  unclassifiedModelIds: string[];
}

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
  writeJsonAtomic(modelsJsonPath(agentDir), data);
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

/** The account-reported model ids an OAuth credential carries (Copilot
 *  fetches these live at login and on every token refresh), or null when
 *  the credential has no such list. */
function credentialAvailableModelIds(
  agentDir: string,
  provider: string,
): string[] | null {
  const credential = storedCredential(agentDir, provider);
  const ids = (credential as { availableModelIds?: unknown } | undefined)
    ?.availableModelIds;
  return Array.isArray(ids) && ids.every((id) => typeof id === "string")
    ? ids
    : null;
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
): Promise<string | undefined> {
  const runtime = await runtimeFor(agentDir);
  let loginSettled = false;
  let loginError: unknown;
  const login = runtime.login(provider, "api_key", {
    prompt: async () => apiKey,
    notify: () => {},
  });
  void login.then(
    () => {
      loginSettled = true;
    },
    (error: unknown) => {
      loginError = error;
      loginSettled = true;
    },
  );

  // ModelRuntime.login() persists the credential first, then refreshes every
  // network-backed provider catalog. Provider Save owns the durable credential
  // mutation, not that unrelated global refresh. Wait until the requested key
  // is actually on disk (or persistence fails), then let refresh finish without
  // holding the HTTP response open indefinitely.
  for (;;) {
    const credential = storedCredential(agentDir, provider);
    if (credential?.type === "api_key" && credential.key === apiKey) break;
    if (loginSettled) {
      if (loginError) throw loginError;
      throw new Error(`Credential for '${provider}' was not persisted`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
  }

  if (loginSettled) {
    return loginError
      ? "Provider saved, but the model catalog could not be refreshed."
      : undefined;
  }

  const refreshResult = await Promise.race([
    login.then(
      () => "ok" as const,
      () => "failed" as const,
    ),
    new Promise<"pending">((resolvePending) =>
      setTimeout(() => resolvePending("pending"), 250),
    ),
  ]);
  return refreshResult === "ok"
    ? undefined
    : refreshResult === "failed"
      ? "Provider saved, but the model catalog could not be refreshed."
      : "Provider saved. Model catalog refresh is continuing in the background.";
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
 * List all provider sets as a safe view (no key plaintext). A pure read:
 * sanitizers run in memory only, so a GET can never rewrite models.json —
 * repairs persist when an explicit write (upsert/delete) runs them.
 */
export function listProviders(agentDir: string): ProviderView[] {
  const models = readModelsFile(agentDir);
  repairStaleLiteralAuthMarkers(agentDir, models);
  sanitizeCustomProviderAuth(agentDir, models);
  const active = readActive(agentDir);
  const names = new Set(Object.keys(models.providers ?? {}));
  for (const name of PROVIDER_AUTH_IDS) {
    if (providerHasCredential(agentDir, name)) names.add(name);
  }
  return [...names].map((name) => {
    const block = models.providers?.[name] ?? {};
    const configuredModels = Array.isArray(block.models) ? block.models : [];
    // Model-list sources, most live first: what the user saved in
    // models.json, then what the account itself reports (Copilot's login
    // and every token refresh fetch availableModelIds from its API; the
    // builtin catalog goes stale, so it only decorates ids it knows and
    // never adds ids the account does not have), then the builtin catalog
    // as the last fallback.
    const credentialModelIds = credentialAvailableModelIds(agentDir, name);
    const sourceModels =
      configuredModels.length > 0
        ? configuredModels
        : credentialModelIds
          ? credentialModelIds.map(
              (id) =>
                builtinConfigModels(name).find((model) => model.id === id) ?? {
                  id,
                },
            )
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

/** A model's supported thinking levels from the provider view; null when the model is not in the registry. */
export function thinkingLevelsForModel(
  agentDir: string,
  providerName: string,
  modelId: string,
): ThinkingLevel[] | null {
  const model = listProviders(agentDir)
    .find((provider) => provider.name === providerName)
    ?.models.find((candidate) => candidate.id === modelId);
  return model?.availableThinkingLevels ?? null;
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

function modelListUrls(provider: string, api: ApiType | undefined, baseUrl: string): string[] {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (provider === "openai-codex") {
    return [`${trimmed}/codex/models?client_version=1.0.0`];
  }
  const urls = [`${trimmed}/models`];
  if (api === "anthropic-messages" && !/\/v1$/i.test(trimmed)) {
    urls.unshift(`${trimmed}/v1/models`);
  }
  return [...new Set(urls)];
}

function isOpenCodeGoBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return (
      url.hostname === "opencode.ai" &&
      url.pathname.replace(/\/+$/, "").replace(/\/v1$/i, "") === "/zen/go"
    );
  } catch {
    return false;
  }
}

function sanitizeCustomProviderAuth(
  agentDir: string,
  models: ModelsFile,
): boolean {
  let changed = false;
  const providers = models.providers ?? {};
  for (const [name, block] of Object.entries(providers)) {
    if (name === "openai-codex" && storedCredential(agentDir, name)?.type === "oauth") {
      for (const key of ["baseUrl", "api", "apiKey", "authHeader"] as const) {
        if (key in block) {
          delete block[key];
          changed = true;
        }
      }
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
    if (!block.baseUrl) continue;
    if (block.apiKey) continue;
    if (providerHasCredential(agentDir, name)) {
      block.apiKey = name;
      changed = true;
    }
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
    (provider === "xai" || provider === "openai-codex") &&
    storedCredential(agentDir, provider)?.type === "oauth"
  ) {
    const first = builtinModelList(provider)[0];
    const fetched = await fetchModelsFromEndpoint(agentDir, {
      provider,
      baseUrl: first?.baseUrl,
      api: first?.api as ApiType | undefined,
    });
    return fetched.map((model) => ({
      ...builtins.find((builtin) => builtin.id === model.id),
      ...model,
    }));
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
  return (
    await fetchProviderModelsFromDraftResult(agentDir, input)
  ).models;
}

export async function fetchProviderModelsFromDraftResult(
  agentDir: string,
  input: {
    provider: string;
    baseUrl?: string;
    api?: ApiType;
    apiKey?: string;
    keyStorage?: "literal" | "env";
  },
): Promise<FetchModelsResult> {
  assertValidProviderName(input.provider);
  assertValidApiType(input.api);
  assertNotCommandKey(input.apiKey);
  let unclassifiedModelIds: string[] = [];
  const models = await fetchModelsFromEndpoint(agentDir, {
    ...input,
    onUnclassified: (ids) => {
      unclassifiedModelIds = ids;
    },
    apiKey:
      input.keyStorage === "env" && input.apiKey
        ? resolveEnvApiKey(input.apiKey)
        : input.apiKey,
  });
  return { models, unclassifiedModelIds };
}

function savedOpenCodeGoFamily(
  providers: NonNullable<ModelsFile["providers"]>,
  modelId: string,
): "openai" | "anthropic" | undefined {
  const inOpenAi = providers["opencode-go-openai"]?.models?.some(
    (model) => model.id === modelId,
  );
  const inAnthropic = providers["opencode-go-anthropic"]?.models?.some(
    (model) => model.id === modelId,
  );
  if (inOpenAi && !inAnthropic) return "openai";
  if (inAnthropic && !inOpenAi) return "anthropic";
  return undefined;
}

function bundledOpenCodeGoFamily(
  modelId: string,
): "openai" | "anthropic" | undefined {
  const model = builtinModelList("opencode-go").find(
    (candidate) => candidate.id === modelId,
  );
  if (model?.api === "anthropic-messages") return "anthropic";
  if (model?.api === "openai-completions" || model?.api === "openai-responses") {
    return "openai";
  }
  return undefined;
}

async function fetchModelsFromEndpoint(
  agentDir: string,
  input: {
    provider: string;
    baseUrl?: string;
    api?: ApiType;
    apiKey?: string;
    onUnclassified?: (ids: string[]) => void;
  },
): Promise<FetchedModel[]> {
  if (!input.baseUrl) {
    throw new ConfigValidationError(
      "Model refresh needs a Base URL. Use manual model entry for built-in providers.",
    );
  }
  const splitOpenCodeGo = isOpenCodeGoBaseUrl(input.baseUrl);

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
  if (input.provider === "openai-codex" && apiKey) {
    try {
      const payload = JSON.parse(
        Buffer.from(apiKey.split(".")[1] ?? "", "base64url").toString("utf8"),
      ) as Record<string, unknown>;
      const auth = payload["https://api.openai.com/auth"] as
        | { chatgpt_account_id?: unknown }
        | undefined;
      if (typeof auth?.chatgpt_account_id === "string") {
        headers["chatgpt-account-id"] = auth.chatgpt_account_id;
      }
    } catch {
      // The endpoint will return the authoritative auth error.
    }
    headers.originator = "pi";
  }

  const errors: string[] = [];
  for (const endpoint of modelListUrls(input.provider, input.api, input.baseUrl)) {
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
    if (!splitOpenCodeGo) return candidates;
    const expectedFamily =
      input.api === "anthropic-messages" ? "anthropic" : "openai";
    const savedProviders = readModelsFile(agentDir).providers ?? {};
    const classified = candidates.map((model) => ({
      model,
      family:
        savedOpenCodeGoFamily(savedProviders, model.id) ??
        catalogSdkFamily(agentDir, input.provider, input.baseUrl, model.id) ??
        bundledOpenCodeGoFamily(model.id),
    }));
    input.onUnclassified?.(
      classified.filter(({ family }) => !family).map(({ model }) => model.id),
    );
    const selected = classified
      .filter(({ family }) => !family || family === expectedFamily)
      .map(({ model }) => model);
    return selected.map((model) => ({
      ...model,
      ...catalogModelMetadata(
        agentDir,
        input.provider,
        input.baseUrl,
        model.id,
      ),
    }));
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
  const models = readModelsFile(agentDir);
  if (sanitizeCustomProviderAuth(agentDir, models)) {
    writeModelsFileAtomic(agentDir, models);
  }
  const active = usableActive(agentDir);
  if (!active) return {};
  const block = models.providers?.[active.provider];
  const hasStoredKey = providerHasCredential(agentDir, active.provider);
  if (
    block &&
    hasStoredKey &&
    !block.apiKey &&
    customProviderNeedsApiKey(active.provider, block)
  ) {
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
  // Read path: compute the effective default without migrating settings.json.
  const active = usableActive(agentDir, { persist: false }) ?? {
    provider: null,
    model: null,
  };
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
  timeoutMs = 8_000,
): Promise<ConfigStatus> {
  const status = getConfigStatus(agentDir);
  if (!status.activeUsable || !status.activeProvider) return status;
  const credential = storedCredential(agentDir, status.activeProvider);
  if (credential?.type !== "oauth" || credential.expires > Date.now()) {
    return status;
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // ponytail: this bounds the response; ModelRuntime has no cancellation signal,
    // so a late refresh may still finish in the background.
    const verified = await Promise.race([
      resolveOAuth(status.activeProvider),
      new Promise<"timeout">((resolveTimeout) => {
        timeout = setTimeout(() => resolveTimeout("timeout"), timeoutMs);
        timeout.unref?.();
      }),
    ]);
    if (verified === "timeout") {
      return {
        ...status,
        activeUsable: false,
        activeIssue: `OAuth for '${status.activeProvider}' could not be verified in time. Your providers are still available; reconnect this account if model requests keep failing.`,
      };
    }
    if (verified) return getConfigStatus(agentDir);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const reason = /\b401\b/.test(detail)
      ? "failed with 401"
      : /\b403\b/.test(detail)
        ? "failed with 403"
        : /refresh[ _-]?token/i.test(detail)
          ? "refresh token was rejected"
          : "refresh failed";
    return {
      ...status,
      activeUsable: false,
      activeIssue: `OAuth for '${status.activeProvider}' ${reason}. Reconnect this account.`,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
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
      : payload &&
          typeof payload === "object" &&
          Array.isArray((payload as { models?: unknown }).models)
        ? (payload as { models: unknown[] }).models
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
                row.slug ??
                row.name ??
                row.model ??
                "",
            )
          : "";
    const normalized = id.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    const name =
      typeof (row?.display_name ?? row?.name) === "string" &&
      String(row?.display_name ?? row?.name).trim()
        ? String(row?.display_name ?? row?.name).trim()
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
      normalizeThinkingLevels(
        row?.thinkingLevels ??
          row?.thinking_levels ??
          (Array.isArray(row?.supported_reasoning_levels)
            ? row.supported_reasoning_levels.map((entry) =>
                entry && typeof entry === "object"
                  ? (entry as { effort?: unknown }).effort
                  : entry,
              )
            : undefined),
      ) ??
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
  // Explicit write: this is where the read path's in-memory repairs (stale
  // literal auth markers, custom-provider auth normalization) get persisted.
  repairStaleLiteralAuthMarkers(agentDir, models);
  sanitizeCustomProviderAuth(agentDir, models);
  writeModelsFileAtomic(agentDir, models);

  // Key handling for auth.json.
  let warning: string | undefined;
  if (options.clearKey) {
    await removeCredential(agentDir, input.name);
  } else if (options.keyStorage === "literal" && input.apiKey) {
    try {
      warning = await persistApiKey(agentDir, input.name, input.apiKey);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ConfigValidationError(
        `Provider models were saved, but credential storage failed: ${detail}`,
      );
    }
  }

  const reread = listProviders(agentDir).find(
    (provider) => provider.name === input.name,
  );
  if (
    !reread ||
    reread.models.length !== persistedModels.length ||
    reread.models.some((model, index) => model.id !== persistedModels[index]?.id)
  ) {
    throw new ConfigValidationError(
      "Provider models were written but did not survive the normal configuration read path.",
    );
  }
  usableActive(agentDir);
  return {
    ...reread,
    keyState: options.clearKey ? "missing" : reread.keyState,
    hasKey: options.clearKey ? false : reread.hasKey,
    warning,
  };
}

/**
 * A saved default is a convenience, never a gate. With `persist: false`
 * (read paths) the fallback is computed but settings.json is left alone;
 * explicit writes keep the pointer-migration behavior.
 */
function usableActive(
  agentDir: string,
  options: { persist?: boolean } = {},
): { provider: string; model: string } | null {
  const persist = options.persist !== false;
  const active = readActive(agentDir);
  if (!active.provider || !active.model) return null;
  const providers = listProviders(agentDir);
  const usable = (provider: ProviderView) =>
    (provider.keyState === "stored" ||
      provider.keyState === "oauth" ||
      provider.keyState === "env-set") &&
    provider.models.length > 0;
  const activeProvider = providers.find((provider) => provider.name === active.provider);
  if (
    activeProvider &&
    usable(activeProvider) &&
    activeProvider.models.some((model) => model.id === active.model)
  ) {
    return { provider: active.provider, model: active.model };
  }
  const fallback = providers.find(usable);
  if (!fallback) {
    if (persist) clearActive(agentDir);
    return null;
  }
  const resolved = { provider: fallback.name, model: fallback.models[0]!.id };
  if (persist) writeActiveDirect(agentDir, resolved.provider, resolved.model);
  return resolved;
}

export async function deleteProvider(
  agentDir: string,
  name: string,
): Promise<void> {
  assertValidProviderName(name);
  const models = readModelsFile(agentDir);
  if (models.providers && models.providers[name]) {
    delete models.providers[name];
    repairStaleLiteralAuthMarkers(agentDir, models);
    sanitizeCustomProviderAuth(agentDir, models);
    writeModelsFileAtomic(agentDir, models);
  }
  if (providerHasCredential(agentDir, name)) {
    await removeCredential(agentDir, name);
  }
  usableActive(agentDir);
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
  writeJsonAtomic(path, existing);
}

function writeActiveDirect(agentDir: string, provider: string, model: string): void {
  const path = join(agentDir, "settings.json");
  mkdirSync(dirname(path), { recursive: true });
  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      existing = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }
  writeJsonAtomic(path, {
    ...existing,
    defaultProvider: provider,
    defaultModel: model,
  });
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
