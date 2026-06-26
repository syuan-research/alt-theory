import { fetchJson } from "./http";
import type {
  ConfigStatus,
  FetchModelsDraftInput,
  FetchedModel,
  ProviderView,
  UpsertProviderInput,
} from "./types";

export async function getConfigStatus(): Promise<ConfigStatus> {
  return fetchJson<ConfigStatus>("/api/config/status");
}

export async function listConfigProviders(): Promise<{ providers: ProviderView[] }> {
  return fetchJson<{ providers: ProviderView[] }>("/api/config/providers");
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