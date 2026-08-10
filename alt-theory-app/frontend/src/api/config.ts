import { fetchJson } from "./http";
import type {
  ConfigStatus,
  FetchModelsDraftInput,
  FetchedModel,
  ProviderAuthFlow,
  ProviderAuthId,
  ProviderView,
  UpsertProviderInput,
} from "./types";

export async function listProviderAuthStatus(): Promise<{
  providers: { provider: ProviderAuthId; connected: boolean }[];
}> {
  return fetchJson("/api/config/auth/providers");
}

export async function startProviderAuth(
  provider: ProviderAuthId
): Promise<ProviderAuthFlow> {
  return fetchJson(
    `/api/config/auth/providers/${encodeURIComponent(provider)}/login`,
    { method: "POST" }
  );
}

export async function getProviderAuthFlow(
  flowId: string
): Promise<ProviderAuthFlow> {
  return fetchJson(`/api/config/auth/flows/${encodeURIComponent(flowId)}`);
}

export async function respondToProviderAuth(
  flowId: string,
  promptId: string,
  value: string
): Promise<ProviderAuthFlow> {
  return fetchJson(
    `/api/config/auth/flows/${encodeURIComponent(flowId)}/respond`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptId, value }),
    }
  );
}

export async function cancelProviderAuth(
  flowId: string
): Promise<ProviderAuthFlow> {
  return fetchJson(`/api/config/auth/flows/${encodeURIComponent(flowId)}`, {
    method: "DELETE",
  });
}

export async function logoutProviderAuth(
  provider: ProviderAuthId
): Promise<{ ok: true }> {
  return fetchJson(
    `/api/config/auth/providers/${encodeURIComponent(provider)}/logout`,
    { method: "POST" }
  );
}

export async function getConfigStatus(): Promise<ConfigStatus> {
  return fetchJson<ConfigStatus>("/api/config/status");
}

export async function listConfigProviders(): Promise<{ providers: ProviderView[] }> {
  return fetchJson<{ providers: ProviderView[] }>("/api/config/providers");
}

export interface AutoTitleSettings {
  enabled: boolean;
  model: { provider: string; modelId: string } | null;
}

export async function getAutoTitleSettings(): Promise<AutoTitleSettings> {
  return fetchJson<AutoTitleSettings>("/api/settings/auto-title");
}

export type SkillPrecedence = "prefer-bundled" | "prefer-user" | "ask";

export async function getSkillPrecedence(): Promise<{ precedence: SkillPrecedence }> {
  return fetchJson<{ precedence: SkillPrecedence }>("/api/settings/skill-precedence");
}

export async function saveSkillPrecedence(
  precedence: SkillPrecedence
): Promise<{ ok: true; precedence: SkillPrecedence }> {
  return fetchJson("/api/settings/skill-precedence", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ precedence }),
  });
}

export async function getDataFolder(): Promise<{ dataDir: string }> {
  return fetchJson<{ dataDir: string }>("/api/local/data-folder");
}

export interface AssetDirs {
  userRolePresetsDir: string;
  extraRolePresetDirs: string[];
  extraKbDirs: string[];
}

export async function getAssetDirs(): Promise<AssetDirs> {
  return fetchJson<AssetDirs>("/api/settings/asset-dirs");
}

export async function saveAssetDirs(dirs: {
  roleDirs?: string[];
  kbDirs?: string[];
}): Promise<{ ok: true; extraRolePresetDirs: string[]; extraKbDirs: string[] }> {
  return fetchJson("/api/settings/asset-dirs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dirs),
  });
}

export async function uploadRolePreset(
  path: string,
): Promise<{ ok: true; slug: string; path: string }> {
  return fetchJson("/api/role-presets/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

export async function getDefaultAltMode(): Promise<{
  mode: "understand" | "work" | null;
}> {
  return fetchJson<{ mode: "understand" | "work" | null }>(
    "/api/settings/default-alt-mode",
  );
}

export async function saveDefaultAltMode(
  mode: "understand" | "work" | null,
): Promise<{ ok: true; mode: "understand" | "work" | null }> {
  return fetchJson("/api/settings/default-alt-mode", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
}

export interface SessionListSort {
  folders: "name" | "modified";
  conversations: "name" | "modified";
}

export function getSessionListSort(): Promise<SessionListSort> {
  return fetchJson("/api/settings/session-list");
}

export function saveSessionListSort(
  value: SessionListSort,
): Promise<{ ok: true } & SessionListSort> {
  return fetchJson("/api/settings/session-list", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

export interface RuntimeSettings {
  mode: "alt-theory" | "native-pi";
  nativePiScanAltSkills: boolean;
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  return fetchJson("/api/settings/runtime");
}

export async function saveRuntimeSettings(
  settings: RuntimeSettings,
): Promise<{ ok: true } & RuntimeSettings> {
  return fetchJson("/api/settings/runtime", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
}

export type LangSettingValue = "auto" | "en" | "zh-Hans" | "zh-Hant-HK";

export async function getLangSetting(): Promise<{
  lang: LangSettingValue | null;
}> {
  return fetchJson<{ lang: LangSettingValue | null }>("/api/settings/lang");
}

export async function saveLangSetting(
  lang: LangSettingValue | null,
): Promise<{ ok: true; lang: LangSettingValue | null }> {
  return fetchJson("/api/settings/lang", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lang }),
  });
}

export async function saveAutoTitleSettings(
  input: AutoTitleSettings
): Promise<{ ok: true; autoTitle: AutoTitleSettings }> {
  return fetchJson("/api/settings/auto-title", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchModelsFromDraft(
  input: FetchModelsDraftInput
): Promise<{ models: FetchedModel[] }> {
  return fetchJson<{ models: FetchedModel[] }>("/api/config/fetch-models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchProviderModels(
  provider: string
): Promise<{ models: FetchedModel[] }> {
  return fetchJson<{ models: FetchedModel[] }>(
    `/api/config/providers/${encodeURIComponent(provider)}/fetch-models`,
    { method: "POST" }
  );
}

export async function upsertConfigProvider(
  provider: string,
  input: UpsertProviderInput
): Promise<ProviderView> {
  return fetchJson<ProviderView>(
    `/api/config/providers/${encodeURIComponent(provider)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );
}

export async function deleteConfigProvider(
  provider: string
): Promise<{ ok: true }> {
  return fetchJson<{ ok: true }>(
    `/api/config/providers/${encodeURIComponent(provider)}`,
    { method: "DELETE" }
  );
}

export async function setActiveModel(
  provider: string,
  model: string
): Promise<ConfigStatus> {
  return fetchJson<ConfigStatus>("/api/config/active", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, model }),
  });
}
export async function testConnectionFromDraft(input: {
  provider: string;
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  keyStorage?: "literal" | "env";
  modelId?: string;
}): Promise<{ ok: true; modelId: string }> {
  return fetchJson<{ ok: true; modelId: string }>("/api/config/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
