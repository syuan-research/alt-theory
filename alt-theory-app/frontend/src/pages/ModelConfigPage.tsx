import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  deleteConfigProvider,
  fetchModelsFromDraft,
  fetchProviderModels,
  getConfigStatus,
  listConfigProviders,
  setActiveModel,
  upsertConfigProvider,
} from "@/api/config";
import type {
  ApiType,
  ConfigModel,
  ConfigStatus,
  ProviderView,
} from "@/api/types";
import { Button } from "@/components/ui/Button";
import { FieldFrame, TextInput } from "@/components/ui/Field";
import { BodyText, HintText, MonoText, PageTitle } from "@/components/ui/Typography";
import { cn } from "@/lib/cn";

const PROVIDER_PRESETS = [
  {
    label: "Xiaomi MiMo Token Plan (CN)",
    name: "xiaomi-mimo-token-plan-cn",
    api: "openai-completions" as ApiType,
    baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
    models: [
      {
        id: "mimo-v2.5-pro",
        reasoning: true,
        compat: {
          thinkingFormat: "deepseek",
          requiresReasoningContentOnAssistantMessages: true,
        },
      },
      {
        id: "mimo-v2.5",
        reasoning: true,
        compat: {
          thinkingFormat: "deepseek",
          requiresReasoningContentOnAssistantMessages: true,
        },
      },
    ],
    description:
      "Xiaomi MiMo Token Plan China endpoint. Use this only for keys issued for that product.",
    recommended: true,
    manualModels: true,
  },
  {
    label: "Xiaomi MiMo API (CN)",
    name: "xiaomi-mimo-api-cn",
    api: "openai-completions" as ApiType,
    baseUrl: "",
    models: [
      {
        id: "mimo-v2.5-pro",
        reasoning: true,
        compat: {
          thinkingFormat: "deepseek",
          requiresReasoningContentOnAssistantMessages: true,
        },
      },
      {
        id: "mimo-v2.5",
        reasoning: true,
        compat: {
          thinkingFormat: "deepseek",
          requiresReasoningContentOnAssistantMessages: true,
        },
      },
    ],
    description:
      "Normal Xiaomi MiMo API, China region. Paste the Base URL from the MiMo console/docs; do not reuse the Token Plan endpoint.",
    recommended: true,
    manualModels: true,
  },
  {
    label: "Xiaomi MiMo API (Global)",
    name: "xiaomi-mimo-api-global",
    api: "openai-completions" as ApiType,
    baseUrl: "",
    models: [
      {
        id: "mimo-v2.5-pro",
        reasoning: true,
        compat: {
          thinkingFormat: "deepseek",
          requiresReasoningContentOnAssistantMessages: true,
        },
      },
      {
        id: "mimo-v2.5",
        reasoning: true,
        compat: {
          thinkingFormat: "deepseek",
          requiresReasoningContentOnAssistantMessages: true,
        },
      },
    ],
    description:
      "Normal Xiaomi MiMo API, global region. Paste the regional Base URL from the MiMo console/docs.",
    recommended: true,
    manualModels: true,
  },
  {
    label: "OpenCode Go (OpenAI-compatible)",
    name: "opencode-go-openai",
    api: "openai-completions" as ApiType,
    baseUrl: "https://opencode.ai/zen/go/v1",
    models: [
      {
        id: "mimo-v2.5-pro",
        reasoning: true,
        compat: {
          thinkingFormat: "deepseek",
          requiresReasoningContentOnAssistantMessages: true,
        },
      },
      {
        id: "mimo-v2.5",
        reasoning: true,
        compat: {
          thinkingFormat: "deepseek",
          requiresReasoningContentOnAssistantMessages: true,
        },
      },
      { id: "deepseek-v4-pro" },
      { id: "kimi-k2.7" },
      { id: "glm-5.2" },
    ],
    description:
      "OpenCode Go models served through /v1/chat/completions, including MiMo, DeepSeek, Kimi, and GLM.",
    recommended: true,
    manualModels: true,
  },
  {
    label: "OpenCode Go (Anthropic-compatible)",
    name: "opencode-go-anthropic",
    api: "anthropic-messages" as ApiType,
    baseUrl: "https://opencode.ai/zen/go",
    models: [
      {
        id: "qwen3.7-max",
        reasoning: true,
        compat: { thinkingFormat: "qwen" },
      },
      {
        id: "qwen3.7-plus",
        reasoning: true,
        compat: { thinkingFormat: "qwen" },
      },
      { id: "minimax-m3" },
    ],
    description:
      "OpenCode Go models served through /v1/messages, including Qwen 3.7 and MiniMax.",
    recommended: true,
    manualModels: true,
  },
  {
    label: "Qwen 3.7 Max (Bailian)",
    name: "qwen-bailian-beijing",
    api: "openai-responses" as ApiType,
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [
      {
        id: "qwen3.7-max-2026-05-20",
        reasoning: true,
        compat: { thinkingFormat: "qwen" },
      },
    ],
    description: "Alibaba/Bailian path for the current Qwen 3.7 label.",
    recommended: true,
    keyHint: "Paste a DashScope API key, or choose env var name and enter DASHSCOPE_API_KEY.",
    manualModels: true,
  },
  {
    label: "OpenRouter",
    name: "openrouter",
    api: "openai-completions" as ApiType,
    baseUrl: "https://openrouter.ai/api/v1",
    models: [{ id: "anthropic/claude-sonnet-4" }],
    description: "One OpenRouter key for many upstream models.",
    recommended: false,
  },
  {
    label: "OpenAI API",
    name: "openai",
    api: "openai-responses" as ApiType,
    baseUrl: "https://api.openai.com/v1",
    models: [{ id: "gpt-4.1" }, { id: "gpt-4.1-mini" }],
    description: "Generic OpenAI account. Not a Xiaomi/MiMo entry.",
    recommended: false,
  },
  {
    label: "Anthropic API",
    name: "anthropic",
    api: "anthropic-messages" as ApiType,
    baseUrl: "https://api.anthropic.com",
    models: [{ id: "claude-sonnet-4-20250514" }],
    description: "Generic Anthropic account. Not a Xiaomi/MiMo entry.",
    recommended: false,
  },
];

