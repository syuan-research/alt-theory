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

export async function getDataFolder(): Promise<{ dataDir: string }> {
  return fetchJson<{ dataDir: string }>("/api/local/data-folder");
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
