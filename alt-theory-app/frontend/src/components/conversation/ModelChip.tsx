import { useEffect, useMemo, useState } from "react";
import type { ProviderView, SessionModelOverride, ThinkingLevel } from "@/api/types";
import { getConfigStatus, listConfigProviders } from "@/api/config";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { t } from "@/i18n";

interface ModelOption {
  provider: string;
  modelId: string;
  label: string;
  thinkingLevels: ThinkingLevel[];
}

interface ProviderOptions {
  name: string;
  models: ModelOption[];
}

function thinkingLevelsFor(model: ProviderView["models"][number]): ThinkingLevel[] {
  return model.reasoning ? (model.availableThinkingLevels ?? []) : [];
}

function initialThinkingFor(option: ModelOption): ThinkingLevel {
  const enabled = option.thinkingLevels.filter((level) => level !== "off");
  if (enabled.length === 0) return "medium";
  // Pick the positional middle of this model's actual levels. With an even
  // count, floor selects the lower of the two middle levels.
  return enabled[Math.floor((enabled.length - 1) / 2)] ?? "medium";
}

function groupProviders(providers: ProviderView[]): ProviderOptions[] {
  return providers
    .filter(
      (provider) =>
        provider.hasKey ||
        provider.keyState === "oauth" ||
        provider.keyState === "env-set",
    )
    .map((provider) => ({
      name: provider.name,
      models: provider.models.map((model) => ({
        provider: provider.name,
        modelId: model.id,
        label: model.name || model.id,
        thinkingLevels: thinkingLevelsFor(model),
      })),
    }))
    .filter((provider) => provider.models.length > 0);
}