type ProviderPreset = (typeof PROVIDER_PRESETS)[number];

const MANUAL_MODEL_PROVIDER_NAMES = new Set(
  PROVIDER_PRESETS.filter((preset) => preset.manualModels).map(
    (preset) => preset.name
  )
);

function manualModelListHint(providerName: string): string | null {
  if (!MANUAL_MODEL_PROVIDER_NAMES.has(providerName)) return null;
  return "This preset already includes the expected model ids; the provider may not expose a /models endpoint.";
}

function parseOptionValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  if (
    (raw.startsWith("{") && raw.endsWith("}")) ||
    (raw.startsWith("[") && raw.endsWith("]"))
  ) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function stringifyOptionValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function keyStateLabel(keyState: ProviderView["keyState"]): string {
  if (keyState === "stored") return "key saved";
  if (keyState === "env-set") return "env key set";
  if (keyState === "env-missing") return "env var missing";
  return "no key";
}

function keyStateIsUsable(keyState: ProviderView["keyState"]): boolean {
  return keyState === "stored" || keyState === "env-set";
}

const THINKING_FORMAT_OPTIONS = [
  { value: "", label: "(none)" },
  { value: "deepseek", label: "deepseek (MiMo, DeepSeek)" },
  { value: "qwen", label: "qwen (Qwen 3.x)" },
] as const;

interface ModelRow {
  id: string;
  name: string;
  reasoning: boolean;
  thinkingFormat: string;
  requiresReasoningContent: boolean;
}

function configModelToRow(model: ConfigModel): ModelRow {
  return {
    id: model.id,
    name: model.name || "",
    reasoning: model.reasoning ?? false,
    thinkingFormat: model.compat?.thinkingFormat || "",
    requiresReasoningContent:
      model.compat?.requiresReasoningContentOnAssistantMessages ?? false,
  };
}

function emptyModelRow(): ModelRow {
  return {
    id: "",
    name: "",
    reasoning: false,
    thinkingFormat: "",
    requiresReasoningContent: false,
  };
}

function rowToConfigModel(row: ModelRow): ConfigModel | null {
  const id = row.id.trim();
  if (!id) return null;
  const model: ConfigModel = { id };
  const modelName = row.name.trim();
  if (modelName) model.name = modelName;
  if (row.reasoning) model.reasoning = true;
  const compat: NonNullable<ConfigModel["compat"]> = {};
  if (row.thinkingFormat) compat.thinkingFormat = row.thinkingFormat;
  if (row.requiresReasoningContent) {
    compat.requiresReasoningContentOnAssistantMessages = true;
  }
  if (Object.keys(compat).length > 0) model.compat = compat;
  return model;
}

