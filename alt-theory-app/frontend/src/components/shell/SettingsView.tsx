import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/api/http";
import {
  cancelProviderAuth,
  getAutoTitleSettings,
  getDefaultAltMode,
  saveDefaultAltMode,
  getRuntimeSettings,
  saveRuntimeSettings,
  getLangSetting,
  saveLangSetting,
  type LangSettingValue,
  getDataFolder,
  getProviderAuthFlow,
  getSkillPrecedence,
  getSubagentSettings,
  listConfigProviders,
  listProviderAuthStatus,
  logoutProviderAuth,
  respondToProviderAuth,
  saveAutoTitleSettings,
  saveSkillPrecedence,
  saveSubagentSettings,
  startProviderAuth,
  getAssetDirs,
  saveAssetDirs,
  uploadRolePreset,
  type AssetDirs,
  type AutoTitleSettings,
  type SkillPrecedence,
  type SubagentConfig,
  type SubagentPreset,
  getWorkingFolders,
  saveWorkingFolders,
  type WorkingFoldersSettings,
} from "@/api/config";
import type {
  ProviderAuthFlow,
  ProviderAuthId,
  SessionSummary,
} from "@/api/types";
import { ModelConfigPage } from "@/pages/ModelConfigPage";
import { authConnectEntryStep } from "@/lib/authConnect";
import { hasNativeBridge, pickDirectory, pickFiles, revealPath } from "@/lib/native";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { t } from "@/i18n";
import {
  fetchTrashSessions,
  permanentlyDeleteSession,
  restoreSession,
  type SessionDisplayName,
} from "@/api/sessions";
import { folderLabel, sessionTitle } from "@/lib/sessionList";
import { GENERAL_TIPS, productTipText } from "@/config/productTips";

interface NavItem {
  key: string;
  label: string;
  icon: string;
  soon?: boolean;
}