/** Conversation model and effort picker, backed by WS set_session_model. */
export function ModelChip({
  open,
  onToggle,
  session,
}: {
  open: boolean;
  onToggle: () => void;
  session?: {
    ready: boolean;
    modelOverride: SessionModelOverride | null;
    currentModel: { provider: string; modelId: string } | null;
    setModel: (override: SessionModelOverride | null) => void;
  };
}) {
  const app = useApp();
  const shell = useShell();
  const [providers, setProviders] = useState<ProviderOptions[] | null>(null);
  const [defaultModel, setDefaultModel] = useState<{
    provider: string;
    modelId: string;
  } | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [effortOpen, setEffortOpen] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    Promise.all([listConfigProviders(), getConfigStatus()])
      .then(([result, status]) => {
        if (cancelled) return;
        setProviders(groupProviders(result.providers));
        setDefaultModel(
          status.activeProvider && status.activeModel
            ? {
                provider: status.activeProvider,
                modelId: status.activeModel,
              }
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setExpandedProvider(null);
      setEffortOpen(false);
    }
  }, [open]);

  const modelOverride = session ? session.modelOverride : app.modelOverride;
  const currentModel = session ? session.currentModel : app.currentSessionModel;
  const setModel = session?.setModel ?? app.setSessionModel;
  const effectiveModel = modelOverride ?? currentModel ?? defaultModel;
  const selectedOption = useMemo(
    () =>
      providers
        ?.flatMap((provider) => provider.models)
        .find(
          (option) =>
            option.provider === effectiveModel?.provider &&
            option.modelId === effectiveModel?.modelId,
        ) ?? null,
    [effectiveModel, providers],
  );
  const effectiveThinking =
    modelOverride?.thinkingLevel ??
    (selectedOption ? initialThinkingFor(selectedOption) : "medium");
  const activeProvider = effectiveModel?.provider ?? defaultModel?.provider ?? null;
  const activeGroup =
    providers?.find((provider) => provider.name === activeProvider) ?? null;
  const otherGroups =
    providers?.filter((provider) => provider.name !== activeProvider) ?? [];
  const usingDefault =
    !modelOverride &&
    effectiveModel?.provider === defaultModel?.provider &&
    effectiveModel?.modelId === defaultModel?.modelId;
  const chipLabel = effectiveModel
    ? `${effectiveModel.modelId}${
        selectedOption?.thinkingLevels.length &&
        selectedOption.thinkingLevels.some((level) => level !== "off")
          ? ` · ${effectiveThinking}`
          : ""
      }`
    : t("Choose model");
  const title = effectiveModel
    ? `${effectiveModel.provider} / ${effectiveModel.modelId}${
        selectedOption?.thinkingLevels.some((level) => level !== "off")
          ? ` · ${effectiveThinking}`
          : ""
      }`
    : t("Choose a model");

  const pick = (option: ModelOption, thinkingLevel?: ThinkingLevel) => {
    const selectedThinking =
      thinkingLevel ??
      (effectiveModel?.provider === option.provider &&
      effectiveModel?.modelId === option.modelId &&
      modelOverride?.thinkingLevel
        ? modelOverride.thinkingLevel
        : initialThinkingFor(option));
    setModel({
      provider: option.provider,
      modelId: option.modelId,
      thinkingLevel: selectedThinking,
    });
    if (
      thinkingLevel === undefined &&
      option.thinkingLevels.some((level) => level !== "off")
    ) {
      setEffortOpen(true);
    } else {
      onToggle();
    }
  };

  const isActive = (option: ModelOption) =>
    effectiveModel?.provider === option.provider &&
    effectiveModel?.modelId === option.modelId;

  const renderModel = (option: ModelOption) => {
    const active = isActive(option);
    const hasEffort = option.thinkingLevels.some((level) => level !== "off");
    return (
      <div key={`${option.provider}:${option.modelId}`} className="model-menu-item">
        <div className="mi" onClick={() => pick(option)}>
          <span style={{ fontWeight: active ? 500 : 400 }}>{option.label}</span>
          {active ? <i className="ph ph-check check" /> : null}
        </div>
        {active && hasEffort ? (
          <>
            <div
              className="mi model-effort-trigger"
              onClick={() => setEffortOpen((value) => !value)}
            >
              <span>{t("Thinking effort")}</span>
              <span className="model-effort-value">{effectiveThinking}</span>
              <i
                className={`ph ph-caret-${effortOpen ? "up" : "down"} caret`}
                aria-hidden
              />
            </div>
            {effortOpen ? (
              <div className="model-effort-options">
                {option.thinkingLevels.map((level) => (
                  <div
                    key={level}
                    className="mi"
                    onClick={() => pick(option, level)}
                  >
                    <span>{level}</span>
                    {effectiveThinking === level ? (
                      <i className="ph ph-check check" />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <button
        className="flat"
        style={{ marginLeft: "auto" }}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        disabled={!(session?.ready ?? app.sessionReady)}
        title={title}
      >
        {chipLabel}
        <i className="ph ph-caret-down caret" />
      </button>
      <div
        className={`menu model-picker${open ? " on" : ""}`}
        style={{ right: 40, bottom: 36, left: "auto" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="mi"
          onClick={() => {
            setModel(null);
            onToggle();
          }}
        >
          <span>
            {t("App default")}
            {defaultModel ? ` · ${defaultModel.modelId}` : ""}
          </span>
          {usingDefault ? <i className="ph ph-check check" /> : null}
        </div>
        <div className="sep" />
        {error ? (
          <div className="rp-empty" style={{ padding: "8px 10px" }}>
            {t("Models unavailable here.")}
          </div>
        ) : !providers ? (
          <div className="rp-empty" style={{ padding: "8px 10px" }}>
            {t("Loading…")}
          </div>
        ) : providers.length === 0 ? (
          <div className="rp-empty" style={{ padding: "8px 10px" }}>
            {t("No models configured.")}
          </div>
        ) : (
          <>
            {activeGroup ? (
              <div className="model-provider-section">
                <div className="model-provider-label">{activeGroup.name}</div>
                {activeGroup.models.map(renderModel)}
              </div>
            ) : null}
            {otherGroups.map((provider) => {
              const expanded = expandedProvider === provider.name;
              return (
                <div key={provider.name} className="model-provider-section">
                  <div
                    className="mi model-provider-trigger"
                    onClick={() =>
                      setExpandedProvider(expanded ? null : provider.name)
                    }
                  >
                    <span>{provider.name}</span>
                    <i
                      className={`ph ph-caret-${expanded ? "up" : "down"} caret`}
                      aria-hidden
                    />
                  </div>
                  {expanded ? (
                    <div className="model-provider-models">
                      {provider.models.map(renderModel)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </>
        )}
        <div className="sep" />
        <div className="mi" onClick={() => shell.openSettings("models")}>
          <i className="ph ph-cpu" />
          {t("Manage models")}
        </div>
      </div>
    </>
  );
}