interface OptionRow {
  key: string;
  value: string;
}

export function ModelConfigPage() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
    null
  );

  const [editingName, setEditingName] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiType, setApiType] = useState<ApiType>("openai-completions");
  const [apiKey, setApiKey] = useState("");
  const [keyStorage, setKeyStorage] = useState<"literal" | "env">("literal");
  const [modelRows, setModelRows] = useState<ModelRow[]>([emptyModelRow()]);
  const [optionRows, setOptionRows] = useState<OptionRow[]>([]);
  const [keyHint, setKeyHint] = useState(
    "Some providers require the key before fetching models. Stored keys are local plaintext in Pi's auth.json; env mode stores only the variable name."
  );

  const showToast = useCallback((text: string, isError = false) => {
    setToast({ text, error: isError });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStatus, provs] = await Promise.all([
        getConfigStatus(),
        listConfigProviders(),
      ]);
      setStatus(nextStatus);
      setProviders(provs.providers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openEditor = (existingName?: string) => {
    setEditingName(existingName ?? null);
    setEditorOpen(true);
    setName(existingName || "");
    setBaseUrl("");
    setApiType("openai-completions");
    setApiKey("");
    setKeyStorage("literal");
    setModelRows([emptyModelRow()]);
    setOptionRows([]);
    setKeyHint(
      "Some providers require the key before fetching models. Stored keys are local plaintext in Pi's auth.json; env mode stores only the variable name."
    );

    if (existingName) {
      const provider = providers.find((item) => item.name === existingName);
      if (provider) {
        setBaseUrl(provider.baseUrl || "");
        if (provider.api) setApiType(provider.api);
        if (provider.keyState === "stored") {
          setKeyHint(
            "A key is already saved for this provider. Leave blank to keep it, or paste a new key to replace it."
          );
        } else if (provider.keyState === "env-set") {
          setKeyHint(
            "An environment-variable key is configured and available in this process. Leave blank to keep it."
          );
        } else if (provider.keyState === "env-missing") {
          setKeyHint(
            "An environment-variable key is configured but not available in this process. Enter a key or env var name before fetching models."
          );
        } else if (provider.models.length > 0) {
          setKeyHint(
            "No key is saved for this provider yet. Enter a key (or env var name) before saving."
          );
        }
        setModelRows(
          provider.models.length
            ? provider.models.map((model) => configModelToRow(model))
            : [emptyModelRow()]
        );
        setOptionRows(
          Object.entries(provider.options || {}).map(([key, value]) => ({
            key,
            value: stringifyOptionValue(value),
          }))
        );
      }
    }
  };

  const applyPreset = (preset: ProviderPreset) => {
    setName(preset.name);
    setBaseUrl(preset.baseUrl);
    setApiType(preset.api);
    setModelRows(preset.models.map((model) => configModelToRow(model)));
    setOptionRows([]);
    setKeyStorage("literal");
    setKeyHint(
      preset.keyHint ||
        "Paste the provider API key. Stored keys are local plaintext in Pi's auth.json; env mode stores only the variable name."
    );
  };

  const saveProvider = async () => {
    const trimmedName = name.trim();
    const models: ConfigModel[] = modelRows
      .map((row) => rowToConfigModel(row))
      .filter((row): row is ConfigModel => row !== null);

    const options: Record<string, unknown> = {};
    for (const row of optionRows) {
      const key = row.key.trim();
      const raw = row.value.trim();
      if (!key) continue;
      options[key] = parseOptionValue(raw);
    }

    if (!trimmedName) {
      showToast("Provider name is required", true);
      return;
    }
    if (models.length === 0) {
      showToast("At least one model is required", true);
      return;
    }

    try {
      await upsertConfigProvider(trimmedName, {
        baseUrl: baseUrl.trim() || undefined,
        api: apiType,
        models,
        ...(Object.keys(options).length ? { options } : {}),
        ...(apiKey ? { apiKey, keyStorage } : {}),
      });
      const firstModelId = models[0]?.id;
      const shouldSetActive =
        !status?.activeProvider && !status?.activeModel && Boolean(firstModelId);
      if (shouldSetActive && firstModelId) {
        await setActiveModel(trimmedName, firstModelId);
      }
      showToast(
        shouldSetActive
          ? `${editingName ? "Saved" : "Added"} ${trimmedName} and set active`
          : editingName
            ? `Saved ${trimmedName}`
            : `Added ${trimmedName}`
      );
      setEditorOpen(false);
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", true);
    }
  };

  const mergeFetchedModels = (
    existing: ConfigModel[],
    fetched: { id: string; name?: string }[]
  ): ConfigModel[] => {
    const merged = new Map<string, ConfigModel>();
    for (const model of existing) {
      if (model.id) merged.set(model.id, model);
    }
    for (const model of fetched) {
      const id = model.id.trim();
      if (!id) continue;
      const prior = merged.get(id);
      merged.set(id, {
        id,
        name: model.name || prior?.name,
        contextWindow: prior?.contextWindow,
        reasoning: prior?.reasoning,
        compat: prior?.compat,
      });
    }
    return [...merged.values()];
  };

  const fetchModelsForProvider = async (provider: ProviderView) => {
    const manualHint = manualModelListHint(provider.name);
    if (manualHint) {
      showToast(manualHint, true);
      return;
    }
    if (!provider.baseUrl) {
      showToast("Built-in providers have no fetch endpoint. Edit to add models.", true);
      return;
    }
    if (!keyStateIsUsable(provider.keyState)) {
      showToast("Set an API key before fetching models for this provider.", true);
      return;
    }
    try {
      const data = await fetchProviderModels(provider.name);
      const models = mergeFetchedModels(provider.models, data.models || []);
      if (models.length === 0) {
        showToast("Fetch returned no models.", true);
        return;
      }
      await upsertConfigProvider(provider.name, {
        baseUrl: provider.baseUrl,
        api: provider.api,
        models,
        options: provider.options,
      });
      showToast(`Updated ${provider.name} with ${data.models?.length || 0} fetched models`);
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Fetch failed", true);
    }
  };

  const fetchModels = async () => {
    const trimmedName = name.trim();
    const trimmedBaseUrl = baseUrl.trim();
    const manualHint = manualModelListHint(trimmedName);
    if (manualHint) {
      showToast(manualHint, true);
      return;
    }
    if (!trimmedName) {
      showToast("Provider name is required before fetching models.", true);
      return;
    }
    if (!trimmedBaseUrl) {
      showToast("Base URL is required before fetching models.", true);
      return;
    }
    try {
      const data = await fetchModelsFromDraft({
        provider: trimmedName,
        baseUrl: trimmedBaseUrl,
        api: apiType,
        ...(apiKey ? { apiKey } : {}),
        ...(apiKey ? { keyStorage } : {}),
      });
      setModelRows(
        (data.models || []).map((model) =>
          configModelToRow({ id: model.id, name: model.name })
        )
      );
      showToast(`Fetched ${data.models?.length || 0} models`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Fetch failed", true);
    }
  };

  return (
    <div className="h-screen overflow-y-auto bg-canvas px-6 py-8 pb-20">
      <div className="mx-auto max-w-[880px]">
        <div className="mb-6 flex justify-end">
          {status && !status.activeUsable ? (
            <span
              className="text-[0.8125rem] text-text-muted"
              title="The app needs an active model before it can reply"
            >
              Set an active model to start using Alt
            </span>
          ) : (
            <Link
              to="/"
              className="text-[0.8125rem] text-text-secondary hover:text-ink"
            >
              ← Back to app
            </Link>
          )}
        </div>

        <PageTitle>Model &amp; API Key Setup</PageTitle>
        <BodyText className="mt-1 text-text-secondary">
          Configure one or more providers. This writes Pi&apos;s native config
          files under Alt Theory&apos;s local state folder.
        </BodyText>

        <div className="mt-6 rounded-lg border border-hairline bg-card px-4 py-3">
          {loading ? (
            <HintText>Loading…</HintText>
          ) : error ? (
            <HintText className="text-warning">{error}</HintText>
          ) : status ? (
            <BodyText className="text-[0.8125rem]">
              {status.activeUsable ? (
                <span className="text-success">Ready.</span>
              ) : status.anyUsable ? (
                <span className="text-warning">
                  Choose an active model to use the app.
                </span>
              ) : (
                <span className="text-warning">No provider has a key yet.</span>
              )}{" "}
              {status.activeProvider && status.activeModel ? (
                <>
                  Active:{" "}
                  <strong>
                    {status.activeProvider} / {status.activeModel}
                  </strong>
                </>
              ) : (
                " No active model selected."
              )}
            </BodyText>
          ) : null}
          {status?.activeIssue ? (
            <HintText className="mt-2 text-warning">{status.activeIssue}</HintText>
          ) : null}
          {status?.agentDir ? (
            <MonoText className="mt-2 block break-all text-[0.75rem] text-text-muted">
              Config dir: {status.agentDir}
            </MonoText>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <h2 className="text-[0.9375rem] font-semibold text-ink">Providers</h2>
          <Button variant="primary" onClick={() => openEditor()}>
            + Add provider
          </Button>
        </div>

        <div className="mt-3 space-y-3">
          {providers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-hairline px-4 py-10 text-center">
              <HintText>
                No providers configured. Click &quot;Add provider&quot; to begin.
              </HintText>
            </div>
          ) : (
            providers.map((provider) => (
              <ProviderCard
                key={provider.name}
                provider={provider}
                onFetchModels={() => void fetchModelsForProvider(provider)}
                onSetActive={async (model) => {
                  try {
                    await setActiveModel(provider.name, model);
                    showToast(`Set active: ${provider.name} / ${model}`);
                    await refresh();
                  } catch (err) {
                    showToast(
                      err instanceof Error ? err.message : "Failed",
                      true
                    );
                  }
                }}
                onEdit={() => openEditor(provider.name)}
                onDelete={async () => {
                  if (
                    !window.confirm(
                      `Delete provider "${provider.name}" and its saved key?`
                    )
                  ) {
                    return;
                  }
                  try {
                    await deleteConfigProvider(provider.name);
                    showToast(`Deleted ${provider.name}`);
                    await refresh();
                  } catch (err) {
                    showToast(
                      err instanceof Error ? err.message : "Delete failed",
                      true
                    );
                  }
                }}
              />
            ))
          )}
        </div>

        {editorOpen ? (
          <div className="mt-4 rounded-lg border border-hairline bg-card p-4">
            <h3 className="text-[0.9375rem] font-semibold text-ink">
              {editingName ? "Edit provider" : "Add provider"}
            </h3>

            {!editingName ? (
              <div className="mt-3 space-y-3">
                <PresetGroup
                  title="MiMo / coding gateways"
                  presets={PROVIDER_PRESETS.filter((preset) => preset.recommended)}
                  onPick={applyPreset}
                />
                <PresetGroup
                  title="Generic provider templates"
                  presets={PROVIDER_PRESETS.filter((preset) => !preset.recommended)}
                  onPick={applyPreset}
                  compact
                />
              </div>
            ) : null}

            <div className="mt-4 space-y-4">
              <FieldFrame
                label="Provider name"
                hint="Used as the key in models.json. Alphanumeric, dash, dot, underscore."
              >
                <TextInput
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={Boolean(editingName)}
                  autoComplete="off"
                />
              </FieldFrame>

              <FieldFrame
                label="Base URL"
                hint="Required for custom / local / proxy providers."
              >
                <TextInput
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  autoComplete="off"
                />
              </FieldFrame>

              <FieldFrame label="API type">
                <select
                  className="w-full rounded-md border border-hairline bg-surface px-2.5 py-2 text-[0.9375rem]"
                  value={apiType}
                  onChange={(event) =>
                    setApiType(event.target.value as ApiType)
                  }
                >
                  <option value="openai-completions">
                    openai-completions (most compatible)
                  </option>
                  <option value="openai-responses">openai-responses</option>
                  <option value="anthropic-messages">anthropic-messages</option>
                  <option value="google-generative-ai">
                    google-generative-ai
                  </option>
                </select>
              </FieldFrame>

              <FieldFrame label="API key" hint={keyHint}>
                <TextInput
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  autoComplete="off"
                />
                <div className="mt-2 flex gap-4 text-[0.75rem] text-text-secondary">
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      checked={keyStorage === "literal"}
                      onChange={() => setKeyStorage("literal")}
                    />
                    Store key (auth.json)
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      checked={keyStorage === "env"}
                      onChange={() => setKeyStorage("env")}
                    />
                    Env var name
                  </label>
                </div>
              </FieldFrame>

              <div className="space-y-3">
                <div>
                  <p className="text-[0.8125rem] font-semibold text-ink">Models</p>
                  <HintText className="mt-0.5">
                    Reasoning models (MiMo, Qwen, DeepSeek) need compat flags so Pi
                    serializes thinking blocks correctly.
                  </HintText>
                </div>
                {modelRows.map((row, index) => (
                  <div
                    key={index}
                    className="space-y-2 rounded-md border border-hairline bg-surface/50 p-3"
                  >
                    <div className="grid grid-cols-[2fr_1fr_auto] gap-2">
                      <TextInput
                        placeholder="model id (required)"
                        value={row.id}
                        onChange={(event) =>
                          setModelRows((prev) =>
                            prev.map((item, i) =>
                              i === index ? { ...item, id: event.target.value } : item
                            )
                          )
                        }
                      />
                      <TextInput
                        placeholder="display name"
                        value={row.name}
                        onChange={(event) =>
                          setModelRows((prev) =>
                            prev.map((item, i) =>
                              i === index
                                ? { ...item, name: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        className="text-danger"
                        onClick={() =>
                          setModelRows((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        ✕
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.75rem] text-text-secondary">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={row.reasoning}
                          onChange={(event) =>
                            setModelRows((prev) =>
                              prev.map((item, i) =>
                                i === index
                                  ? { ...item, reasoning: event.target.checked }
                                  : item
                              )
                            )
                          }
                        />
                        Reasoning model
                      </label>
                      <label className="flex items-center gap-1.5">
                        <span>Thinking format</span>
                        <select
                          className="rounded-md border border-hairline bg-surface px-2 py-1 text-[0.75rem]"
                          value={row.thinkingFormat}
                          onChange={(event) =>
                            setModelRows((prev) =>
                              prev.map((item, i) =>
                                i === index
                                  ? { ...item, thinkingFormat: event.target.value }
                                  : item
                              )
                            )
                          }
                        >
                          {THINKING_FORMAT_OPTIONS.map((option) => (
                            <option key={option.value || "none"} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={row.requiresReasoningContent}
                          onChange={(event) =>
                            setModelRows((prev) =>
                              prev.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      requiresReasoningContent: event.target.checked,
                                    }
                                  : item
                              )
                            )
                          }
                        />
                        Requires reasoning on assistant turns
                      </label>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setModelRows((prev) => [...prev, emptyModelRow()])
                    }
                  >
                    + Add model
                  </Button>
                  <Button variant="secondary" onClick={() => void fetchModels()}>
                    Fetch model list
                  </Button>
                  {manualModelListHint(name.trim()) ? (
                    <HintText>{manualModelListHint(name.trim())}</HintText>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[0.8125rem] font-semibold text-ink">
                  Advanced options
                </p>
                {optionRows.map((row, index) => (
                  <div key={index} className="grid grid-cols-[2fr_1fr_auto] gap-2">
                    <TextInput
                      placeholder="option key"
                      value={row.key}
                      onChange={(event) =>
                        setOptionRows((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, key: event.target.value } : item
                          )
                        )
                      }
                    />
                    <TextInput
                      placeholder="value"
                      value={row.value}
                      onChange={(event) =>
                        setOptionRows((prev) =>
                          prev.map((item, i) =>
                            i === index
                              ? { ...item, value: event.target.value }
                              : item
                          )
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      className="text-danger"
                      onClick={() =>
                        setOptionRows((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      ✕
                    </Button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  onClick={() =>
                    setOptionRows((prev) => [...prev, { key: "", value: "" }])
                  }
                >
                  + Add option
                </Button>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setEditorOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => void saveProvider()}>
                  Save provider
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {toast ? (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-[0.8125rem] text-surface shadow-lg",
            toast.error ? "bg-danger" : "bg-ink"
          )}
        >
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

function ProviderCard({
  provider,
  onFetchModels,
  onSetActive,
  onEdit,
  onDelete,
}: {
  provider: ProviderView;
  onFetchModels: () => void;
  onSetActive: (model: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const manualFetchHint = manualModelListHint(provider.name);
  const canFetch = Boolean(
    provider.baseUrl && keyStateIsUsable(provider.keyState) && !manualFetchHint
  );
  const modelIds = provider.models.map((model) => model.id).join("\u0000");
  const [selectedModel, setSelectedModel] = useState(provider.models[0]?.id || "");

  useEffect(() => {
    setSelectedModel((current) =>
      provider.models.some((model) => model.id === current)
        ? current
        : provider.models[0]?.id || ""
    );
  }, [provider.name, modelIds, provider.models]);

  return (
    <div
      className={cn(
        "rounded-lg border bg-surface px-4 py-3",
        provider.active ? "border-ink-soft shadow-[inset_3px_0_0_#555]" : "border-hairline"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.875rem] font-semibold text-ink">{provider.name}</p>
          <HintText className="break-all">
            {provider.baseUrl || "(built-in endpoint)"}
          </HintText>
        </div>
        <div className="flex flex-wrap gap-1">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[0.6875rem]",
              keyStateIsUsable(provider.keyState)
                ? "border-success/30 bg-success/10 text-success"
                : "border-warning/30 bg-warning/10 text-warning"
            )}
          >
            {keyStateLabel(provider.keyState)}
          </span>
          {provider.active ? (
            <span className="rounded-full border border-hairline bg-selected px-2 py-0.5 text-[0.6875rem] font-semibold">
              active
            </span>
          ) : null}
          {provider.api ? (
            <span className="rounded-full border border-hairline px-2 py-0.5 text-[0.6875rem] text-text-muted">
              {provider.api}
            </span>
          ) : null}
        </div>
      </div>

      {provider.warning ? (
        <HintText className="mt-2 text-warning">{provider.warning}</HintText>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          className="min-w-[180px] flex-1 rounded-md border border-hairline bg-surface px-2 py-1.5 text-[0.8125rem]"
          value={selectedModel}
          onChange={(event) => setSelectedModel(event.target.value)}
          disabled={provider.models.length === 0}
        >
          {provider.models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.id}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          disabled={!selectedModel}
          onClick={() => selectedModel && onSetActive(selectedModel)}
        >
          Set active
        </Button>
        <Button
          variant="secondary"
          disabled={!canFetch}
          title={
            manualFetchHint
              ? manualFetchHint
              : canFetch
                ? "Refresh model list from provider API"
              : "Needs base URL and a saved or available env key"
          }
          onClick={onFetchModels}
        >
          Fetch models
        </Button>
        <Button variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" className="text-danger" onClick={onDelete}>
          Delete
        </Button>
      </div>

      <div className="mt-2 space-y-0.5 text-[0.75rem] text-text-muted">
        {provider.models.map((model) => (
          <div key={model.id} className="flex flex-wrap items-center gap-2">
            <span>{model.id}</span>
            {model.reasoning ? (
              <span className="rounded border border-hairline px-1.5 py-0.5 text-[0.6875rem]">
                reasoning
              </span>
            ) : null}
            {model.compat?.thinkingFormat ? (
              <span className="rounded border border-hairline px-1.5 py-0.5 text-[0.6875rem]">
                {model.compat.thinkingFormat}
              </span>
            ) : null}
            {model.contextWindow ? <span>{model.contextWindow} ctx</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function PresetGroup({
  title,
  presets,
  onPick,
  compact = false,
}: {
  title: string;
  presets: ProviderPreset[];
  onPick: (preset: ProviderPreset) => void;
  compact?: boolean;
}) {
  return (
    <div>
      <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </p>
      <div className={cn("mt-2 grid gap-2", compact ? "sm:grid-cols-3" : "md:grid-cols-3")}>
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={cn(
              "rounded-md border border-hairline bg-surface px-3 py-2 text-left hover:bg-hover",
              compact && "px-2.5 py-1.5"
            )}
            onClick={() => onPick(preset)}
          >
            <span className="block text-[0.8125rem] font-semibold text-ink">
              {preset.label}
            </span>
            {!compact ? (
              <>
                <span className="mt-1 block text-[0.75rem] leading-snug text-text-secondary">
                  {preset.description}
                </span>
                <span className="mt-1 block truncate text-[0.6875rem] text-text-muted">
                  {preset.models.map((model) => model.id).join(", ")}
                </span>
              </>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}








