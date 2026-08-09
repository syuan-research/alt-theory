import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  deleteConfigProvider,
  fetchModelsFromDraft,
  testConnectionFromDraft,
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
  ThinkingLevel,
} from "@/api/types";
import { Button } from "@/components/ui/Button";
import { FieldFrame, TextInput } from "@/components/ui/Field";
import { BodyText, HintText, PageTitle } from "@/components/ui/Typography";
import { cn } from "@/lib/cn";
import { applyTheme, isDarkStored, setDarkStored } from "@/lib/theme";
import { t } from "@/i18n";

const PROVIDER_PRESETS = [
  {
    label: t("Xiaomi MiMo Token Plan (CN)"),
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
      t("Xiaomi MiMo Token Plan China endpoint. Use this only for keys issued for that product."),
    recommended: true,
    manualModels: true,
  },
  {
    label: t("Xiaomi MiMo API (CN)"),
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
      t("Normal Xiaomi MiMo API, China region. Paste the Base URL from the MiMo console/docs; do not reuse the Token Plan endpoint."),
    recommended: true,
    manualModels: true,
  },
  {
    label: t("Xiaomi MiMo API (Global)"),
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
      t("Normal Xiaomi MiMo API, global region. Paste the regional Base URL from the MiMo console/docs."),
    recommended: true,
    manualModels: true,
  },
  {
    label: t("OpenCode Go (OpenAI-compatible)"),
    name: "opencode-go-openai",
    api: "openai-completions" as ApiType,
    baseUrl: "https://opencode.ai/zen/go/v1",
    models: [],
    description:
      t("OpenCode Go models served through /v1/chat/completions, including MiMo, DeepSeek, Kimi, and GLM."),
    recommended: true,
  },
  {
    label: t("OpenCode Go (Anthropic-compatible)"),
    name: "opencode-go-anthropic",
    api: "anthropic-messages" as ApiType,
    baseUrl: "https://opencode.ai/zen/go",
    models: [],
    description:
      t("OpenCode Go models served through /v1/messages, including Qwen 3.7 and MiniMax."),
    recommended: true,
  },
  {
    label: t("Qwen 3.7 Max (Bailian)"),
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
    description: t("Alibaba/Bailian path for the current Qwen 3.7 label."),
    keyUrl: "https://bailian.console.aliyun.com/?apiKey=1",
    recommended: true,
    keyHint: t("Paste a DashScope API key, or choose env var name and enter DASHSCOPE_API_KEY."),
    manualModels: true,
  },
  {
    label: t("OpenRouter"),
    name: "openrouter",
    api: "openai-completions" as ApiType,
    baseUrl: "https://openrouter.ai/api/v1",
    models: [{ id: "anthropic/claude-sonnet-4" }],
    description: t("One OpenRouter key for many upstream models."),
    keyUrl: "https://openrouter.ai/keys",
    recommended: false,
  },
  {
    label: t("OpenAI API"),
    name: "openai",
    api: "openai-responses" as ApiType,
    baseUrl: "https://api.openai.com/v1",
    models: [{ id: "gpt-4.1" }, { id: "gpt-4.1-mini" }],
    description: t("Generic OpenAI account. Not a Xiaomi/MiMo entry."),
    keyUrl: "https://platform.openai.com/api-keys",
    recommended: false,
  },
  {
    label: t("Anthropic API"),
    name: "anthropic",
    api: "anthropic-messages" as ApiType,
    baseUrl: "https://api.anthropic.com",
    models: [{ id: "claude-sonnet-4-20250514" }],
    description: t("Generic Anthropic account. Not a Xiaomi/MiMo entry."),
    keyUrl: "https://console.anthropic.com/settings/keys",
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
  return t("This preset already includes the expected model ids; the provider may not expose a /models endpoint. Use Test connection to check your key works.");
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

const THINKING_LEVEL_OPTIONS: ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

interface ModelRow {
  id: string;
  name: string;
  reasoning: boolean;
  thinkingFormat: string;
  requiresReasoningContent: boolean;
  contextWindow: string;
  maxTokens: string;
  input?: ("text" | "image")[];
  thinkingLevels?: ThinkingLevel[];
  availableThinkingLevels: ThinkingLevel[];
  thinkingLevelMap?: ConfigModel["thinkingLevelMap"];
  cost?: ConfigModel["cost"];
  maxTokensField: string;
}

function configModelToRow(model: ConfigModel): ModelRow {
  return {
    id: model.id,
    name: model.name || "",
    reasoning: model.reasoning ?? false,
    thinkingFormat: model.compat?.thinkingFormat || "",
    requiresReasoningContent:
      model.compat?.requiresReasoningContentOnAssistantMessages ?? false,
    contextWindow: model.contextWindow ? String(model.contextWindow) : "",
    maxTokens: model.maxTokens ? String(model.maxTokens) : "",
    input: model.input,
    thinkingLevels: model.thinkingLevels,
    availableThinkingLevels: model.availableThinkingLevels ?? [],
    thinkingLevelMap: model.thinkingLevelMap,
    cost: model.cost,
    maxTokensField: model.compat?.maxTokensField || "",
  };
}

function emptyModelRow(): ModelRow {
  return {
    id: "",
    name: "",
    reasoning: false,
    thinkingFormat: "",
    requiresReasoningContent: false,
    contextWindow: "",
    maxTokens: "",
    availableThinkingLevels: [],
    maxTokensField: "",
  };
}

function rowToConfigModel(row: ModelRow): ConfigModel | null {
  const id = row.id.trim();
  if (!id) return null;
  const model: ConfigModel = { id };
  const modelName = row.name.trim();
  if (modelName) model.name = modelName;
  if (row.reasoning) model.reasoning = true;
  const contextWindow = Number(row.contextWindow);
  if (Number.isInteger(contextWindow) && contextWindow > 0) {
    model.contextWindow = contextWindow;
  }
  const maxTokens = Number(row.maxTokens);
  if (Number.isInteger(maxTokens) && maxTokens > 0) {
    model.maxTokens = maxTokens;
  }
  if (row.input) model.input = row.input;
  if (row.thinkingLevels !== undefined) {
    model.thinkingLevels = row.thinkingLevels;
  }
  if (row.thinkingLevelMap) model.thinkingLevelMap = row.thinkingLevelMap;
  if (row.cost) model.cost = row.cost;
  const compat: NonNullable<ConfigModel["compat"]> = {};
  if (row.thinkingFormat) compat.thinkingFormat = row.thinkingFormat;
  if (row.requiresReasoningContent) {
    compat.requiresReasoningContentOnAssistantMessages = true;
  }
  if (row.maxTokensField) compat.maxTokensField = row.maxTokensField;
  if (Object.keys(compat).length > 0) model.compat = compat;
  return model;
}

interface OptionRow {
  key: string;
  value: string;
}

function editorFingerprint(input: {
  name: string;
  baseUrl: string;
  apiType: ApiType;
  apiKey: string;
  keyStorage: "literal" | "env";
  modelRows: ModelRow[];
  optionRows: OptionRow[];
}): string {
  return JSON.stringify({
    ...input,
    name: input.name.trim(),
    baseUrl: input.baseUrl.trim(),
    keyStorage: input.apiKey ? input.keyStorage : null,
  });
}

export function ModelConfigPage({
  embedded = false,
  addProviderTop,
  onConfigChanged,
}: {
  embedded?: boolean;
  addProviderTop?: ReactNode;
  onConfigChanged?: () => void | Promise<void>;
} = {}) {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
    null
  );

  const [editingName, setEditingName] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [addingProvider, setAddingProvider] = useState(false);
  const [pendingProviderTarget, setPendingProviderTarget] = useState<string | null>(null);
  const initialized = useRef(false);
  const editorBaseline = useRef("");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiType, setApiType] = useState<ApiType>("openai-completions");
  const [apiKey, setApiKey] = useState("");
  const [keyStorage, setKeyStorage] = useState<"literal" | "env">("literal");
  const [modelRows, setModelRows] = useState<ModelRow[]>([emptyModelRow()]);
  const [optionRows, setOptionRows] = useState<OptionRow[]>([]);
  const [keyHint, setKeyHint] = useState(
    t("Enter an API key before fetching models or saving.")
  );
  const [keyUrl, setKeyUrl] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    text: string;
    kind: "success" | "warning" | "error";
  } | null>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const firstRun =
    new URLSearchParams(window.location.search).get("firstRun") === "1";
  // Appearance is reachable from the first screen too (this route is outside
  // ShellProvider, so it must apply the stored theme itself).
  const [dark, setDark] = useState(isDarkStored());
  useEffect(() => {
    applyTheme(dark);
  }, [dark]);

  const showToast = useCallback((text: string, isError = false) => {
    setToast({ text, error: isError });
    // Success is transient; errors (validation) persist until dismissed or
    // superseded, so they aren't missed before the user reads them (#3).
    if (!isError) window.setTimeout(() => setToast(null), 3500);
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

  // Unsaved-changes guard (#7): warn on tab close/reload while the provider
  // editor is open with content the user hasn't saved.
  const editorDirty =
    editorOpen &&
    editorFingerprint({
      name,
      baseUrl,
      apiType,
      apiKey,
      keyStorage,
      modelRows,
      optionRows,
    }) !== editorBaseline.current;
  useEffect(() => {
    if (!editorDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editorDirty]);
  useEffect(() => {
    if (editorDirty) setSaveResult(null);
  }, [editorDirty]);

  const openEditor = (existingName?: string) => {
    setSaveResult(null);
    const provider = existingName
      ? providers.find((item) => item.name === existingName)
      : undefined;
    const nextName = existingName || "";
    const nextBaseUrl = provider?.baseUrl || "";
    const nextApiType = provider?.api ?? "openai-completions";
    const nextModelRows = provider?.models.length
      ? provider.models.map((model) => configModelToRow(model))
      : [emptyModelRow()];
    const nextOptionRows = Object.entries(provider?.options || {}).map(
      ([key, value]) => ({ key, value: stringifyOptionValue(value) }),
    );
    let nextKeyHint = t("Enter an API key before fetching models or saving.");
    if (provider?.keyState === "stored") {
      nextKeyHint =
        t("A key is already saved for this provider. Leave blank to keep it, or paste a new key to replace it.");
    } else if (provider?.keyState === "oauth") {
      nextKeyHint =
        t("Connected with OAuth. Leave the API key blank to keep using this account.");
    } else if (provider?.keyState === "env-set") {
      nextKeyHint =
        t("An environment-variable key is configured and available in this process. Leave blank to keep it.");
    } else if (provider?.keyState === "env-missing") {
      nextKeyHint =
        t("An environment-variable key is configured but not available in this process. Enter a key or env var name before fetching models.");
    } else if (provider?.models.length) {
      nextKeyHint =
        t("No key is saved for this provider yet. Enter a key (or env var name) before saving.");
    }
    editorBaseline.current = editorFingerprint({
      name: nextName,
      baseUrl: nextBaseUrl,
      apiType: nextApiType,
      apiKey: "",
      keyStorage: "literal",
      modelRows: nextModelRows,
      optionRows: nextOptionRows,
    });
    setAddingProvider(false);
    setEditingName(existingName ?? null);
    setEditorOpen(true);
    setName(nextName);
    setBaseUrl(nextBaseUrl);
    setApiType(nextApiType);
    setApiKey("");
    setKeyStorage("literal");
    setModelRows(nextModelRows);
    setOptionRows(nextOptionRows);
    setKeyUrl(null);
    setKeyHint(nextKeyHint);
  };

  const applyProviderTarget = (target: string) => {
    setPendingProviderTarget(null);
    if (target === "add") {
      setEditorOpen(false);
      setEditingName(null);
      setAddingProvider(true);
    } else if (target === "close") {
      if (editingName) openEditor(editingName);
      else {
        setEditorOpen(false);
        setAddingProvider(true);
      }
    } else {
      openEditor(target.slice("provider:".length));
    }
  };

  const requestProviderTarget = (target: string) => {
    if (editorDirty) setPendingProviderTarget(target);
    else applyProviderTarget(target);
  };

  const discardPrompt = (target: string) =>
    pendingProviderTarget === target ? (
      <div className="provider-discard-confirm">
        <span>{t("Discard unsaved provider changes?")}</span>
        <div>
          <button type="button" onClick={() => setPendingProviderTarget(null)}>
            {t("Cancel")}
          </button>
          <button type="button" className="danger" onClick={() => applyProviderTarget(target)}>
            {t("Discard")}
          </button>
        </div>
      </div>
    ) : null;

  const closeEditor = () => requestProviderTarget("close");

  useEffect(() => {
    if (loading || initialized.current) return;
    initialized.current = true;
    if (providers.length === 0) {
      setAddingProvider(true);
      return;
    }
    const initial =
      providers.find((provider) => provider.active) ?? providers[0];
    if (initial) openEditor(initial.name);
    // Initial selection is deliberately one-shot; later clicks own the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const applyPreset = (preset: ProviderPreset) => {
    setName(preset.name);
    setBaseUrl(preset.baseUrl);
    setApiType(preset.api);
    setModelRows(preset.models.map((model) => configModelToRow(model)));
    setOptionRows([]);
    setKeyStorage("literal");
    setKeyHint(
      preset.keyHint ||
        t("Paste the provider API key.")
    );
    setKeyUrl("keyUrl" in preset ? (preset.keyUrl as string) : null);
  };

  // Pick a preset card → prefill a NEW provider and open the editor inline.
  const pickPreset = (preset: ProviderPreset) => {
    setSaveResult(null);
    setAddingProvider(false);
    setEditingName(null);
    setApiKey("");
    applyPreset(preset);
    setEditorOpen(true);
  };

  const saveProvider = async () => {
    if (saving) return;
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
      showToast(t("Provider name is required"), true);
      return;
    }
    if (models.length === 0) {
      showToast(t("At least one model is required"), true);
      return;
    }

    setSaving(true);
    setSaveResult(null);
    try {
      const saved = await upsertConfigProvider(trimmedName, {
        baseUrl: baseUrl.trim() || undefined,
        api: apiType,
        models,
        ...(Object.keys(options).length ? { options } : {}),
        ...(apiKey ? { apiKey, keyStorage } : {}),
      });
      const successText = editingName
        ? t("Saved {name}", { name: trimmedName })
        : t("Added {name}", { name: trimmedName });
      showToast(successText);
      setSaveResult({
        text: saved.warning ? `${successText}. ${saved.warning}` : successText,
        kind: saved.warning ? "warning" : "success",
      });
      const savedName = trimmedName;
      const savedBaseUrl = baseUrl.trim();
      setName(savedName);
      setBaseUrl(savedBaseUrl);
      setApiKey("");
      editorBaseline.current = editorFingerprint({
        name: savedName,
        baseUrl: savedBaseUrl,
        apiType,
        apiKey: "",
        keyStorage,
        modelRows,
        optionRows,
      });
      setEditingName(trimmedName);
      setEditorOpen(true);
      setAddingProvider(false);
      setPendingProviderTarget(null);
      const refreshResults = await Promise.allSettled([
        refresh(),
        Promise.resolve(onConfigChanged?.()),
      ]);
      if (refreshResults.some((result) => result.status === "rejected")) {
        setSaveResult({
          text: `${successText}. ${t("Saved, but the current status could not be refreshed. Reload Settings to retry.")}`,
          kind: "warning",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("Save failed");
      showToast(message, true);
      setSaveResult({ text: message, kind: "error" });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    const trimmedName = name.trim();
    const trimmedBaseUrl = baseUrl.trim();
    const firstModelId = modelRows
      .map((row) => row.id.trim())
      .find((id) => id.length > 0);
    if (!trimmedName || !trimmedBaseUrl || !firstModelId) {
      setTestResult({
        ok: false,
        message: t("Provider name, Base URL, and at least one model id are needed first."),
      });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnectionFromDraft({
        provider: trimmedName,
        baseUrl: trimmedBaseUrl,
        api: apiType,
        ...(apiKey ? { apiKey, keyStorage } : {}),
        modelId: firstModelId,
      });
      setTestResult({
        ok: true,
        message: t("Connected — {modelId} answered.", { modelId: result.modelId }),
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : t("Connection test failed"),
      });
    } finally {
      setTesting(false);
    }
  };

  const fetchModels = async () => {
    const trimmedName = name.trim();
    const trimmedBaseUrl = baseUrl.trim();
    if (!trimmedName) {
      showToast(t("Provider name is required before fetching models."), true);
      return;
    }
    if (!trimmedBaseUrl) {
      showToast(t("Base URL is required before fetching models."), true);
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
      let added = 0;
      setModelRows((current) => {
        const existing = new Set(current.map((row) => row.id.trim()));
        const fresh = (data.models || []).filter(
          (model) => !existing.has(model.id),
        );
        added = fresh.length;
        return [...current, ...fresh.map((model) => configModelToRow(model))];
      });
      // Report what changed, not what came back: fetching twice adds nothing
      // the second time, and "fetched 40 models" would read like it did.
      showToast(
        added
          ? t("Added {count} new models", { count: String(added) })
          : t("No new models — the list is already up to date"),
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("Fetch failed"), true);
    }
  };

  const statusSummary = (
    <>
      {loading ? (
        <HintText>{t("Loading…")}</HintText>
      ) : error ? (
        <HintText className="text-warning">{error}</HintText>
      ) : status ? (
        <div
          className="active-model-summary"
          title={t("New conversations start with the default model. Editing a provider's model list does not change it.")}
        >
          <span>
            {status.activeUsable ? (
              <span className="text-success">{t("Ready.")}</span>
            ) : status.anyUsable ? (
              <span className="text-warning">
                {t("No default is set. Choose one for new conversations, or select a model in the composer.")}
              </span>
            ) : (
              <span className="text-warning">{t("No provider has a key yet.")}</span>
            )}
          </span>
          <label className="default-model-picker active-model-inline">
            <span>{t("Default")}</span>
            <select
              value={
                status.activeProvider && status.activeModel
                  ? `${status.activeProvider}::${status.activeModel}`
                  : ""
              }
              onChange={async (event) => {
                const value = event.target.value;
                if (!value) return;
                const sep = value.indexOf("::");
                if (sep < 0) return;
                const provider = value.slice(0, sep);
                const modelId = value.slice(sep + 2);
                try {
                  await setActiveModel(provider, modelId);
                  showToast(t("Default model: {model}", { model: modelId }));
                  await Promise.all([refresh(), onConfigChanged?.()]);
                } catch (err) {
                  showToast(
                    err instanceof Error ? err.message : t("Could not change model"),
                    true,
                  );
                }
              }}
            >
              <option value="" disabled>{t("Choose a model")}</option>
              {providers.flatMap((provider) =>
                (provider.models ?? []).map((model) => (
                  <option key={`${provider.name}::${model.id}`} value={`${provider.name}::${model.id}`}>
                    {provider.name} / {model.name || model.id}
                  </option>
                )),
              )}
            </select>
          </label>
        </div>
      ) : null}
      {status?.activeIssue ? (
        <HintText className="mt-1 text-warning">{status.activeIssue}</HintText>
      ) : null}
    </>
  );

  return (
    <div className={embedded ? "" : "h-screen overflow-y-auto bg-canvas px-6 py-8 pb-20"}>
      <div className={embedded ? "" : "mx-auto max-w-[880px]"}>
        {!embedded ? (
        <div className="mb-6 flex items-center justify-between">
          <button
            className="text-[0.8125rem] text-text-secondary hover:text-ink"
            onClick={() => {
              const next = !dark;
              setDark(next);
              setDarkStored(next);
            }}
          >
            <i className={`ph ${dark ? "ph-sun" : "ph-moon"} mr-1`} />
            {dark ? t("Light") : t("Dark")}
          </button>
          <Link
            to="/"
            className="text-[0.85rem] text-text-secondary hover:text-ink"
          >
            {t("← Back to app")}
          </Link>
        </div>
        ) : null}

        {!embedded ? (
        <>
        <PageTitle>
          {firstRun ? t("Welcome — connect Alt to an AI model") : t("Model & API Key Setup")}
        </PageTitle>
        {!firstRun ? (
          <BodyText className="mt-1 text-text-secondary">
            {t("Connect providers and choose the model Alt Theory uses.")}
          </BodyText>
        ) : null}

        {firstRun ? (
          <div className="mt-5 rounded-lg border border-hairline bg-surface p-5">
            <p className="text-[0.9375rem] font-semibold text-ink">
              {t("Connect an AI model to begin")}
            </p>
            <div className="mt-4">
              {[
                t("Choose a provider below"),
                t("Sign in or add an API key"),
                t("Choose a model and start"),
              ].map((step, i, all) => (
                <div key={i}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[0.8125rem] font-semibold text-surface">
                      {i + 1}
                    </span>
                    <span className="text-[0.875rem] text-ink">{step}</span>
                  </div>
                  {i < all.length - 1 ? (
                    <i className="ph ph-arrow-down my-0.5 block pl-[9px] text-[0.85rem] text-text-muted" />
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-4 text-[0.75rem] text-text-muted">
              {t("Takes about a minute.")}
            </p>
          </div>
        ) : null}
        </>
        ) : null}

        {embedded ? (
          <div className="model-config-heading">
            <h2>Models</h2>
            <div className="model-config-status">{statusSummary}</div>
          </div>
        ) : (
          <div className="model-config-status">{statusSummary}</div>
        )}

        <div className="model-config-layout">
          <aside className="provider-master" aria-label={t("Configured providers")}>
            <button
              type="button"
              className="add-provider-primary"
              onClick={() => requestProviderTarget("add")}
            >
              <i className="ph ph-plus" aria-hidden />
              {t("Add provider")}
            </button>
            {discardPrompt("add")}
            <details className="chatbot-config-hint">
              <summary>
                <i className="ph ph-chats-circle" aria-hidden />
                {t("Let a chatbot write the config")}
              </summary>
              <p>
                {t("The user guide has a prompt you can paste into ChatGPT, Kimi, DeepSeek, Gemini, or a local agent — see Models, Providers, and Access. Helper can also do it here.")}
              </p>
            </details>
            <div className="provider-master-list">
              {[...providers]
                .sort((a, b) => {
                  const authOrder =
                    Number(b.keyState === "oauth") - Number(a.keyState === "oauth");
                  if (authOrder !== 0) return authOrder;
                  if (a.active !== b.active) return a.active ? -1 : 1;
                  return a.name.localeCompare(b.name);
                })
                .map((provider) => {
                  const target = `provider:${provider.name}`;
                  return (
                    <div className="provider-master-entry" key={provider.name}>
                      <button
                        type="button"
                        className={cn(
                          "provider-master-row",
                          editingName === provider.name && !addingProvider && "on",
                        )}
                        onClick={() => {
                          if (editingName === provider.name && !addingProvider) return;
                          requestProviderTarget(target);
                        }}
                      >
                        <span className="provider-master-name">{provider.name}</span>
                        {provider.keyState === "oauth" ? (
                          <span className="provider-oauth-mark">{t("OAuth")}</span>
                        ) : null}
                        {provider.active ? (
                          <i className="ph ph-check provider-active-check" title={t("Active")} />
                        ) : null}
                      </button>
                      {discardPrompt(target)}
                    </div>
                  );
                })}
            </div>
          </aside>
          <section className="provider-detail">
            {addingProvider ? (
              <div className="provider-add-panel">
                <h3>{t("Add provider")}</h3>
                {addProviderTop ? (
                  <>
                    <p className="provider-section-label">{t("OAuth")}</p>
                    {addProviderTop}
                    <div className="provider-add-divider" />
                  </>
                ) : null}
                <div className="provider-preset-list">
                  {[
                    ...PROVIDER_PRESETS.filter((preset) => preset.recommended),
                    ...PROVIDER_PRESETS.filter((preset) => !preset.recommended),
                  ].map((preset) => (
                    <button
                      type="button"
                      key={preset.name}
                      className="provider-preset-row"
                      onClick={() => pickPreset(preset)}
                    >
                      <span>
                        <strong>{preset.label}</strong>
                        <small>{preset.description}</small>
                      </span>
                      <i className="ph ph-caret-right" aria-hidden />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="provider-custom-row"
                  onClick={() => openEditor()}
                >
                  <i className="ph ph-sliders-horizontal" aria-hidden />
                  {t("Configure another provider")}
                </button>
              </div>
            ) : null}

        {editorOpen ? (
          <div className="provider-editor">
            <div className="provider-editor-head">
              <h3 className="text-[0.9375rem] font-semibold text-ink">
                {editingName ? editingName : t("New provider")}
              </h3>
              {editingName ? (
                <button
                  type="button"
                  className="provider-delete"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        t('Delete provider "{name}" and its saved key?', { name: editingName }),
                      )
                    ) {
                      return;
                    }
                    try {
                      await deleteConfigProvider(editingName);
                      showToast(t("Deleted {name}", { name: editingName }));
                      initialized.current = false;
                      setEditorOpen(false);
                      setEditingName(null);
                      await Promise.all([refresh(), onConfigChanged?.()]);
                    } catch (err) {
                      showToast(
                        err instanceof Error ? err.message : t("Delete failed"),
                        true,
                      );
                    }
                  }}
                >
                  {t("Delete")}
                </button>
              ) : null}
            </div>

            {editingName && status?.activeProvider === editingName ? (
              <p className="provider-default-note">
                {t("Default for new conversations:")}{" "}
                <strong>{status.activeModel}</strong>
                {" — "}
                {t("change it from the Default control at the top of Models.")}
              </p>
            ) : editingName ? (
              <p className="provider-default-note">
                {t("This provider is not the default. Use Set as default at the top of Models when you want new conversations to use one of its models.")}
              </p>
            ) : null}

            <div className="mt-4 space-y-4">
              <FieldFrame
                label={t("Provider name")}
                hint={t("A short unique name. Use letters, numbers, dash, dot, or underscore.")}
              >
                <TextInput
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={Boolean(editingName)}
                  autoComplete="off"
                />
              </FieldFrame>

              <FieldFrame
                label={t("Base URL")}
                hint={t("Required for custom / local / proxy providers.")}
              >
                <TextInput
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  autoComplete="off"
                />
              </FieldFrame>

              <FieldFrame label={t("API type")}>
                <select
                  className="w-full rounded-md border border-hairline bg-surface px-2.5 py-2 text-[0.9375rem]"
                  value={apiType}
                  onChange={(event) =>
                    setApiType(event.target.value as ApiType)
                  }
                >
                  <option value="openai-completions">
                    {t("openai-completions (most compatible)")}
                  </option>
                  <option value="openai-responses">{t("openai-responses")}</option>
                  <option value="anthropic-messages">{t("anthropic-messages")}</option>
                  <option value="google-generative-ai">
                    {t("google-generative-ai")}
                  </option>
                </select>
              </FieldFrame>

              <FieldFrame label={t("API key")} hint={keyHint}>
                <TextInput
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  autoComplete="off"
                />
                {keyUrl ? (
                  <a
                    className="mt-2 inline-flex items-center gap-1 text-[0.75rem] text-text-secondary underline underline-offset-2 hover:text-ink"
                    href={keyUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("Where do I get a key?")}
                  </a>
                ) : null}
                <div className="mt-2 flex gap-4 text-[0.75rem] text-text-secondary">
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      checked={keyStorage === "literal"}
                      onChange={() => setKeyStorage("literal")}
                    />
                    {t("Save my key on this computer")}
                  </label>
                  <label
                    className="flex items-center gap-1"
                    title={t("Advanced: store only the name of an environment variable that holds the key, not the key itself.")}
                  >
                    <input
                      type="radio"
                      checked={keyStorage === "env"}
                      onChange={() => setKeyStorage("env")}
                    />
                    {t("Use an environment variable (advanced)")}
                  </label>
                </div>
              </FieldFrame>

              <div className="space-y-3">
                <div>
                  <p className="text-[0.8125rem] font-semibold text-ink">{t("Models")}</p>
                  <HintText className="mt-0.5">
                    {t("Correct model limits and the effort choices shown in the composer.")}
                  </HintText>
                </div>
                {/* Actions sit under the Models heading, above the list.
                    Fetch leads: asking the provider what it offers is the
                    normal way to fill this in, typing ids by hand the fallback. */}
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => void fetchModels()}>
                    {t("Fetch model list")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setModelRows((prev) => [...prev, emptyModelRow()])
                    }
                  >
                    {t("+ Add model")}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={testing}
                    onClick={() => void testConnection()}
                  >
                    {testing ? t("Testing…") : t("Test connection")}
                  </Button>
                  {testResult ? (
                    <HintText
                      className={
                        testResult.ok ? "text-success" : "text-warning"
                      }
                    >
                      {testResult.message}
                    </HintText>
                  ) : null}
                  {manualModelListHint(name.trim()) ? (
                    <HintText>{manualModelListHint(name.trim())}</HintText>
                  ) : null}
                </div>
                {modelRows.map((row, index) => (
                  <div
                    key={index}
                    className="space-y-2 rounded-md border border-hairline bg-surface/50 p-3"
                  >
                    <div className="grid grid-cols-[2fr_1fr_auto] gap-2">
                      <TextInput
                        placeholder={t("model id (required)")}
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
                        placeholder={t("display name")}
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
                    <div className="grid gap-2 sm:grid-cols-3">
                      <label className="space-y-1 text-[0.72rem] text-text-secondary">
                        <span>{t("Context window")}</span>
                        <TextInput
                          type="number"
                          min="1"
                          placeholder={t("tokens")}
                          value={row.contextWindow}
                          onChange={(event) =>
                            setModelRows((prev) =>
                              prev.map((item, i) =>
                                i === index
                                  ? { ...item, contextWindow: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="space-y-1 text-[0.72rem] text-text-secondary">
                        <span>{t("Max output tokens")}</span>
                        <TextInput
                          type="number"
                          min="1"
                          placeholder={t("tokens")}
                          value={row.maxTokens}
                          onChange={(event) =>
                            setModelRows((prev) =>
                              prev.map((item, i) =>
                                i === index
                                  ? { ...item, maxTokens: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="flex items-end gap-1.5 pb-2 text-[0.75rem] text-text-secondary">
                        <input
                          type="checkbox"
                          checked={row.input?.includes("image") ?? false}
                          onChange={(event) =>
                            setModelRows((prev) =>
                              prev.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      input: event.target.checked
                                        ? ["text", "image"]
                                        : item.input
                                          ? ["text"]
                                          : undefined,
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                        {t("Image input")}
                      </label>
                    </div>
                    <div className="model-effort-editor">
                      <span>{t("Available thinking effort")}</span>
                      <div className="model-effort-levels">
                        {THINKING_LEVEL_OPTIONS.map((level) => {
                          const effectiveLevels =
                            row.thinkingLevels ??
                            row.availableThinkingLevels;
                          const enabled = effectiveLevels.includes(level);
                          return (
                            <label key={level}>
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={(event) =>
                                  setModelRows((previous) =>
                                    previous.map((item, itemIndex) => {
                                      if (itemIndex !== index) return item;
                                      const levels = new Set(
                                        item.thinkingLevels ??
                                          item.availableThinkingLevels,
                                      );
                                      if (event.target.checked) levels.add(level);
                                      else levels.delete(level);
                                      const thinkingLevels =
                                        THINKING_LEVEL_OPTIONS.filter(
                                          (candidate) => levels.has(candidate),
                                        );
                                      return {
                                        ...item,
                                        reasoning:
                                          item.reasoning ||
                                          thinkingLevels.some(
                                            (candidate) => candidate !== "off",
                                          ),
                                        thinkingLevels,
                                      };
                                    }),
                                  )
                                }
                              />
                              {level}
                            </label>
                          );
                        })}
                      </div>
                      <HintText>
                        {t("The composer offers only the checked levels.")}
                      </HintText>
                      {row.thinkingLevels !== undefined ? (
                        <button
                          type="button"
                          className="text-[0.75rem] text-muted underline"
                          onClick={() =>
                            setModelRows((previous) =>
                              previous.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, thinkingLevels: undefined }
                                  : item,
                              ),
                            )
                          }
                        >
                          {t("Use fetched levels")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <details className="config-advanced space-y-2" open={optionRows.length > 0}>
                <summary className="cursor-pointer text-[0.8125rem] font-semibold text-ink">
                  {t("Advanced options")}
                </summary>
                <p className="pt-1 text-[0.75rem] text-text-secondary">
                  {t("Extra provider settings passed through to Pi. Most setups don't need these.")}
                </p>
                {optionRows.map((row, index) => (
                  <div key={index} className="grid grid-cols-[2fr_1fr_auto] gap-2">
                    <TextInput
                      placeholder={t("option key")}
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
                      placeholder={t("value")}
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
                  {t("+ Add option")}
                </Button>
              </details>

              {discardPrompt("close")}
              {saveResult ? (
                <p
                  role={saveResult.kind === "error" ? "alert" : "status"}
                  className={cn(
                    "text-[0.8125rem]",
                    saveResult.kind === "error"
                      ? "text-danger"
                      : saveResult.kind === "warning"
                        ? "text-warning"
                        : "text-text-secondary",
                  )}
                >
                  {saveResult.text}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={closeEditor} disabled={saving}>
                  {t("Cancel")}
                </Button>
                <Button
                  variant="primary"
                  disabled={saving}
                  onClick={() => void saveProvider()}
                >
                  {saving ? t("Saving...") : t("Save provider")}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
          </section>
        </div>
      </div>

      {toast ? (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md px-4 py-2 text-[0.8125rem] text-surface shadow-lg",
            toast.error ? "bg-danger" : "bg-ink"
          )}
        >
          <span>{toast.text}</span>
          {toast.error ? (
            <button
              className="text-surface/80 hover:text-surface"
              aria-label={t("Dismiss")}
              onClick={() => setToast(null)}
            >
              ✕
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}


