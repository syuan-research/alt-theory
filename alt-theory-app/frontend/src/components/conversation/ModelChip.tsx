import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ProviderView,
  ResolvedThinking,
  SessionModelOverride,
  ThinkingLevel,
} from "@/api/types";
import { getConfigStatus, listConfigProviders } from "@/api/config";
import { PendingMark } from "@/components/ui/PendingMark";
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
  // A non-empty availableThinkingLevels list is authoritative for the
  // selector; the model's reasoning boolean is not an extra gate (v1.4.7 —
  // two models under one provider may differ in their level sets).
  return model.availableThinkingLevels ?? [];
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
    /** The backend resolver's answer; the chip computes no level itself. */
    thinking: ResolvedThinking | null;
    /** A model switch accepted mid-run, applying when the turn ends. */
    pendingModel: boolean;
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
  // Section order and expansion are frozen for the life of one open menu.
  // Deriving "active group first" from live state re-sorts the list the
  // moment a model is picked, yanking the just-clicked row away from the
  // cursor; freezing keeps the effort row expanding exactly in place.
  const [frozenGroups, setFrozenGroups] = useState<ProviderOptions[] | null>(
    null,
  );
  const [hoistedName, setHoistedName] = useState<string | null>(null);
  const [effortOpen, setEffortOpen] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [filterIndex, setFilterIndex] = useState(0);
  const filterRef = useRef<HTMLInputElement>(null);

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
      setQuery("");
      setFilterIndex(0);
      setFrozenGroups(null);
      setHoistedName(null);
    } else {
      window.setTimeout(() => filterRef.current?.focus(), 0);
    }
  }, [open]);

  const modelOverride = session ? session.modelOverride : app.modelOverride;
  const currentModel = session ? session.currentModel : app.currentSessionModel;
  const thinking = session ? session.thinking : app.thinking;
  const pendingModel = session
    ? session.pendingModel
    : app.pendingChanges.model !== undefined;
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
  // Rendered, never computed: the level in use and, when the provider
  // clamped the user's choice, both (copy rule: "low — model uses medium").
  const effectiveThinking = thinking?.level ?? modelOverride?.thinkingLevel ?? null;
  const thinkingText =
    thinking?.source === "clamped" && thinking.chosen
      ? t("{chosen} — model uses {level}", {
          chosen: thinking.chosen,
          level: thinking.level,
        })
      : (effectiveThinking ?? "");
  const checkedThinking = thinking?.chosen ?? effectiveThinking;
  const activeProvider = effectiveModel?.provider ?? defaultModel?.provider ?? null;
  // One-shot snapshot per open menu: hoist the group holding the current
  // model to the top, then keep that order (and the hoisted section
  // expanded) until the menu closes.
  useEffect(() => {
    if (!open || !providers || frozenGroups) return;
    const hoisted =
      providers.find((provider) => provider.name === activeProvider) ?? null;
    setFrozenGroups(
      hoisted
        ? [hoisted, ...providers.filter((p) => p.name !== hoisted.name)]
        : providers,
    );
    setHoistedName(hoisted?.name ?? null);
  }, [open, providers, frozenGroups, activeProvider]);
  const displayGroups = frozenGroups ?? providers ?? [];
  const usingDefault =
    !modelOverride &&
    effectiveModel?.provider === defaultModel?.provider &&
    effectiveModel?.modelId === defaultModel?.modelId;
  const filteredModels = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return (providers ?? [])
      .flatMap((provider) => provider.models)
      .filter((option) =>
        `${option.provider} ${option.label} ${option.modelId}`
          .toLowerCase()
          .includes(needle),
      );
  }, [providers, query]);
  useEffect(() => setFilterIndex(0), [query]);
  const showsEffort =
    Boolean(thinkingText) &&
    (selectedOption?.thinkingLevels.some((level) => level !== "off") ?? false);
  const chipLabel = effectiveModel
    ? `${effectiveModel.modelId}${showsEffort ? ` · ${thinkingText}` : ""}`
    : t("Choose model");
  const title = effectiveModel
    ? `${effectiveModel.provider} / ${effectiveModel.modelId}${
        showsEffort ? ` · ${thinkingText}` : ""
      }`
    : t("Choose a model");

  const pick = (option: ModelOption, thinkingLevel?: ThinkingLevel) => {
    // Only a level the user picked travels; absent = the backend resolves
    // the model's default and says so (source: model-default).
    const selectedThinking =
      thinkingLevel ??
      (effectiveModel?.provider === option.provider &&
      effectiveModel?.modelId === option.modelId
        ? modelOverride?.thinkingLevel
        : undefined);
    setModel({
      provider: option.provider,
      modelId: option.modelId,
      ...(selectedThinking ? { thinkingLevel: selectedThinking } : {}),
    });
    if (
      thinkingLevel === undefined &&
      option.thinkingLevels.some((level) => level !== "off")
    ) {
      setEffortOpen(true);
      // Leave search after a pick: the effort row lives only in the group
      // view, so staying in the flat result list makes the pick look inert.
      if (query.trim()) {
        setQuery("");
        setExpandedProvider(option.provider);
      }
    } else {
      onToggle();
    }
  };

  const isActive = (option: ModelOption) =>
    effectiveModel?.provider === option.provider &&
    effectiveModel?.modelId === option.modelId;

  // Reveal the model row, not just the effort row beneath it: entering from
  // search with only "Thinking effort" at the edge leaves the model name one
  // row above the fold. The container holds the model row and the effort row
  // together. A stable callback fires only on mount/unmount; an inline ref
  // would re-fire on every parent re-render (each WS status tick) and
  // repeatedly yank the scroll position back to the hoisted section.
  const revealEffortRow = useCallback((el: HTMLDivElement | null) => {
    el?.parentElement?.scrollIntoView({ block: "nearest" });
  }, []);

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
              ref={revealEffortRow}
              onClick={() => setEffortOpen((value) => !value)}
            >
              <span>{t("Thinking effort")}</span>
              <span className="model-effort-value">{thinkingText}</span>
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
                    {checkedThinking === level ? (
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
        data-tip={title}
      >
        {chipLabel}
        <PendingMark when={pendingModel} />
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
            {query.trim() ? (
              filteredModels.length ? (
                <div className="model-provider-section">
                  {filteredModels.map((option, index) => (
                    <div
                      key={`${option.provider}:${option.modelId}`}
                      className={`mi${index === filterIndex ? " on" : ""}`}
                      onMouseEnter={() => setFilterIndex(index)}
                      onClick={() => pick(option)}
                    >
                      <span>{option.label}</span>
                      <span className="model-filter-provider">{option.provider}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rp-empty" style={{ padding: "8px 10px" }}>
                  {t("No matching models")}
                </div>
              )
            ) : displayGroups.length ? (
              displayGroups.map((provider) => {
                const hoisted = provider.name === hoistedName;
                const expanded = hoisted || expandedProvider === provider.name;
                return (
                  <div key={provider.name} className="model-provider-section">
                    {hoisted ? (
                      <div className="model-provider-label">{provider.name}</div>
                    ) : (
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
                    )}
                    {expanded ? (
                      <div className="model-provider-models">
                        {provider.models.map(renderModel)}
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : null}
          </>
        )}
        <div className="sep" />
        <div className="model-filter">
          <i className="ph ph-magnifying-glass" aria-hidden="true" />
          <input
            ref={filterRef}
            value={query}
            placeholder={t("Filter models")}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (!query.trim() || filteredModels.length === 0) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                setFilterIndex(
                  (index) =>
                    (index + step + filteredModels.length) % filteredModels.length,
                );
              } else if (event.key === "Enter") {
                event.preventDefault();
                pick(filteredModels[filterIndex]!);
              }
            }}
          />
        </div>
        <div className="sep" />
        <div className="mi" onClick={() => shell.openSettings("models")}>
          <i className="ph ph-cpu" />
          {t("Manage models")}
        </div>
      </div>
    </>
  );
}