export function SettingsView() {
  const app = useApp();
  const shell = useShell();

  const items: NavItem[] = [
    { key: "general", label: t("General"), icon: "ph-gear" },
    { key: "models", label: t("Models"), icon: "ph-cpu" },
    { key: "agents", label: t("Subagents"), icon: "ph-robot" },
    { key: "folders", label: t("Working folders"), icon: "ph-folders" },
    { key: "rolekb", label: t("Role & Knowledge"), icon: "ph-books" },
    { key: "skills", label: t("Skills"), icon: "ph-toolbox" },
    ...(shell.participantTabEnabled
      ? [
          {
            key: "participant",
            label: t("Participant mode"),
            icon: "ph-identification-badge",
          },
        ]
      : []),
    { key: "features", label: t("Help center"), icon: "ph-lifebuoy" },
    { key: "trash", label: t("Trash"), icon: "ph-trash" },
    { key: "about", label: t("About"), icon: "ph-info" },
  ];

  // If the participant tab is disabled while selected, fall back to general.
  useEffect(() => {
    if (!items.some((i) => i.key === shell.settingsPanel)) {
      shell.setSettingsPanel("general");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell.participantTabEnabled]);

  return (
    <div className="settings">
      <nav className="set-nav">
        <button className="back-app" onClick={shell.openApp}>
          <i className="ph ph-arrow-left" />
          {t("Back to app")}
        </button>
        {items.map((item) => (
          <button
            key={item.key}
            className={`set-item${shell.settingsPanel === item.key ? " on" : ""}`}
            onClick={() => shell.setSettingsPanel(item.key)}
          >
            <i className={`ph ${item.icon}`} />
            {item.label}
            {item.soon ? <span className="soon">{t("soon")}</span> : null}
          </button>
        ))}
        <div className="set-nav-spacer" />
      </nav>
      <div className="set-body">
        {shell.settingsPanel === "models" ? <ModelsPanel /> : null}
        {shell.settingsPanel === "agents" ? <AgentsPanel /> : null}
        {shell.settingsPanel === "general" ? <GeneralPanel /> : null}
        {shell.settingsPanel === "folders" ? <WorkingFoldersPanel /> : null}
        {shell.settingsPanel === "rolekb" ? <RoleKbPanel /> : null}
        {shell.settingsPanel === "skills" ? <SkillsPanel /> : null}
        {shell.settingsPanel === "participant" ? (
          <ParticipantPanel designated={app.participant?.designated ?? false} label={app.participant?.label ?? null} local={app.appMode === "local"} />
        ) : null}
        {shell.settingsPanel === "features" ? <FeaturesPanel /> : null}
        {shell.settingsPanel === "trash" ? <TrashPanel /> : null}
        {shell.settingsPanel === "about" ? <AboutPanel /> : null}
      </div>
    </div>
  );
}

function TrashPanel() {
  const app = useApp();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [names, setNames] = useState<Record<string, SessionDisplayName>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mutating, setMutating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError("");
    try {
      const next = await fetchTrashSessions();
      setSessions(next);
      setNames(Object.fromEntries(next.map((session) => [
        session.sessionId,
        { alias: session.alias ?? "", snippet: session.snippet ?? "" },
      ])));
      setSelected((current) => {
        const present = new Set(next.map((session) => session.sessionId));
        return new Set([...current].filter((id) => present.has(id)));
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (sessionId: string) => {
    try {
      await restoreSession(sessionId);
      setSessions((current) =>
        current.filter((session) => session.sessionId !== sessionId),
      );
      setSelected((current) => {
        const next = new Set(current);
        next.delete(sessionId);
        return next;
      });
      await app.refreshSessions();
      void load(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const remove = (sessionId: string) => {
    app.requestConfirm({
      message: t("Permanently delete this conversation?"),
      details: [
        t("This cannot be undone."),
        t("Attachments and working files will be kept."),
      ],
      confirmLabel: t("Delete permanently"),
      cancelLabel: t("Cancel"),
      onConfirm: () => {
        void permanentlyDeleteSession(sessionId)
          .then(() => {
            setSessions((current) =>
              current.filter((session) => session.sessionId !== sessionId),
            );
            setSelected((current) => {
              const next = new Set(current);
              next.delete(sessionId);
              return next;
            });
            void load(true);
          })
          .catch((reason) =>
            setError(reason instanceof Error ? reason.message : String(reason)),
          );
      },
    });
  };

  const actOnSelected = async (action: "restore" | "delete") => {
    const ids = [...selected];
    if (!ids.length || mutating) return;
    setMutating(true);
    setError("");
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          action === "restore" ? restoreSession(id) : permanentlyDeleteSession(id),
        ),
      );
      const succeeded = ids.filter(
        (_, index) => results[index].status === "fulfilled",
      );
      const failed = ids.length - succeeded.length;
      const successSet = new Set(succeeded);
      setSessions((current) =>
        current.filter((session) => !successSet.has(session.sessionId)),
      );
      setSelected((current) =>
        new Set([...current].filter((id) => !successSet.has(id))),
      );
      if (action === "restore" && succeeded.length) await app.refreshSessions();
      if (failed) {
        setError(
          t("{done} succeeded; {failed} failed. Failed conversations remain selected.", {
            done: succeeded.length,
            failed,
          }),
        );
      }
      void load(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setMutating(false);
    }
  };

  const confirmDeleteSelected = () => {
    if (!selected.size) return;
    app.requestConfirm({
      message: t("Permanently delete {count} selected conversations?", {
        count: selected.size,
      }),
      details: [
        t("This cannot be undone."),
        t("Attachments and working files will be kept."),
      ],
      confirmLabel: t("Delete selected permanently"),
      cancelLabel: t("Cancel"),
      onConfirm: () => void actOnSelected("delete"),
    });
  };

  return (
    <div className="set-panel">
      <h2>{t("Trash")}</h2>
      <p className="sub">{t("Deleted conversations are kept for 30 days.")}</p>
      {error ? <p className="fine">{error}</p> : null}
      {sessions.length > 0 ? (
        <div className="trash-batch-bar">
          <button onClick={() => setSelected(new Set(sessions.map((item) => item.sessionId)))}>
            {t("Select all")}
          </button>
          <button
            onClick={() =>
              setSelected(
                new Set(
                  sessions
                    .filter((item) => !selected.has(item.sessionId))
                    .map((item) => item.sessionId),
                ),
              )
            }
          >
            {t("Invert selection")}
          </button>
          <span>{t("{count} selected", { count: selected.size })}</span>
          <button
            disabled={!selected.size || mutating}
            onClick={() => void actOnSelected("restore")}
          >
            {t("Restore selected")}
          </button>
          <button
            className="danger"
            disabled={!selected.size || mutating}
            onClick={confirmDeleteSelected}
          >
            {t("Delete selected permanently")}
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="set-card"><p>{t("Loading conversations…")}</p></div>
      ) : sessions.length === 0 ? (
        <div className="set-card"><p>{t("Trash is empty.")}</p></div>
      ) : (
        sessions.map((session) => {
          const due = session.trashDueAt ? Date.parse(session.trashDueAt) : NaN;
          const days = Number.isNaN(due)
            ? null
            : Math.max(0, Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000)));
          return (
            <div className="set-card" key={session.sessionId}>
              <div className="row2">
                <label className="trash-select">
                  <input
                    type="checkbox"
                    checked={selected.has(session.sessionId)}
                    onChange={(event) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(session.sessionId);
                        else next.delete(session.sessionId);
                        return next;
                      })
                    }
                    aria-label={t("Select conversation")}
                  />
                </label>
                <div className="trash-row-copy">
                  <h4>{sessionTitle(session, names, sessions)}</h4>
                  <p>
                    {days == null
                      ? t("Scheduled for deletion")
                      : t("Deletes in {count} days", { count: days })}
                  </p>
                </div>
                <div className="trash-actions">
                  <button onClick={() => void restore(session.sessionId)}>
                    {t("Restore")}
                  </button>
                  <button className="danger" onClick={() => remove(session.sessionId)}>
                    {t("Delete permanently")}
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function ModelsPanel() {
  const app = useApp();
  const local = app.appMode === "local";
  const [configVersion, setConfigVersion] = useState(0);
  const [reconnectRequest, setReconnectRequest] = useState<{
    provider: ProviderAuthId;
    id: number;
  } | null>(null);
  const refreshConfig = useCallback(() => {
    setConfigVersion((version) => version + 1);
    void app.refreshLocalConfig();
  }, [app.refreshLocalConfig]);

  return (
    <div className="set-panel models-panel">
      {local ? (
        <ModelConfigPage
          embedded
          key={configVersion}
          onConfigChanged={app.refreshLocalConfig}
          onReconnectOAuth={(provider) =>
            setReconnectRequest({ provider: provider as ProviderAuthId, id: Date.now() })
          }
          addProviderTop={
            <AuthConnectCard
              onChanged={refreshConfig}
              openRequest={reconnectRequest}
              onOpenRequestHandled={() => setReconnectRequest(null)}
            />
          }
        />
      ) : (
        <div className="set-card">
          <p>{t("Model configuration is managed by this deployment.")}</p>
        </div>
      )}
    </div>
  );
}

const BUILTIN_AGENT_IDS = new Set([
  "general-medium",
  "general-low",
  "general-high",
]);
const AGENT_THINKING_LEVELS = [
  "",
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

function splitAgentModelRef(reference: string): [string, string] {
  const colon = reference.lastIndexOf(":");
  const suffix = colon >= 0 ? reference.slice(colon + 1) : "";
  return AGENT_THINKING_LEVELS.includes(suffix as (typeof AGENT_THINKING_LEVELS)[number]) && suffix
    ? [reference.slice(0, colon), suffix]
    : [reference, ""];
}

function joinAgentModelRef(model: string, thinking: string): string {
  return thinking ? `${model}:${thinking}` : model;
}

function builtInAgentDescription(id: string, fallback: string): string {
  if (id === "general-medium") return t("Default for most work and whenever the right level is uncertain");
  if (id === "general-low") return t("High-volume, error-tolerant extraction, web search, and simple checks with clear criteria");
  if (id === "general-high") return t("Review, strategic planning, and complex framework or architecture analysis with unknown unknowns");
  return fallback;
}

function AgentModelFields({
  reference,
  models,
  onChange,
  onRemove,
}: {
  reference: string;
  models: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  onRemove?: () => void;
}) {
  const [model, thinking] = splitAgentModelRef(reference);
  const options = models.some((option) => option.value === model)
    ? models
    : [...models, { value: model, label: model }];
  return (
    <div className="agent-model-fields">
      <select
        aria-label={t("Model")}
        value={model}
        onChange={(event) => onChange(joinAgentModelRef(event.target.value, thinking))}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <select
        aria-label={t("Thinking")}
        value={thinking}
        onChange={(event) => onChange(joinAgentModelRef(model, event.target.value))}
      >
        {AGENT_THINKING_LEVELS.map((level) => (
          <option key={level || "default"} value={level}>
            {level ? t(level) : t("Model default")}
          </option>
        ))}
      </select>
      {onRemove ? (
        <button className="agent-icon-btn" aria-label={t("Remove fallback")} onClick={onRemove}>
          <i className="ph ph-trash" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * The effective chain is [model, ...fallbackModels]; ordering operates on the
 * whole chain even though the config persists the head as `model`. Promoting
 * the first fallback swaps it with the current model.
 */
function promoteFirstFallback(item: SubagentPreset): SubagentPreset {
  const [first, ...rest] = item.fallbackModels;
  if (!first) return item;
  return { ...item, model: first, fallbackModels: [item.model, ...rest] };
}

function AgentsPanel() {
  const app = useApp();
  const [config, setConfig] = useState<SubagentConfig | null>(null);
  const [models, setModels] = useState<Array<{ value: string; label: string }>>([
    { value: "inherit", label: t("Inherit current model") },
  ]);
  const [path, setPath] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (app.appMode !== "local") return;
    let alive = true;
    void Promise.all([getSubagentSettings(), listConfigProviders()])
      .then(([settings, providers]) => {
        if (!alive) return;
        setConfig(settings.config);
        setPath(settings.path);
        setStatus(settings.warning ?? "");
        setModels([
          { value: "inherit", label: t("Inherit current model") },
          ...providers.providers.flatMap((provider) =>
            provider.models.map((model) => ({
              value: `${provider.name}/${model.id}`,
              label: `${provider.name} / ${model.name || model.id}`,
            })),
          ),
        ]);
      })
      .catch((error) => alive && setStatus(error instanceof Error ? error.message : String(error)));
    return () => { alive = false; };
  }, [app.appMode]);

  if (app.appMode !== "local") {
    return <div className="set-panel"><div className="set-card"><p>{t("Subagent configuration is managed by this deployment.")}</p></div></div>;
  }
  if (!config) {
    return <div className="set-panel agents-panel"><p className="sub">{status || t("Loading…")}</p></div>;
  }

  const updateAgent = (index: number, update: (agent: SubagentPreset) => SubagentPreset) => {
    setConfig((current) => current && ({
      ...current,
      agents: current.agents.map((agent, i) => i === index ? update(agent) : agent),
    }));
    setStatus("");
  };
  const save = async () => {
    setSaving(true);
    setStatus("");
    try {
      const result = await saveSubagentSettings(config);
      setConfig(result.config);
      setStatus(t("Saved. New conversations use these settings now. Open conversations keep their current agent setup until they are reopened."));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };
  const addCustom = () => {
    let number = 1;
    while (config.agents.some((agent) => agent.id === `custom-${number}`)) number += 1;
    setConfig({
      ...config,
      agents: [...config.agents, {
        id: `custom-${number}`,
        description: "",
        model: "inherit:medium",
        fallbackModels: [],
      }],
    });
    setStatus("");
  };
  const renderAgent = (agent: SubagentPreset, index: number, builtIn: boolean) => (
    <div className="agent-preset" key={agent.id}>
      <div className="agent-preset-copy">
        {builtIn ? <h4>{agent.id}</h4> : (
          <input
            className="agent-name-input"
            aria-label={t("Subagent name")}
            value={agent.id}
            onChange={(event) => {
              const id = event.target.value;
              setConfig((current) => current && ({
                ...current,
                defaultAgent: current.defaultAgent === agent.id ? id : current.defaultAgent,
                agents: current.agents.map((item, i) => i === index ? { ...item, id } : item),
              }));
              setStatus("");
            }}
          />
        )}
        {builtIn ? <p>{builtInAgentDescription(agent.id, agent.description ?? "")}</p> : (
          <input
            className="agent-description-input"
            aria-label={t("Description")}
            placeholder={t("When should this subagent be used?")}
            value={agent.description ?? ""}
            onChange={(event) => updateAgent(index, (item) => ({ ...item, description: event.target.value }))}
          />
        )}
      </div>
      <div className="agent-preset-controls">
        <div className="agent-fallback">
          <div className="agent-fallback-heading">
            <span>{t("Model")}</span>
            <span>
              <button className="agent-icon-btn" aria-label={t("Move model up")} disabled>
                <i className="ph ph-arrow-up" />
              </button>
              <button
                className="agent-icon-btn"
                aria-label={t("Move model down")}
                disabled={agent.fallbackModels.length === 0}
                onClick={() => updateAgent(index, promoteFirstFallback)}
              >
                <i className="ph ph-arrow-down" />
              </button>
            </span>
          </div>
          <AgentModelFields
            reference={agent.model}
            models={models}
            onChange={(model) => updateAgent(index, (item) => ({ ...item, model }))}
          />
        </div>
        {agent.fallbackModels.map((fallback, fallbackIndex) => (
          <div className="agent-fallback" key={`${fallbackIndex}-${fallback}`}>
            <div className="agent-fallback-heading">
              <span>{t("Fallback {number}", { number: fallbackIndex + 1 })}</span>
              <span>
                <button
                  className="agent-icon-btn"
                  aria-label={t("Move fallback up")}
                  onClick={() => updateAgent(index, (item) => {
                    if (fallbackIndex === 0) return promoteFirstFallback(item);
                    const next = [...item.fallbackModels];
                    [next[fallbackIndex - 1], next[fallbackIndex]] = [next[fallbackIndex], next[fallbackIndex - 1]];
                    return { ...item, fallbackModels: next };
                  })}
                ><i className="ph ph-arrow-up" /></button>
                <button
                  className="agent-icon-btn"
                  aria-label={t("Move fallback down")}
                  disabled={fallbackIndex === agent.fallbackModels.length - 1}
                  onClick={() => updateAgent(index, (item) => {
                    const next = [...item.fallbackModels];
                    [next[fallbackIndex], next[fallbackIndex + 1]] = [next[fallbackIndex + 1], next[fallbackIndex]];
                    return { ...item, fallbackModels: next };
                  })}
                ><i className="ph ph-arrow-down" /></button>
              </span>
            </div>
            <AgentModelFields
              reference={fallback}
              models={models}
              onChange={(value) => updateAgent(index, (item) => ({
                ...item,
                fallbackModels: item.fallbackModels.map((entry, i) => i === fallbackIndex ? value : entry),
              }))}
              onRemove={() => updateAgent(index, (item) => ({
                ...item,
                fallbackModels: item.fallbackModels.filter((_, i) => i !== fallbackIndex),
              }))}
            />
          </div>
        ))}
        <div className="agent-row-actions">
          <button className="link-btn" onClick={() => updateAgent(index, (item) => ({
            ...item,
            fallbackModels: [...item.fallbackModels, "inherit"],
          }))}>{t("Add fallback")}</button>
          {!builtIn ? (
            <button className="link-btn danger" onClick={() => setConfig({
              ...config,
              agents: config.agents.filter((_, i) => i !== index),
              defaultAgent: config.defaultAgent === agent.id ? "general-medium" : config.defaultAgent,
            })}>{t("Delete")}</button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="set-panel agents-panel">
      <div className="agents-heading">
        <div><h2>{t("Subagents")}</h2><p className="sub">{t("Choose model and thinking defaults for delegated work.")}</p></div>
        <button className="add-btn" disabled={saving} onClick={() => void save()}>{saving ? t("Saving…") : t("Save")}</button>
      </div>
      <div className="agent-default-row">
        <label htmlFor="default-agent">{t("Default subagent")}</label>
        <select id="default-agent" value={config.defaultAgent} onChange={(event) => setConfig({ ...config, defaultAgent: event.target.value })}>
          {config.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.id}</option>)}
        </select>
      </div>
      <section className="agent-section">
        <h3>{t("Built-in subagents")}</h3>
        <div className="agent-preset-list">{config.agents.map((agent, index) => BUILTIN_AGENT_IDS.has(agent.id) ? renderAgent(agent, index, true) : null)}</div>
      </section>
      <section className="agent-section">
        <div className="agent-section-heading"><h3>{t("Custom subagents")}</h3><button className="add-btn" onClick={addCustom}><i className="ph ph-plus" />{t("New")}</button></div>
        <div className="agent-preset-list">{config.agents.map((agent, index) => !BUILTIN_AGENT_IDS.has(agent.id) ? renderAgent(agent, index, false) : null)}</div>
      </section>
      {status ? <p className="agent-status">{status}</p> : null}
      {path ? <p className="agent-config-path">{path}</p> : null}
    </div>
  );
}

export function AuthConnectCard({
  onChanged,
  openRequest,
  onOpenRequestHandled,
}: {
  onChanged: () => void;
  openRequest?: { provider: ProviderAuthId; id: number } | null;
  onOpenRequestHandled?: () => void;
}) {
  // Presentation only: one icon and the localized name per provider id. The
  // provider LIST itself comes from the server status response, whose ids
  // mirror the server's single PROVIDER_AUTH_IDS source. Names stay t()
  // literals so the i18n key scanner catalogues them.
  const PROVIDER_ICONS: Record<string, string> = {
    openrouter: "ph-compass",
    xai: "ph-lightning",
    "openai-codex": "ph-code",
    "github-copilot": "ph-github-logo",
    "kimi-coding": "ph-moon-stars",
  };
  const PROVIDER_NAMES: Record<string, string> = {
    openrouter: t("OpenRouter"),
    xai: t("Grok"),
    "openai-codex": t("ChatGPT (Codex)"),
    "github-copilot": t("GitHub Copilot"),
    "kimi-coding": t("Kimi For Coding"),
  };
  const providerName = (id: ProviderAuthId | string, fallback: string) =>
    PROVIDER_NAMES[id] ?? fallback;
  // Known Pi prompt/event wording restated in plain language; anything not
  // listed passes through unchanged. The information Pi gives must reach the
  // user, not the jargon (owner ruling 2026-09-03).
  const PLAIN_AUTH_TEXT: Record<string, string> = {
    "GitHub Enterprise URL/domain (blank for github.com)": t(
      "Company GitHub server address — leave blank for a normal GitHub account"
    ),
    "Enabling models...": t(
      "Turning on the models included with your subscription…"
    ),
  };
  const plainAuthText = (text: string) => PLAIN_AUTH_TEXT[text] ?? text;
  const [flow, setFlow] = useState<{
    provider: { id: ProviderAuthId; name: string };
    step: "manage" | "link" | "waiting" | "done";
    auth?: ProviderAuthFlow;
    error?: string;
  } | null>(null);
  const [authProviders, setAuthProviders] = useState<
    { provider: ProviderAuthId; name: string; connected: boolean }[]
  >([]);
  const [input, setInput] = useState("");
  const popup = useRef<Window | null>(null);
  const openedUrl = useRef<string | null>(null);
  const connected = useMemo(
    () =>
      new Set(
        authProviders
          .filter((provider) => provider.connected)
          .map((provider) => provider.provider)
      ),
    [authProviders]
  );

  const refreshStatus = async () => {
    setAuthProviders((await listProviderAuthStatus()).providers);
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  useEffect(() => {
    if (!openRequest) return;
    const provider = authProviders.find(
      (item) => item.provider === openRequest.provider
    );
    if (provider)
      setFlow({
        provider: {
          id: provider.provider,
          name: providerName(provider.provider, provider.name),
        },
        step: authConnectEntryStep(provider.connected, true),
        error: undefined,
      });
    onOpenRequestHandled?.();
  }, [openRequest, onOpenRequestHandled, authProviders]);

  useEffect(() => {
    const auth = flow?.auth;
    if (!auth || auth.status !== "running") return;
    let stopped = false;
    let timer = 0;
    const poll = async () => {
      try {
        const next = await getProviderAuthFlow(auth.flowId);
        if (stopped) return;
        setFlow((current) =>
          current
            ? {
                ...current,
                auth: next,
                step: next.status === "connected" ? "done" : "waiting",
                error: next.status === "error" ? next.error : undefined,
              }
            : current
        );
        if (next.status === "connected") {
          await refreshStatus();
          onChanged();
          return;
        }
        if (next.status === "running") {
          timer = window.setTimeout(poll, 500);
        }
      } catch (error) {
        if (!stopped) {
          setFlow((current) =>
            current
              ? {
                  ...current,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Authentication failed",
                }
              : current
          );
        }
      }
    };
    timer = window.setTimeout(poll, 250);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [flow?.auth?.flowId, flow?.auth?.status, onChanged]);

  useEffect(() => {
    const events = flow?.auth?.events ?? [];
    const target = [...events]
      .reverse()
      .find(
        (event) => event.type === "auth_url" || event.type === "device_code"
      );
    const url =
      target?.type === "auth_url"
        ? target.url
        : target?.type === "device_code"
          ? target.verificationUri
          : null;
    if (!url || openedUrl.current === url) return;
    openedUrl.current = url;
    if (popup.current && !popup.current.closed) {
      popup.current.location.href = url;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [flow?.auth?.events]);

  const start = async () => {
    if (!flow) return;
    setInput("");
    openedUrl.current = null;
    // The popup slot is reserved up front so the later window.open for the
    // provider URL is not blocker-killed. Its placeholder text is written
    // after the flow starts, because what it must say depends on the flow's
    // first step: a question answered in the app (GitHub Copilot's domain
    // prompt) or the provider page itself.
    popup.current = window.open("about:blank", "_blank");
    setFlow({ ...flow, step: "waiting", error: undefined });
    try {
      const auth = await startProviderAuth(flow.provider.id);
      if (popup.current && !popup.current.closed) {
        popup.current.document.write(
          `<!doctype html><html><body style="font-family:system-ui;padding:40px;color:#777"><p>${
            auth.prompt
              ? t(
                  "Return to the app and answer the question — this page will then open the provider sign-in."
                )
              : t("Preparing the secure sign-in flow…")
          }</p></body></html>`
        );
        popup.current.document.close();
      }
      setFlow((current) =>
        current ? { ...current, step: "waiting", auth } : current
      );
    } catch (error) {
      popup.current?.close();
      setFlow((current) =>
        current
          ? {
              ...current,
              error:
                error instanceof Error ? error.message : "Authentication failed",
            }
          : current
      );
    }
  };

  const respond = async (value: string) => {
    if (!flow?.auth?.prompt) return;
    const next = await respondToProviderAuth(
      flow.auth.flowId,
      flow.auth.prompt.id,
      value
    );
    setInput("");
    setFlow({ ...flow, auth: next });
  };

  const cancel = async () => {
    if (flow?.auth?.status === "running") {
      await cancelProviderAuth(flow.auth.flowId).catch(() => {});
    }
    popup.current?.close();
    setFlow(null);
  };

  const disconnect = async () => {
    if (!flow) return;
    await logoutProviderAuth(flow.provider.id);
    await refreshStatus();
    onChanged();
    setFlow(null);
  };

  const latestEvent = flow?.auth?.events.at(-1);
  const deviceEvent = [...(flow?.auth?.events ?? [])]
    .reverse()
    .find((event) => event.type === "device_code");
  // Every message-bearing event in order (consecutive duplicates collapsed),
  // each restated in plain wording where the raw text is jargon.
  const authTrail = [...(flow?.auth?.events ?? [])]
    .map((event) =>
      event.type === "info"
        ? event.message
        : event.type === "progress"
          ? event.message
          : event.type === "auth_url"
            ? event.instructions
            : null
    )
    .filter((line): line is string => Boolean(line))
    .map(plainAuthText)
    .filter((line, index, all) => line !== all[index - 1]);

  return (
    <div className="oauth-options">
      {!flow ? (
        <div className="auth-providers">
          {authProviders.map((p) => (
            <button
              key={p.provider}
              className="auth-provider"
              onClick={() =>
                setFlow({
                  provider: {
                    id: p.provider,
                    name: providerName(p.provider, p.name),
                  },
                  step: authConnectEntryStep(connected.has(p.provider), false),
                  error: undefined,
                })
              }
            >
              <i className={`ph ${PROVIDER_ICONS[p.provider] ?? "ph-sign-in"}`} />
              <span className="apn">{providerName(p.provider, p.name)}</span>
              {connected.has(p.provider) ? <span className="aps">{t("Connected")}</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="auth-flow">
          <div className="auth-flow-head">
            <span>
              {flow.step === "manage" ? (
                <strong>{flow.provider.name}</strong>
              ) : (
                <>
                  {t("Sign in to ")} <strong>{flow.provider.name}</strong>
                </>
              )}
            </span>
            <button className="link-btn" onClick={cancel}>
              {t("Cancel")}
            </button>
          </div>
          {flow.step === "manage" ? (
            <>
              <p className="auth-step">{t("Connected.")}</p>
              <div className="auth-linkrow">
                <button className="link-btn" onClick={disconnect}>
                  {t("Disconnect")}
                </button>
                <button className="link-btn" onClick={() => void start()}>
                  {t("Sign in again")}
                </button>
              </div>
            </>
          ) : flow.step === "link" ? (
            <>
              <p className="auth-step">
                {connected.has(flow.provider.id)
                  ? t("This account needs to sign in again.")
                  : t("Open the provider sign-in flow and approve access.")}
              </p>
              <div className="auth-linkrow">
                <button
                  className="add-btn"
                  onClick={start}
                >
                  <i className="ph ph-arrow-square-out" />
                  {t("Open in browser")}
                </button>
                {connected.has(flow.provider.id) ? (
                  <button className="link-btn" onClick={disconnect}>
                    {t("Disconnect")}
                  </button>
                ) : null}
              </div>
            </>
          ) : flow.step === "waiting" ? (
            <>
              <p className="auth-step">
                {flow.auth?.prompt
                  ? t("Answer the question here to continue:")
                  : latestEvent?.type === "progress"
                    ? plainAuthText(latestEvent.message)
                    : latestEvent?.type === "auth_url"
                      ? latestEvent.instructions ||
                        t("Finish signing in in your browser.")
                      : latestEvent?.type === "device_code"
                        ? t("Enter this code in the provider page:")
                        : t("Preparing the secure sign-in flow…")}
              </p>
              {deviceEvent?.type === "device_code" ? (
                <div className="auth-linkrow">
                  <code>{deviceEvent.userCode}</code>
                </div>
              ) : null}
              {/* Full trail of what the provider flow said so far, so no
                  Pi-issued hint is hidden by a later state. */}
              {authTrail.length > 1 ? (
                <div className="auth-trail">
                  {authTrail.map((line, index) => (
                    <p className="fine" key={index}>
                      {line}
                    </p>
                  ))}
                </div>
              ) : null}
              {flow.auth?.prompt?.type === "select" ? (
                <div className="auth-linkrow">
                  {flow.auth.prompt.options?.map((option) => (
                    <button
                      key={option.id}
                      className="add-btn"
                      onClick={() => void respond(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : flow.auth?.prompt ? (
                <div className="auth-linkrow">
                  <input
                    value={input}
                    type={
                      flow.auth.prompt.type === "secret" ? "password" : "text"
                    }
                    placeholder={flow.auth.prompt.placeholder}
                    aria-label={plainAuthText(flow.auth.prompt.message)}
                    onChange={(event) => setInput(event.target.value)}
                  />
                  <button
                    className="add-btn"
                    disabled={!input}
                    onClick={() => void respond(input)}
                  >
                    {t("Continue")}
                  </button>
                </div>
              ) : null}
              {flow.auth?.prompt ? (
                <p className="fine">{plainAuthText(flow.auth.prompt.message)}</p>
              ) : null}
              {flow.error ? <p className="fine">{flow.error}</p> : null}
            </>
          ) : (
            <>
              <p className="auth-step auth-done">
                <i className="ph ph-check-circle" /> {t("Connected to ")}
                {t(flow.provider.name)}
              </p>
              <p className="fine">
                {t("Connected. Choose one of this provider's models below.")}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function GeneralPanel() {
  const shell = useShell();
  return (
    <div className="set-panel">
      <h2>{t("General")}</h2>
      <p className="sub">{t("App behavior and appearance.")}</p>
      <LanguageCard />
      <div className="set-card">
        <div className="row2">
          <div>
            <h4>{t("Dark appearance")}</h4>
            <p>{t("Use a dark color theme for the app.")}</p>
          </div>
          <button
            className={`toggle${shell.darkMode ? " on" : ""}`}
            aria-pressed={shell.darkMode}
            onClick={() => shell.setDarkMode(!shell.darkMode)}
          />
        </div>
      </div>
      <div className="set-card">
        <div className="row2">
          <div>
            <h4>{t("Show thinking")}</h4>
            <p>{t("Show Alt's thinking above each reply. Some models think at great length.")}</p>
          </div>
          <button
            className={`toggle${shell.showThinking ? " on" : ""}`}
            aria-pressed={shell.showThinking}
            onClick={() => shell.setShowThinking(!shell.showThinking)}
          />
        </div>
      </div>
      <div className="set-card">
        <div className="row2">
          <div>
            <h4>{t("Expand thinking")}</h4>
            <p>{t("Open thinking blocks by default instead of collapsed.")}</p>
          </div>
          <button
            className={`toggle${shell.thinkingExpanded ? " on" : ""}`}
            aria-pressed={shell.thinkingExpanded}
            onClick={() => shell.setThinkingExpanded(!shell.thinkingExpanded)}
          />
        </div>
      </div>
      <RuntimeCard />
      <DefaultModeCard />
      <AutoTitleCard />
      <ModelHooksCard />
      <NativePiSkillsCard />
      <div className="set-card">
        <div className="row2">
          <div>
            <h4>{t("Study participant options")}</h4>
            <p>
              {t("Show the Participant mode settings. Only turn this on if you take part in a study; it stays hidden otherwise.")}
            </p>
          </div>
          <button
            className={`toggle${shell.participantTabEnabled ? " on" : ""}`}
            aria-pressed={shell.participantTabEnabled}
            onClick={() => shell.setParticipantTabEnabled(!shell.participantTabEnabled)}
          />
        </div>
      </div>
    </div>
  );
}

function LanguageCard() {
  const [lang, setLang] = useState<LangSettingValue>("auto");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    getLangSetting()
      .then(({ lang: value }) => {
        if (alive) setLang(value ?? "auto");
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const persist = (next: LangSettingValue) => {
    setLang(next);
    // t() is initialized once before render, so a language change takes
    // effect via a full reload — cheap for a local app, and it keeps the
    // rest of the code free of re-render plumbing.
    void saveLangSetting(next)
      .then(() => window.location.reload())
      .catch(() => {});
  };

  return (
    <div className="set-card">
      <div className="row2">
        <div>
          <h4>{t("Language")}</h4>
          <p>
            {t(
              "App language. Auto follows your system language. Conversations always follow the language you write in.",
            )}
          </p>
        </div>
        <select
          value={lang}
          disabled={!loaded}
          onChange={(e) => persist(e.target.value as LangSettingValue)}
        >
          <option value="auto">{t("Auto (system)")}</option>
          <option value="en">English</option>
          <option value="zh-Hans">简体中文</option>
          <option value="zh-Hant-HK">繁體中文（香港）</option>
        </select>
      </div>
    </div>
  );
}

function DefaultModeCard() {
  const shell = useShell();
  const [mode, setMode] = useState<"understand" | "work" | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    getDefaultAltMode()
      .then(({ mode: value }) => {
        if (alive) setMode(value);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const persist = (next: "understand" | "work") => {
    setMode(next);
    shell.setNewMode(next);
    void saveDefaultAltMode(next).catch(() => {});
  };

  return (
    <div className="set-card">
      <div className="row2">
        <div>
          <h4>{t("New conversations start in")}</h4>
          <p>
            {t("Understand talks things through without changing files; Work can act in your working folders. Each conversation can still switch its own mode.")}
          </p>
        </div>
        <select
          value={mode ?? shell.newMode}
          disabled={!loaded}
          onChange={(e) => persist(e.target.value as "understand" | "work")}
        >
          <option value="understand">{t("Understand")}</option>
          <option value="work">{t("Work")}</option>
        </select>
      </div>
    </div>
  );
}

function RuntimeCard() {
  const [mode, setMode] = useState<"alt-theory" | "native-pi">("alt-theory");
  const [scanAltSkills, setScanAltSkills] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let alive = true;
    getRuntimeSettings()
      .then((settings) => {
        if (!alive) return;
        setMode(settings.mode);
        setScanAltSkills(settings.nativePiScanAltSkills);
        setAvailable(true);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const persist = (
    nextMode: "alt-theory" | "native-pi",
    nextScanAltSkills: boolean,
  ) => {
    setMode(nextMode);
    setScanAltSkills(nextScanAltSkills);
    void saveRuntimeSettings({
      mode: nextMode,
      nativePiScanAltSkills: nextScanAltSkills,
    })
      .then(() => window.location.reload())
      .catch(() => {});
  };

  // Hosted mode 404s the local-config route (opus F1, same as ModelHooksCard).
  if (loaded && !available) return null;

  return (
    <div className="set-card">
      <div className="row2">
        <div>
          <h4>{t("Agent behavior")}</h4>
          <p>
            {t(
              "Native Pi drops Alt's roles, soul, and knowledge context and works like an ordinary coding agent. Safety and approvals are unchanged.",
            )}
          </p>
        </div>
        <select
          value={mode}
          disabled={!loaded}
          onChange={(event) =>
            persist(
              event.target.value as "alt-theory" | "native-pi",
              scanAltSkills,
            )
          }
        >
          <option value="alt-theory">Alt Theory</option>
          <option value="native-pi">Native Pi</option>
        </select>
      </div>
    </div>
  );
}

/** Only meaningful while Native Pi is the runtime, so it only appears then. */
function NativePiSkillsCard() {
  const [mode, setMode] = useState<"alt-theory" | "native-pi">("alt-theory");
  const [scanAltSkills, setScanAltSkills] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    getRuntimeSettings()
      .then((settings) => {
        if (!alive) return;
        setMode(settings.mode);
        setScanAltSkills(settings.nativePiScanAltSkills);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!loaded || mode !== "native-pi") return null;

  return (
    <div className="set-card">
      <div className="row2">
        <div>
          <h4>{t("Native Pi: scan Alt Theory bundled skills")}</h4>
          <p>
            {t(
              "Keep Alt Theory's bundled skills discoverable in Native Pi. This does not add Alt Theory behavior.",
            )}
          </p>
        </div>
        <button
          className={`toggle${scanAltSkills ? " on" : ""}`}
          aria-pressed={scanAltSkills}
          onClick={() => {
            const next = !scanAltSkills;
            setScanAltSkills(next);
            void saveRuntimeSettings({ mode, nativePiScanAltSkills: next })
              .then(() => window.location.reload())
              .catch(() => {});
          }}
        />
      </div>
    </div>
  );
}

function ModelHooksCard() {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchJson<{ enabled: boolean }>("/api/settings/model-hooks")
      .then((r) => {
        if (!alive) return;
        setEnabled(r.enabled);
        setAvailable(true);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  const persist = (next: boolean) => {
    setEnabled(next);
    void fetchJson("/api/settings/model-hooks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    }).catch(() => {});
  };
  // Hosted mode 404s the local-config route; showing a toggle that cannot
  // save would lie (opus F1).
  if (loaded && !available) return null;
  return (
    <div className="set-card">
      <div className="row2">
        <div>
          <h4>{t("Model-specific reminders")}</h4>
          <p>
            {t("Some models get a short reminder tuned to their habits (currently GPT-5 and DeepSeek v4 Flash). Applies to conversations opened after the change.")}
          </p>
        </div>
        <button
          className={`toggle${enabled ? " on" : ""}`}
          aria-pressed={enabled}
          disabled={!loaded}
          onClick={() => persist(!enabled)}
        />
      </div>
    </div>
  );
}

function AutoTitleCard() {
  const [enabled, setEnabled] = useState(true);
  const [model, setModel] = useState<{ provider: string; modelId: string } | null>(
    null
  );
  const [models, setModels] = useState<
    { provider: string; modelId: string; label: string }[]
  >([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [s, p] = await Promise.all([
          getAutoTitleSettings(),
          listConfigProviders(),
        ]);
        if (!alive) return;
        setEnabled(s.enabled);
        setModel(s.model);
        setModels(
          p.providers.flatMap((prov) =>
            prov.models.map((m) => ({
              provider: prov.name,
              modelId: m.id,
              label: `${m.name || m.id} · ${prov.name}`,
            }))
          )
        );
      } catch {
        // leave defaults; the picker just shows "Same as conversation"
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const persist = (next: AutoTitleSettings) => {
    setEnabled(next.enabled);
    setModel(next.model);
    void saveAutoTitleSettings(next).catch(() => {});
  };

  const modelKey = model ? `${model.provider}::${model.modelId}` : "";

  return (
    <div className="set-card">
      <div className="row2">
        <div>
          <h4>{t("Auto-name conversations")}</h4>
          <p>
            {t("Name a conversation automatically after the first message, using its own model. Falls back to the first few words if naming fails.")}
          </p>
        </div>
        <button
          className={`toggle${enabled ? " on" : ""}`}
          aria-pressed={enabled}
          disabled={!loaded}
          onClick={() => persist({ enabled: !enabled, model })}
        />
      </div>
      {enabled ? (
        <div className="row2" style={{ marginTop: 10 }}>
          <div>
            <h4>{t("Naming model")}</h4>
            <p>{t("A small model is recommended — cheaper and faster.")}</p>
          </div>
          <select
            value={modelKey}
            disabled={!loaded}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return persist({ enabled, model: null });
              const idx = v.indexOf("::");
              persist({
                enabled,
                model: { provider: v.slice(0, idx), modelId: v.slice(idx + 2) },
              });
            }}
          >
            <option value="">{t("Same as conversation")}</option>
            {models.map((m) => (
              <option
                key={`${m.provider}::${m.modelId}`}
                value={`${m.provider}::${m.modelId}`}
              >
                {m.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

function SkillsPanel() {
  return (
    <div className="set-panel">
      <h2>{t("Skills")}</h2>
      <p className="sub">
        {t("Skills are instruction files that carry a way of working. Alt Theory ships its own; you can add your own from the toolbox.")}
      </p>
      <SkillPrecedenceCard />
    </div>
  );
}

function SkillPrecedenceCard() {
  const [value, setValue] = useState<SkillPrecedence>("prefer-bundled");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void getSkillPrecedence()
      .then((r) => {
        if (alive) setValue(r.precedence);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="set-card">
      <div className="row2">
        <div>
          <h4>{t("When two skills overlap")}</h4>
          <p>
            {t("Which one wins when a bundled skill and one of yours fit the same job.")}
          </p>
        </div>
        <select
          value={value}
          disabled={!loaded}
          onChange={(e) => {
            const next = e.target.value as SkillPrecedence;
            setValue(next);
            void saveSkillPrecedence(next).catch(() => {});
          }}
        >
          <option value="prefer-bundled">{t("Prefer Alt Theory's")}</option>
          <option value="prefer-user">{t("Prefer the ones I installed")}</option>
          <option value="ask">{t("Ask me each time")}</option>
        </select>
      </div>
    </div>
  );
}

function RoleKbPanel() {
  const app = useApp();
  const [dirs, setDirs] = useState<AssetDirs | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    getAssetDirs()
      .then((value) => {
        if (alive) setDirs(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const roles = app.discovery?.rolePresets ?? [];
  const kbDomains = (app.discovery?.kbDomains ?? []).filter(
    (d) => d.slug !== "off" && d.slug !== "all",
  );

  const addRoleFile = () => {
    void pickFiles("Full path of the role file (.md) to add:").then(
      async (paths) => {
        for (const path of paths) {
          try {
            const result = await uploadRolePreset(path);
            setNotice(t("Added role \"{name}\".", { name: result.slug }));
          } catch (err) {
            setNotice(err instanceof Error ? err.message : t("Could not add role"));
          }
        }
        if (paths.length) void app.refreshDiscovery();
      },
    );
  };

  const addKbDir = () => {
    void pickDirectory("Full path of the knowledge folder to add:").then(
      async (path) => {
        if (!path || !dirs) return;
        try {
          const saved = await saveAssetDirs({
            kbDirs: [...dirs.extraKbDirs, path],
          });
          setDirs({ ...dirs, extraKbDirs: saved.extraKbDirs });
          setNotice(
            saved.extraKbDirs.includes(path) ||
              saved.extraKbDirs.some((d) => path.startsWith(d))
              ? t("Knowledge folder added.")
              : t("That folder could not be added (does it exist?).")
          );
          void app.refreshDiscovery();
        } catch (err) {
          setNotice(err instanceof Error ? err.message : t("Could not add folder"));
        }
      },
    );
  };

  const removeKbDir = (dir: string) => {
    if (!dirs) return;
    void saveAssetDirs({
      kbDirs: dirs.extraKbDirs.filter((d) => d !== dir),
    }).then((saved) => {
      setDirs({ ...dirs, extraKbDirs: saved.extraKbDirs });
      void app.refreshDiscovery();
    });
  };

  return (
    <div className="set-panel">
      <h2>{t("Role & Knowledge")}</h2>
      <p className="sub">
        {t("What Alt speaks as, and what it draws on. New conversations start with no role and the bundled knowledge set until you pick otherwise above the composer. Adding here never changes the bundled files.")}
      </p>
      {notice ? <p className="sub">{notice}</p> : null}
      <div className="set-card">
        <div className="row2">
          <div>
            <h4>{t("Roles")}</h4>
            <p>
              {t("A role is a Markdown file describing who Alt should be for a conversation. Files you add are stored in your own folder and appear in the role picker.")}
            </p>
            <ul className="asset-list">
              {roles.map((role) => (
                <li key={role.slug}>
                  {role.displayName}
                  {role.source === "added" ? <em> {t("· added by you")}</em> : null}
                </li>
              ))}
              {roles.length === 0 ? <li>{t("No roles found.")}</li> : null}
            </ul>
          </div>
          <button className="flat" onClick={addRoleFile}>
            <i className="ph ph-plus" aria-hidden="true" /> {t("Add role file")}
          </button>
        </div>
      </div>
      <div className="set-card">
        <div className="row2">
          <div>
            <h4>{t("Knowledge sets")}</h4>
            <p>
              {t("Each knowledge set is a folder of material Alt can ground its answers in. Add a folder of your own to make it selectable; the bundled sets stay untouched.")}
            </p>
            <ul className="asset-list">
              {kbDomains.map((domain) => (
                <li key={domain.slug}>
                  {domain.displayName}
                  {domain.source === "added" ? <em> {t("· added by you")}</em> : null}
                </li>
              ))}
            </ul>
            {dirs && dirs.extraKbDirs.length > 0 ? (
              <ul className="asset-list">
                {dirs.extraKbDirs.map((dir) => (
                  <li key={dir}>
                    <code>{dir}</code>{" "}
                    <button
                      className="flat"
                      data-tip={t("Stop scanning this folder (the folder itself is not deleted)")}
                      onClick={() => removeKbDir(dir)}
                    >
                      {t("Remove")}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button className="flat" onClick={addKbDir}>
            <i className="ph ph-plus" aria-hidden="true" /> {t("Add knowledge folder")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ParticipantPanel({
  designated,
  label,
  local,
}: {
  designated: boolean;
  label: string | null;
  local: boolean;
}) {
  return (
    <div className="set-panel">
      <h2>{t("Participant mode")}</h2>
      <p className="sub">
        {t("Only relevant if you take part in a study. If you are not in a study, you can leave this hidden.")}
      </p>

      {designated ? (
        <>
          <div className="set-card">
            <div className="row2">
              <div>
                <h4>{t("Display label")}</h4>
                <p>
                  {t("The name or code that identifies your data in the study. Set by your study when the app was installed.")}
                </p>
              </div>
              <span className="participant-label">{label || t("Not set")}</span>
            </div>
          </div>
          <div className="set-card">
            <h4>{t("Sharing conversations with the research team")}</h4>
            <p>
              {local
                ? t("This install is designated as a study participant, so new conversations are marked as exportable by default. You can mark any single conversation with the control next to the composer.")
                : t("This install is designated as a study participant, so new conversations are shared with the research team by default. You can make any single conversation private with the Shared/Private control next to the composer.")}
            </p>
            <div className="fine">
              {local
                ? t("On this local install the label only MARKS a conversation: nothing is hidden, uploaded, or deleted. You send an export to the research team yourself later.")
                : t("On the hosted (account) version, shared conversations reach the research team automatically, and a private conversation is deleted 7 days after you last use it.")}{" "}
              {t("Installs obtained outside a study never share anything.")}
            </div>
          </div>
        </>
      ) : (
        <div className="set-card">
          <h4>{t("This install is not part of a study")}</h4>
          <p>
            {t("You got Alt outside a study, so there is nothing to share and no label to set. Conversations stay on this machine.")}
          </p>
          <div className="fine">
            {t("If you later join a study, they will provide an install that turns these options on.")}
          </div>
        </div>
      )}
    </div>
  );
}

function AboutPanel() {
  const [dataDir, setDataDir] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getDataFolder()
      .then((r) => alive && setDataDir(r.dataDir))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="set-panel">
      <h2>{t("About")}</h2>
      <p className="sub">Alt Theory v{__ALT_THEORY_VERSION__}.</p>
      {dataDir ? (
        <div className="set-card">
          <div className="row2">
            <div>
              <h4>{t("Your data folder")}</h4>
              <p>{t("Conversations and settings are stored on this machine at {dataDir}.", { dataDir })}</p>
            </div>
            <button
              className="add-btn"
              onClick={() => {
                if (hasNativeBridge()) void revealPath(dataDir);
                else void navigator.clipboard?.writeText(dataDir);
              }}
            >
              <i className={`ph ${hasNativeBridge() ? "ph-folder-open" : "ph-copy"}`} />
              {hasNativeBridge() ? t("Show in file manager") : t("Copy path")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FeaturesPanel() {
  const app = useApp();
  const shell = useShell();
  return (
    <div className="set-panel">
      <h2>{t("Help center")}</h2>
      <p className="sub">
        {t("A practical guide to conversations, modes, context, and getting unstuck.")}
      </p>
      <button
        className="add-btn help-ask"
        onClick={() => {
          shell.openApp();
          app.openHelper(undefined, false);
        }}
      >
        <i className="ph ph-chats-circle" />
        {t("Ask Helper")}
      </button>
      <div className="set-card">
        <h4>{t("Think through research questions with you")}</h4>
        <p>
          {t("In ")} <strong>{t("Understand")}</strong>, {t("Alt works only with what you bring into the conversation. It separates what it found from what it inferred, marks uncertainty instead of papering over it, and moves in steps you can steer — built for research design, framing, and interpretation, where being agreeably wrong is worse than being slower.")}
        </p>
      </div>
      <div className="set-card">
        <h4>{t("Do concrete work on your materials")}</h4>
        <p>
          {t("In ")} <strong>{t("Work")}</strong>, {t("the same conversation can read and produce documents, work through the files in your working folders, and search the web and literature. Actions that cross a boundary ask for your approval first. Switching modes never moves or changes your folders.")}
        </p>
      </div>
      <div className="set-card">
        <h4>{t("Compare different lines of inquiry")}</h4>
        <p>
          {t("AI answers can change—or conflict—when a question is framed differently. At important moments, edit your question or retry it to open a comparison, then continue from the answer that offers the stronger direction.")}
        </p>
      </div>
      <div className="set-card">
        <h4>{t("Delegate parts of a task")}</h4>
        <p>
          {t("On larger Work tasks, Alt can hand a bounded piece to a subagent and keep going. Subagents appear in the right panel like any related conversation — you can watch them, message them directly, or stop them at any point.")}
        </p>
      </div>
      <div className="set-card">
        <h4>{t("Use roles, knowledge sets, and skills")}</h4>
        <p>
          {t("Roles shape how Alt interprets a situation, identifies what matters, and organizes its response; knowledge sets provide material it can draw on; skills provide reusable ways of working.")}
        </p>
      </div>
      <div className="set-card">
        <h4>{t("Keep side paths without losing the main conversation")}</h4>
        <p>
          {t("Branch starts another direction from the current conversation. BTW opens a smaller related conversation. Helper is always a fresh conversation for questions about Alt or setup; it appears in your conversation list like any other conversation.")}
        </p>
      </div>
      <div className="set-card">
        <h4>{t("Choose what each conversation can use")}</h4>
        <p>
          {t("The controls above the composer choose role, knowledge, mode, model, and working folder for that conversation. The toolbox keeps file attachment, planning, folder browsing, and the full skill list close without putting every option on screen.")}
        </p>
      </div>
      <div className="set-card help-tip-catalog">
        <h4>{t("Tips shown while Alt works")}</h4>
        <ul>
          {GENERAL_TIPS.map((tip) => (
            <li key={tip.id}>{productTipText(tip)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Working folders (v1.5 part 2, prototype D): Projects — a main working
 * folder plus the second folders that belong with it — and the global list
 * of folders Alt may read in every conversation, with one Edit tick per row.
 * No mechanism words on the page; the root policy behind it is
 * core/root-policy.ts (global-list / project-secondary).
 */
function WorkingFoldersPanel() {
  const app = useApp();
  const [folders, setFolders] = useState<WorkingFoldersSettings | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getWorkingFolders()
      .then((value) => {
        if (alive) setFolders(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const mainFolders = useMemo(() => {
    const dirs = new Set(app.knownWorkspaces);
    for (const session of app.sessions) {
      if (session.workspacePrimaryDir) dirs.add(session.workspacePrimaryDir);
    }
    return [...dirs].sort((a, b) => folderLabel(a).localeCompare(folderLabel(b)));
  }, [app.knownWorkspaces, app.sessions]);

  const save = (next: { global?: WorkingFoldersSettings["global"]; projects?: WorkingFoldersSettings["projects"] }) =>
    saveWorkingFolders(next)
      .then((saved) => {
        setFolders(saved);
        setNotice(null);
      })
      .catch((err) => setNotice(err instanceof Error ? err.message : t("Could not save.")));

  const secondaryOf = (primaryDir: string) =>
    folders?.projects.find((project) => project.primaryDir === primaryDir)?.secondaryDirs ?? [];
  const setSecondary = (primaryDir: string, secondaryDirs: string[]) => {
    if (!folders) return;
    const others = folders.projects.filter((project) => project.primaryDir !== primaryDir);
    void save({ projects: secondaryDirs.length ? [...others, { primaryDir, secondaryDirs }] : others });
  };

  const newProject = () => {
    void pickDirectory(t("Full path of the working folder to add:")).then((path) => {
      if (path) void app.addKnownWorkspace(path).catch((err) => setNotice(err instanceof Error ? err.message : t("Could not add folder")));
    });
  };
  const addSecondary = (primaryDir: string) => {
    void pickDirectory(t("Full path of the folder to add to this project:")).then((path) => {
      if (path && !secondaryOf(primaryDir).includes(path)) setSecondary(primaryDir, [...secondaryOf(primaryDir), path]);
    });
  };
  const addGlobal = () => {
    void pickDirectory(t("Full path of the folder to add:")).then((path) => {
      if (!path || !folders || folders.global.some((folder) => folder.path === path)) return;
      void save({ global: [...folders.global, { path, writable: false }] });
    });
  };
  const setWritable = (path: string, writable: boolean) => {
    if (!folders) return;
    void save({ global: folders.global.map((folder) => (folder.path === path ? { ...folder, writable } : folder)) });
  };
  const removeGlobal = (path: string) => {
    if (!folders) return;
    void save({ global: folders.global.filter((folder) => folder.path !== path) });
  };
  const removeTip = t("Remove from the list (the folder itself is not deleted)");

  return (
    <div className="set-panel">
      <h2>{t("Working folders")}</h2>
      <p className="sub">{t("Which folders Alt can open, and which ones it may change.")}</p>
      {notice ? <p className="sub">{notice}</p> : null}

      <div className="set-card">
        <div className="row2">
          <div>
            <h4>{t("Projects")}</h4>
            <p className="lead">{t("Where conversations work.")}</p>
            <p>{t("One main folder plus any others that belong with it. A conversation started here sees all of them.")}</p>
          </div>
          <button className="flat" onClick={newProject}>
            <i className="ph ph-plus" aria-hidden="true" /> {t("New project")}
          </button>
        </div>
        {mainFolders.length === 0 ? (
          <p className="fine">{t("No working folders yet.")}</p>
        ) : (
          mainFolders.map((primaryDir) => (
            <div className="proj" key={primaryDir}>
              <div className="proj-head">
                <i className="ph ph-folder-open" aria-hidden="true" />
                <span className="pname">{folderLabel(primaryDir)}</span>
                <span className="sp" />
                <button className="flat" onClick={() => addSecondary(primaryDir)}>
                  <i className="ph ph-plus" aria-hidden="true" /> {t("Add a folder")}
                </button>
              </div>
              <div className="sf">
                <i className="ph ph-folder" aria-hidden="true" />
                <span className="lbl">{primaryDir}</span>
                <span className="role">{t("Main folder")}</span>
              </div>
              {secondaryOf(primaryDir).map((dir) => (
                <div className="sf" key={dir}>
                  <i className="ph ph-folder" aria-hidden="true" />
                  <span className="lbl">{dir}</span>
                  <button
                    className="icon-x"
                    data-tip={removeTip}
                    aria-label={removeTip}
                    onClick={() => setSecondary(primaryDir, secondaryOf(primaryDir).filter((item) => item !== dir))}
                  >
                    <i className="ph ph-x" aria-hidden="true" />
                  </button>
                </div>
              ))}
              {secondaryOf(primaryDir).length === 0 ? (
                <div className="sf"><span className="lbl quiet">{t("No other folders yet.")}</span></div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="set-card">
        <div className="row2">
          <div>
            <h4>{t("Global folders")}</h4>
            <p className="lead">{t("Folders Alt may read from any conversation.")}</p>
            <p>{t("Readable in every conversation. Tick to let Alt save changes there too.")}</p>
          </div>
          <button className="flat" onClick={addGlobal} disabled={!folders}>
            <i className="ph ph-plus" aria-hidden="true" /> {t("Add a folder")}
          </button>
        </div>
        <div className="folder-eye">
          <i className="ph ph-eye" aria-hidden="true" /> {t("All folders here are readable")}
        </div>
        {folders?.global.map((folder) => (
          <div className="folder-row" key={folder.path}>
            <i className="ph ph-folder" aria-hidden="true" />
            <div className="grow">
              <div className="nm">{folderLabel(folder.path)}</div>
              <div className="path">{folder.path}</div>
            </div>
            <label className={`folder-tick${folder.writable ? " on" : ""}`}>
              <input
                type="checkbox"
                checked={folder.writable}
                onChange={(event) => setWritable(folder.path, event.target.checked)}
              />
              {t("Edit // writable")}
            </label>
            <button className="icon-x" data-tip={removeTip} aria-label={removeTip} onClick={() => removeGlobal(folder.path)}>
              <i className="ph ph-x" aria-hidden="true" />
            </button>
          </div>
        ))}
        {folders && folders.global.length === 0 ? <p className="fine">{t("No folders on the list yet.")}</p> : null}
        <p className="fine">{t("Readable in Understand and Work; saving only in Work.")}</p>
        <p className="fine">{t("Knowledge folders are readable too; you manage those on the Knowledge page.")}</p>
      </div>
    </div>
  );
}
