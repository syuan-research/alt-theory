import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchPermanentDeletionFiles } from "@/api/conversation-files";
import {
  cancelProviderAuth,
  getAutoTitleSettings,
  getReviewerRecommendations,
  getCommandAllowlist,
  getDefaultPermission,
  saveCommandAllowlist,
  saveDefaultPermission,
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
  type ReviewerRecommendations,
  type SkillPrecedence,
  type SubagentConfig,
  type SubagentPreset,
  getWorkingFolders,
  saveWorkingFolders,
  type ProjectFolder,
  type WorkingFoldersSettings,
} from "@/api/config";
import type {
  Permission,
  ProviderAuthFlow,
  ProviderAuthId,
  SessionSummary,
} from "@/api/types";
import { PERMISSIONS, PERMISSION_LABEL, fullAccessConsequences } from "@/lib/permission";
import { setApprovalReviewer, setShowAllApprovalModes, useApprovalReviewer } from "@/lib/approvalReviewer";
import { ModelConfigPage } from "@/pages/ModelConfigPage";
import { authConnectEntryStep } from "@/lib/authConnect";
import { MenuSelect } from "@/components/ui/MenuSelect";
import {
  applyTitlebarVar,
  checkForUpdates,
  getUpdateStatus,
  getViewSize,
  hasNativeBridge,
  openExternal,
  pickDirectory,
  pickFiles,
  revealPath,
  setViewSize,
  type AppUpdateStatus,
  ZOOM_STOPS,
} from "@/lib/native";
import { useMainView } from "@/context/MainView";
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
import { NEW_DRAFT, updateDraft } from "@/lib/draft";
import { GENERAL_TIPS, productTipText } from "@/config/productTips";

// Panel keys for the validity fallback below. The nav rows themselves render
// in the shared left rail (SettingsRail in LeftNav.tsx) since the hoist.
const PANEL_KEYS = [
  "general",
  "models",
  "agents",
  "folders",
  "rolekb",
  "skills",
  "features",
  "trash",
  "about",
];

export function SettingsView() {
  const shell = useShell();

  // Retired or unknown panels return to General.
  useEffect(() => {
    if (!PANEL_KEYS.includes(shell.settingsPanel)) {
      shell.setSettingsPanel("general");
    }
  }, [shell.settingsPanel, shell.setSettingsPanel]);

  return (
    <div className="settings">
      <div className="set-body">
        <div className="set-scroll">
          {shell.settingsPanel === "models" ? <ModelsPanel /> : null}
          {shell.settingsPanel === "agents" ? <AgentsPanel /> : null}
          {shell.settingsPanel === "general" ? <GeneralPanel /> : null}
          {shell.settingsPanel === "folders" ? <WorkingFoldersPanel /> : null}
          {shell.settingsPanel === "rolekb" ? <RoleKbPanel /> : null}
          {shell.settingsPanel === "skills" ? <SkillsPanel /> : null}
          {shell.settingsPanel === "features" ? <FeaturesPanel /> : null}
          {shell.settingsPanel === "trash" ? <TrashPanel /> : null}
          {shell.settingsPanel === "about" ? <AboutPanel /> : null}
        </div>
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

  // Permanent delete asks about the conversation's own files every time
  // there are any (owner 2026-09-26); unticked keeps them in Conversation
  // files. Without files it is the plain confirmation.
  const filesQuestion = async (ids: string[]) => {
    // A failed listing stops the delete: the box must never cover files the
    // dialog did not show.
    const lists = await Promise.all(ids.map((id) => fetchPermanentDeletionFiles(id)));
    const files = lists.flat();
    if (!files.length) return null;
    const names = files.map((file) => file.path.replace(/^uploads\//, ""));
    return {
      details: [
        ...names.slice(0, 5),
        ...(names.length > 5 ? [t("…and {count} more", { count: names.length - 5 })] : []),
        t("Unless you tick the box, the files are kept and stay in Conversation files."),
      ],
      label: ids.length === 1
        ? t("Also delete its files ({count})", { count: files.length })
        : t("Also delete their files ({count})", { count: files.length }),
    };
  };

  const remove = async (sessionId: string) => {
    const question = await filesQuestion([sessionId]).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason));
      return undefined;
    });
    if (question === undefined) return;
    app.requestConfirm({
      message: t("Permanently delete this conversation?"),
      details: [t("This cannot be undone."), ...(question?.details ?? [])],
      ...(question ? { checkbox: { label: question.label, danger: true } } : {}),
      confirmLabel: t("Delete permanently"),
      cancelLabel: t("Cancel"),
      onConfirm: (result) => {
        void permanentlyDeleteSession(sessionId, result?.checkboxChecked ? "delete" : "keep")
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

  const actOnSelected = async (action: "restore" | "delete", files: "keep" | "delete" = "keep") => {
    const ids = [...selected];
    if (!ids.length || mutating) return;
    setMutating(true);
    setError("");
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          action === "restore" ? restoreSession(id) : permanentlyDeleteSession(id, files),
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

  const confirmDeleteSelected = async () => {
    if (!selected.size) return;
    const question = await filesQuestion([...selected]).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason));
      return undefined;
    });
    if (question === undefined) return;
    app.requestConfirm({
      message: t("Permanently delete {count} selected conversations?", {
        count: selected.size,
      }),
      details: [t("This cannot be undone."), ...(question?.details ?? [])],
      ...(question ? { checkbox: { label: question.label, danger: true } } : {}),
      confirmLabel: t("Delete selected permanently"),
      cancelLabel: t("Cancel"),
      onConfirm: (result) => void actOnSelected("delete", result?.checkboxChecked ? "delete" : "keep"),
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
            onClick={() => void confirmDeleteSelected()}
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
                  <button className="danger" onClick={() => void remove(session.sessionId)}>
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
    </div>
  );
}

const BUILTIN_AGENT_IDS = new Set([
  "general-low",
  "general-medium",
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
      <MenuSelect
        ariaLabel={t("Model")}
        value={model}
        options={options}
        onChange={(value) => onChange(joinAgentModelRef(value, thinking))}
      />
      <MenuSelect
        ariaLabel={t("Thinking")}
        value={thinking}
        options={AGENT_THINKING_LEVELS.map((level) => ({
          value: level,
          label: level ? t(level) : t("Model default"),
        }))}
        onChange={(value) => onChange(joinAgentModelRef(model, value))}
      />
      {/* Always rendered so every row's third grid track is the same width:
          the main model row has nothing to remove, the fallbacks do. */}
      <button
        className="agent-icon-btn"
        aria-label={t("Remove fallback")}
        aria-hidden={onRemove ? undefined : true}
        disabled={!onRemove}
        onClick={onRemove}
      >
        <i className="ph ph-trash" />
      </button>
    </div>
  );
}

/**
 * The effective chain is [model, ...fallbackModels]; ordering operates on the
 * whole chain even though the config persists the head as `model`. Promoting
 * the first fallback swaps it with the current model.
 */
function promoteFirstFallback<T extends { model: string; fallbackModels: string[] }>(item: T): T {
  const [first, ...rest] = item.fallbackModels;
  if (!first) return item;
  return { ...item, model: first, fallbackModels: [item.model, ...rest] };
}

/**
 * A model and its ordered fallbacks, each with a thinking level: the
 * subagent presets' control, shared with smart approval's reviewer and the
 * auto-naming model (smart-approval ruling I).
 */
function ModelChainFields({
  chain,
  models,
  onChange,
  actions,
}: {
  chain: { model: string; fallbackModels: string[] };
  models: Array<{ value: string; label: string }>;
  onChange: (next: { model: string; fallbackModels: string[] }) => void;
  actions?: ReactNode;
}) {
  const set = (update: (item: { model: string; fallbackModels: string[] }) => { model: string; fallbackModels: string[] }) =>
    onChange(update({ model: chain.model, fallbackModels: chain.fallbackModels }));
  return (
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
              disabled={chain.fallbackModels.length === 0}
              onClick={() => set(promoteFirstFallback)}
            >
              <i className="ph ph-arrow-down" />
            </button>
          </span>
        </div>
        <AgentModelFields
          reference={chain.model}
          models={models}
          onChange={(model) => set((item) => ({ ...item, model }))}
        />
      </div>
      {chain.fallbackModels.map((fallback, fallbackIndex) => (
        <div className="agent-fallback" key={`${fallbackIndex}-${fallback}`}>
          <div className="agent-fallback-heading">
            <span>{t("Fallback {number}", { number: fallbackIndex + 1 })}</span>
            <span>
              <button
                className="agent-icon-btn"
                aria-label={t("Move fallback up")}
                onClick={() => set((item) => {
                  if (fallbackIndex === 0) return promoteFirstFallback(item);
                  const next = [...item.fallbackModels];
                  [next[fallbackIndex - 1], next[fallbackIndex]] = [next[fallbackIndex], next[fallbackIndex - 1]];
                  return { ...item, fallbackModels: next };
                })}
              ><i className="ph ph-arrow-up" /></button>
              <button
                className="agent-icon-btn"
                aria-label={t("Move fallback down")}
                disabled={fallbackIndex === chain.fallbackModels.length - 1}
                onClick={() => set((item) => {
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
            onChange={(value) => set((item) => ({
              ...item,
              fallbackModels: item.fallbackModels.map((entry, i) => i === fallbackIndex ? value : entry),
            }))}
            onRemove={() => set((item) => ({
              ...item,
              fallbackModels: item.fallbackModels.filter((_, i) => i !== fallbackIndex),
            }))}
          />
        </div>
      ))}
      <div className="agent-row-actions">
        <button className="link-btn" onClick={() => set((item) => ({
          ...item,
          fallbackModels: [...item.fallbackModels, "inherit"],
        }))}>{t("Add fallback")}</button>
        {actions}
      </div>
    </div>
  );
}

function AgentsPanel() {
  const [config, setConfig] = useState<SubagentConfig | null>(null);
  const [models, setModels] = useState<Array<{ value: string; label: string }>>([
    { value: "inherit", label: t("Inherit current model") },
  ]);
  const [path, setPath] = useState("");
  const [status, setStatus] = useState("");
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
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
  }, []);

  if (!config) {
    return <div className="set-panel agents-panel"><p className="sub">{status || t("Loading…")}</p></div>;
  }

  // Fire-and-forget auto-save on every edit, debounced: the text inputs would
  // otherwise PUT per keystroke, and out-of-order responses could let stale
  // content win. No echo application — like the other settings cards, the
  // input shows what was typed and server normalization lands on remount.
  const edit = (next: SubagentConfig) => {
    setConfig(next);
    setStatus("");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveSubagentSettings(next).catch((error) =>
        setStatus(error instanceof Error ? error.message : String(error)),
      );
    }, 500);
  };
  const updateAgent = (index: number, update: (agent: SubagentPreset) => SubagentPreset) => {
    edit({
      ...config,
      agents: config.agents.map((agent, i) => i === index ? update(agent) : agent),
    });
  };
  const addCustom = () => {
    let number = 1;
    while (config.agents.some((agent) => agent.id === `custom-${number}`)) number += 1;
    edit({
      ...config,
      agents: [...config.agents, {
        id: `custom-${number}`,
        description: "",
        model: "inherit:medium",
        fallbackModels: [],
      }],
    });
  };
  const builtInIndexes = [...BUILTIN_AGENT_IDS]
    .map((id) => config.agents.findIndex((agent) => agent.id === id))
    .filter((index) => index >= 0);
  const displayAgents = [
    ...builtInIndexes.map((index) => config.agents[index]),
    ...config.agents.filter((agent) => !BUILTIN_AGENT_IDS.has(agent.id)),
  ];
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
              edit({
                ...config,
                defaultAgent: config.defaultAgent === agent.id ? id : config.defaultAgent,
                agents: config.agents.map((item, i) => i === index ? { ...item, id } : item),
              });
            }}
          />
        )}
        {builtIn ? <p>{t(agent.description ?? "")}</p> : (
          <input
            className="agent-description-input"
            aria-label={t("Description")}
            placeholder={t("When should this subagent be used?")}
            value={agent.description ?? ""}
            onChange={(event) => updateAgent(index, (item) => ({ ...item, description: event.target.value }))}
          />
        )}
      </div>
      <ModelChainFields
        chain={agent}
        models={models}
        onChange={(chain) => updateAgent(index, (item) => ({ ...item, ...chain }))}
        actions={!builtIn ? (
          <button className="link-btn danger" onClick={() => edit({
            ...config,
            agents: config.agents.filter((_, i) => i !== index),
            defaultAgent: config.defaultAgent === agent.id ? "general-medium" : config.defaultAgent,
          })}>{t("Delete")}</button>
        ) : null}
      />
    </div>
  );

  return (
    <div className="set-panel agents-panel">
      <div className="agents-heading">
        <div><h2>{t("Subagents")}</h2><p className="sub">{t("The lead agent delegates by the descriptions below. Choose models accordingly.")}</p></div>
      </div>
      <div className="set-card agent-default-card">
        <div className="row2">
          <div>
            <h4>{t("Default subagent")}</h4>
          </div>
          <MenuSelect
            ariaLabel={t("Default subagent")}
            value={config.defaultAgent}
            options={displayAgents.map((agent) => ({ value: agent.id, label: agent.id }))}
            onChange={(value) => edit({ ...config, defaultAgent: value })}
          />
        </div>
      </div>
      <section className="agent-section">
        <div className="set-card">
          <h4>{t("Built-in subagents")}</h4>
          <div className="agent-preset-list">{builtInIndexes.map((index) => renderAgent(config.agents[index], index, true))}</div>
        </div>
      </section>
      <section className="agent-section">
        <div className="set-card">
          <div className="agent-section-heading">
            <h4>{t("Custom subagents")}</h4>
            <button className="add-btn" onClick={addCustom}><i className="ph ph-plus" />{t("New")}</button>
          </div>
          <div className="agent-preset-list">{config.agents.map((agent, index) => !BUILTIN_AGENT_IDS.has(agent.id) ? renderAgent(agent, index, false) : null)}</div>
          {path ? <p className="agent-config-path">{path}</p> : null}
        </div>
      </section>
      {status ? <p className="agent-status">{status}</p> : null}
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
    "kimi-coding": "ph-moon",
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
                <i className="ph ph-check" /> {t("Connected to ")}
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

function ViewSizeCard() {
  const [stop, setStop] = useState(2);

  useEffect(() => {
    let alive = true;
    getViewSize()
      .then((value) => {
        if (alive) setStop(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Drag updates the thumb only; the zoom commits on release. Applying per
  // pixel rescales the whole window — including this track — so a held cursor
  // lands on a different stop and the value oscillates (20260907 trial).
  const commit = () => {
    applyTitlebarVar(stop);
    void setViewSize(stop);
  };

  return (
    <div className="set-card">
      <div className="row2">
        <div>
          <h4>{t("View size")}</h4>
        </div>
        <div className="zval">
          {stop !== 2 ? (
            <button
              className="ghostbtn"
              onClick={() => {
                setStop(2);
                applyTitlebarVar(2);
                void setViewSize(2);
              }}
            >
              {t("Reset to default")}
            </button>
          ) : null}
          <b>{ZOOM_STOPS[stop]}%</b>
        </div>
      </div>
      <div className="zrow">
        <input
          type="range"
          min={0}
          max={ZOOM_STOPS.length - 1}
          step={1}
          value={stop}
          onChange={(e) => setStop(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          aria-label={t("View size")}
        />
        <div className="zticks">
          {ZOOM_STOPS.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </div>
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
          </div>
          <button
            className={`toggle${shell.darkMode ? " on" : ""}`}
            aria-pressed={shell.darkMode}
            onClick={() => shell.setDarkMode(!shell.darkMode)}
          />
        </div>
      </div>
      {hasNativeBridge() ? <ViewSizeCard /> : null}
      <div className="set-card">
        <div className="row2">
          <div>
            <h4>{t("Expand thinking")}</h4>
          </div>
          <button
            className={`toggle${shell.thinkingExpanded ? " on" : ""}`}
            aria-pressed={shell.thinkingExpanded}
            onClick={() => shell.setThinkingExpanded(!shell.thinkingExpanded)}
          />
        </div>
      </div>
      <DefaultPermissionCard />
      <ApprovalReviewerCard />
      <CommandAllowlistCard />
      <AutoTitleCard />
      <NativePiSkillsCard />
      <RuntimeCard />
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
              "Auto follows your system language.",
            )}
          </p>
        </div>
        <MenuSelect
          ariaLabel={t("Language")}
          value={lang}
          disabled={!loaded}
          options={[
            { value: "auto", label: t("Auto (system)") },
            { value: "en", label: "English" },
            { value: "zh-Hans", label: "简体中文" },
            { value: "zh-Hant-HK", label: "繁體中文（香港）" },
          ]}
          onChange={(value) => persist(value as LangSettingValue)}
        />
      </div>
    </div>
  );
}

function DefaultPermissionCard() {
  const app = useApp();
  const reviewer = useApprovalReviewer();
  const [permission, setPermission] = useState<Permission | null>(null);

  useEffect(() => {
    let alive = true;
    getDefaultPermission()
      .then(({ permission: value }) => {
        if (alive) setPermission(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const persist = (next: Permission) => {
    setPermission(next);
    // The new-conversation draft starts with the new default too.
    updateDraft(NEW_DRAFT, (draft) => ({
      ...draft,
      settings: {
        ...draft.settings,
        mode: next === "read-only" ? "read-only" : "work",
        fullAccess: next === "full",
        smartApproval: next === "smart",
      },
    }));
    void saveDefaultPermission(next).catch(() => {});
  };

  return (
    <div className="set-card">
      <div className="row2">
        <div>
          <h4>{t("New conversations start with")}</h4>
          <p>
            {t("Each conversation can choose its own permission.")}
          </p>
        </div>
        <MenuSelect
          ariaLabel={t("New conversations start with")}
          value={permission ?? "ask"}
          disabled={permission === null}
          options={PERMISSIONS.map((value) => ({ value, label: PERMISSION_LABEL[value]() }))}
          onChange={(value) => {
            const next = value as Permission;
            if (next !== "full") {
              persist(next);
              return;
            }
            // Full as the default is confirmed once, here (owner 2026-09-25).
            app.requestConfirm({
              message: t("Start every new conversation with full access?"),
              details: fullAccessConsequences(),
              confirmLabel: t("Use full access by default"),
              onConfirm: () => persist("full"),
            });
          }}
        />
      </div>
      {reviewer ? (
        <div className="row2" style={{ marginTop: "var(--space-control)" }}>
          <div>
            <h4>{t("All approval modes (advanced)")}</h4>
            <p>{t("Adds strict smart approval to the permission menu: the reviewer also checks every command beyond simple reads.")}</p>
          </div>
          <button
            className={`toggle${reviewer.showAllModes ? " on" : ""}`}
            aria-pressed={reviewer.showAllModes}
            aria-label={t("All approval modes (advanced)")}
            onClick={() => setShowAllApprovalModes(!reviewer.showAllModes)}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Command prefixes that skip approval (smart-approval plan, ruling A). */
function CommandAllowlistCard() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getCommandAllowlist()
      .then(({ prefixes }) => {
        if (alive) setText(prefixes.join("\n"));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // The route did not answer: no card.
  if (text === null) return null;
  return (
    <div className="set-card">
      <h4>{t("Commands that run without asking")}</h4>
      <p>
        {t("One per line. Protected actions may still need approval.")}
      </p>
      <textarea
        className="set-lines"
        rows={4}
        spellCheck={false}
        placeholder={"npm test\npython scripts/"}
        aria-label={t("Commands that run without asking")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          void saveCommandAllowlist(text.split("\n"))
            .then(({ prefixes }) => setText(prefixes.join("\n")))
            .catch(() => {});
        }}
      />
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

  // The route did not answer (opus F1, same as ModelHooksCard).
  if (loaded && !available) return null;

  return (
    <div className="set-card">
      <div className="row2">
        <div>
          <h4>{t("Agent behavior")}</h4>
          <p>
            {t(
              "Native Pi does not load Alt's roles, Soul, or knowledge base.",
            )}
          </p>
        </div>
        <MenuSelect
          ariaLabel={t("Agent behavior")}
          value={mode}
          disabled={!loaded}
          options={[
            { value: "alt-theory", label: "Alt Theory" },
            { value: "native-pi", label: "Native Pi" },
          ]}
          onChange={(value) =>
            persist(
              value as "alt-theory" | "native-pi",
              scanAltSkills,
            )
          }
        />
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
              "Include Alt Theory's bundled skills.",
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

function useChainModelOptions(inheritLabel: () => string) {
  const [models, setModels] = useState<Array<{ value: string; label: string }>>([]);
  useEffect(() => {
    let alive = true;
    listConfigProviders()
      .then((providers) => {
        if (!alive) return;
        setModels(
          providers.providers.flatMap((provider) =>
            provider.models.map((model) => ({
              value: `${provider.name}/${model.id}`,
              label: `${provider.name} / ${model.name || model.id}`,
            })),
          ),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => [{ value: "inherit", label: inheritLabel() }, ...models], [models, inheritLabel]);
}

const sameAsConversation = () => t("Same as conversation");

function AutoTitleCard() {
  const [settings, setSettings] = useState<AutoTitleSettings>({ enabled: true, model: null });
  const [loaded, setLoaded] = useState(false);
  const models = useChainModelOptions(sameAsConversation);

  useEffect(() => {
    let alive = true;
    getAutoTitleSettings()
      .then((value) => alive && setSettings(value))
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const persist = (next: AutoTitleSettings) => {
    setSettings(next);
    void saveAutoTitleSettings(next).catch(() => {});
  };

  // The pinned model reads as the head of a chain; "inherit" = no pin.
  const pin = settings.model;
  const chain = {
    model: pin ? joinAgentModelRef(`${pin.provider}/${pin.modelId}`, pin.thinkingLevel ?? "off") : "inherit:off",
    fallbackModels: (settings.fallbackModels ?? []).map((ref) => splitAgentModelRef(ref)[1] ? ref : `${ref}:off`),
  };
  const fromChain = (next: { model: string; fallbackModels: string[] }): AutoTitleSettings => {
    const [model, thinking] = splitAgentModelRef(next.model);
    const slash = model.indexOf("/");
    return {
      enabled: settings.enabled,
      model:
        model === "inherit" || slash < 0
          ? null
          : { provider: model.slice(0, slash), modelId: model.slice(slash + 1), ...(thinking ? { thinkingLevel: thinking } : {}) },
      fallbackModels: next.fallbackModels,
    };
  };

  return (
    <div className="set-card">
      <div className="row2">
        <div>
          <h4>{t("Auto-name conversations")}</h4>
          <p>
            {t("Auto-name after the first message.")}
          </p>
        </div>
        <button
          className={`toggle${settings.enabled ? " on" : ""}`}
          aria-pressed={settings.enabled}
          disabled={!loaded}
          onClick={() => persist({ ...settings, enabled: !settings.enabled })}
        />
      </div>
      {settings.enabled && loaded ? (
        <div style={{ marginTop: "var(--space-control)" }}>
          <p>{t("For naming, choose a fast model with thinking off. The conversation's model is the automatic fallback.")}</p>
          <ModelChainFields chain={chain} models={models} onChange={(next) => persist(fromChain(next))} />
        </div>
      ) : null}
    </div>
  );
}

const conversationModel = () => t("This conversation's model");

/** Smart approval's reviewer (rulings H and I): auto, or a model chain; recommendations with their date. */
function ApprovalReviewerCard() {
  const settings = useApprovalReviewer();
  const models = useChainModelOptions(conversationModel);
  const [recommendations, setRecommendations] = useState<ReviewerRecommendations | null>(null);

  useEffect(() => {
    let alive = true;
    getReviewerRecommendations()
      .then((value) => alive && setRecommendations(value))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!settings) return null;
  // A recommendation is offered when some configured provider has that model.
  const offered = (recommendations?.models ?? []).map((entry) => {
    const ids = [entry.modelId, ...(entry.aliases ?? [])].map((id) => id.toLowerCase());
    const match = models.find((option) => option.value !== "inherit" && ids.includes(option.value.split("/").slice(1).join("/").toLowerCase()));
    return { ...entry, ref: match ? `${match.value}:${entry.thinking}` : null, label: match?.label ?? entry.modelId };
  });
  const use = (ref: string) =>
    void setApprovalReviewer({ model: ref, fallbackModels: settings.reviewer?.fallbackModels ?? [] }).catch(() => {});

  return (
    <div className="set-card" id="approval-reviewer">
      <div className="row2">
        <div>
          <h4>{t("Smart approval reviewer")}</h4>
          <p>
            {t("Choose a fast model with low thinking effort. Auto uses the current conversation's model at low effort.")}
          </p>
        </div>
        <MenuSelect
          ariaLabel={t("Smart approval reviewer")}
          value={settings.reviewer ? "custom" : "auto"}
          options={[
            { value: "auto", label: t("Auto") },
            { value: "custom", label: t("Choose models") },
          ]}
          onChange={(value) =>
            void setApprovalReviewer(
              value === "auto" ? null : { model: offered.find((entry) => entry.ref)?.ref ?? "inherit:low", fallbackModels: [] },
            ).catch(() => {})
          }
        />
      </div>
      {settings.reviewer ? (
        <div style={{ marginTop: "var(--space-control)" }}>
          <ModelChainFields
            chain={settings.reviewer}
            models={models}
            onChange={(next) => void setApprovalReviewer(next).catch(() => {})}
          />
        </div>
      ) : null}
      {offered.length ? (
        <div className="fine reviewer-recs">
          <span>
            {t("Recommended reviewers (list updated {date}):", { date: recommendations?.updatedAt ?? "" })}
          </span>
          {offered.map((entry) => (
            <span key={`${entry.modelId}:${entry.thinking}`} className="reviewer-rec">
              {entry.label} · {t(entry.thinking)}
              {" "}({entry.tag === "preferred" ? t("preferred") : t("faster")})
              {entry.ref ? (
                settings.reviewer?.model === entry.ref ? (
                  <i className="ph ph-check" aria-label={t("In use")} />
                ) : (
                  <button className="ghostbtn" onClick={() => use(entry.ref!)}>{t("Use")}</button>
                )
              ) : (
                <em> — {t("not set up on this computer")}</em>
              )}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SkillsPanel() {
  const app = useApp();
  const [dirs, setDirs] = useState<AssetDirs | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => { void getAssetDirs().then(setDirs).catch((error) => setNotice(String(error))); }, []);
  const save = async (paths: string[]) => {
    try {
      const saved = await saveAssetDirs({ skillDirs: paths });
      setDirs((current) => current ? { ...current, extraSkillDirs: saved.extraSkillDirs } : current);
      await app.refreshDiscovery();
      setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };
  return (
    <div className="set-panel">
      <h2>{t("Skills")}</h2>
      <p className="sub">
        {t("Skills provide reusable ways of working.")}
      </p>
      <SkillPrecedenceCard />
      <div className="set-card">
        <div className="row2"><h4>{t("Skill folders")}</h4>
          <button className="flat" disabled={!dirs} onClick={() => void pickDirectory(t("Add skill folder")).then((path) => {
            if (path && dirs) void save([...dirs.extraSkillDirs, path]);
          })}><i className="ph ph-plus" /> {t("Add skill folder")}</button>
        </div>
        {dirs?.extraSkillDirs.map((path) => <div className="folder-row" key={path}>
          <i className="ph ph-folder" aria-hidden="true" />
          <div className="grow"><div className="nm">{folderLabel(path)}</div><div className="path">{path}</div></div>
          <button className="icon-x" aria-label={t("Remove")} onClick={() => void save(dirs.extraSkillDirs.filter((entry) => entry !== path))}><i className="ph ph-x" /></button>
        </div>)}
        {notice ? <p className="sub danger">{notice}</p> : null}
      </div>
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
        </div>
        <MenuSelect
          ariaLabel={t("Skill precedence")}
          value={value}
          disabled={!loaded}
          options={[
            { value: "prefer-bundled", label: t("Prefer Alt Theory's") },
            { value: "prefer-user", label: t("Prefer the ones I installed") },
            { value: "ask", label: t("Ask me each time") },
          ]}
          onChange={(next) => {
            setValue(next as SkillPrecedence);
            void saveSkillPrecedence(next as SkillPrecedence).catch(() => {});
          }}
        />
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
      {notice ? <p className="sub">{notice}</p> : null}
      <div className="set-card">
        <div className="row2">
          <div>
            <h4>{t("Roles")}</h4>
            {dirs ? <p className="fine"><code>{dirs.userRolePresetsDir}</code></p> : null}
            <ul className="asset-list">
              {roles.map((role) => (
                <li key={role.slug}>
                  <i className="ph ph-user-circle" aria-hidden="true" />{" "}
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
              {t("Knowledge sets supplement domain knowledge. Alt consults them first.")}
            </p>
            <ul className="asset-list">
              {kbDomains.map((domain) => (
                <li key={domain.slug}>
                  <i className="ph ph-book-open" aria-hidden="true" />{" "}
                  {domain.displayName}
                  {domain.source === "added" ? <em> {t("· added by you")}</em> : null}
                </li>
              ))}
            </ul>
            {dirs && dirs.extraKbDirs.length > 0 ? (
              <ul className="asset-list">
                {dirs.extraKbDirs.map((dir) => (
                  <li className="folder-row" key={dir}>
                    <i className="ph ph-folder" aria-hidden="true" />
                    <div className="grow"><div className="nm">{folderLabel(dir)}</div><div className="path">{dir}</div></div>
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

function AboutPanel() {
  const [dataDir, setDataDir] = useState<string | null>(null);
  const [update, setUpdate] = useState<AppUpdateStatus | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    getDataFolder()
      .then((r) => alive && setDataDir(r.dataDir))
      .catch(() => {});
    if (hasNativeBridge()) {
      void getUpdateStatus().then((status) => alive && setUpdate(status));
    }
    return () => {
      alive = false;
    };
  }, []);
  const version = update?.currentVersion || __ALT_THEORY_VERSION__;
  return (
    <div className="set-panel">
      <h2>{t("About")}</h2>
      <p className="sub">Alt Theory v{version}.</p>
      {hasNativeBridge() ? (
        <div className="set-card">
          <h4>{t("Updates")}</h4>
          {update?.newer && update.latestVersion ? (
            <p>{t("Version {version} is available.", { version: update.latestVersion })}</p>
          ) : checked && update && !update.newer ? (
            <p>{t("No newer version.")}</p>
          ) : null}
          <div className="row2">
            <button
              className="add-btn"
              onClick={() => {
                void checkForUpdates().then((status) => {
                  setUpdate(status);
                  setChecked(true);
                });
              }}
            >
              {t("Check for updates")}
            </button>
            {update?.newer && update.htmlUrl ? (
              <button
                className="add-btn"
                onClick={() => void openExternal(update.htmlUrl!)}
              >
                {t("Open download page")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
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
  const main = useMainView();
  const shell = useShell();
  return (
    <div className="set-panel">
      <h2>{t("Help center")}</h2>
      <button
        className="add-btn help-ask"
        onClick={() => {
          shell.openApp();
          main.askAboutAlt();
        }}
      >
        <i className="ph ph-chats-circle" />
        {t("Ask Alt")}
      </button>
      <div className="set-card">
        <h4>{t("Do concrete work on your materials")}</h4>
        <p>
          {t("Alt can work with files, find sources, and produce documents.")}
        </p>
      </div>
      <div className="set-card">
        <h4>{t("Compare different lines of inquiry")}</h4>
        <p>
          {t("AI answers vary with the prompt and model. Edit the question and model to compare another answer.")}
        </p>
      </div>
      <div className="set-card">
        <h4>{t("Delegate parts of a task")}</h4>
        <p>
          {t("Subagents can handle bounded tasks or independently propose candidate answers. They appear in related conversations, where you can message them.")}
        </p>
      </div>
      <div className="set-card">
        <h4>{t("Use roles, knowledge sets, and skills")}</h4>
        <p>
          {t("Roles shape how Alt interprets situations and identifies priorities; knowledge sets provide domain knowledge; skills provide reusable ways of working.")}
        </p>
      </div>
      <div className="set-card">
        <h4>{t("Keep side paths without losing the main conversation")}</h4>
        <p>
          {t("Branch and BTW keep related conversations alongside. Use BTW for questions and explanations about a conversation without affecting its main thread.")}
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
 * Working folders (v1.5.1): projects — each its own entity with an editable
 * name, a changeable main folder, and companion folders — plus the global
 * list of folders Alt may read in every conversation, one Edit tick per row.
 * No mechanism words on the page; the root policy behind it is
 * core/root-policy.ts (global-list / project-secondary).
 */
function WorkingFoldersPanel() {
  const app = useApp();
  const [folders, setFolders] = useState<WorkingFoldersSettings | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

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

  // Project rows come through the app state too, so a change made in the
  // rail (add companion, remove folder) is reflected here on return —
  // including the list becoming empty, once the app has loaded it once.
  useEffect(() => {
    if (app.workingFoldersLoaded) {
      setFolders((prev) =>
        prev ? { ...prev, projects: app.projects, knownWorkspaces: app.knownWorkspaces } : prev,
      );
    }
  }, [app.projects, app.knownWorkspaces, app.workingFoldersLoaded]);

  const projects = (folders?.projects ?? app.projects)
    .slice()
    .sort((a, b) =>
      (a.name ?? folderLabel(a.primaryDir)).localeCompare(
        b.name ?? folderLabel(b.primaryDir),
      ),
    );

  const save = (next: { global?: WorkingFoldersSettings["global"]; projects?: ProjectFolder[] }) =>
    saveWorkingFolders(next)
      .then((saved) => {
        setFolders(saved);
        setNotice(null);
        void app.refreshWorkingFolders();
      })
      .catch((err) => setNotice(err instanceof Error ? err.message : t("Could not save.")));

  const displayName = (project: ProjectFolder) =>
    project.name ?? folderLabel(project.primaryDir);

  const newProject = () => {
    void pickDirectory(t("Full path of the project to add:")).then((path) => {
      if (path)
        void app
          .addKnownWorkspace(path)
          .then(() => getWorkingFolders().then((value) => setFolders(value)))
          .catch((err) => setNotice(err instanceof Error ? err.message : t("Could not add folder")));
    });
  };
  const companionsOf = (project: ProjectFolder) => project.secondaryDirs;
  const setProject = (next: ProjectFolder) =>
    void save({ projects: projects.map((project) => (project.id === next.id ? next : project)) });
  const addCompanion = (project: ProjectFolder) => {
    void pickDirectory(t("Full path of the folder to add to this project:")).then((path) => {
      if (!path || companionsOf(project).includes(path)) return;
      setProject({ ...project, secondaryDirs: [...companionsOf(project), path] });
    });
  };
  const changeMainFolder = (project: ProjectFolder) => {
    void pickDirectory(t("Full path of the project's new main folder:")).then((path) => {
      if (!path || path === project.primaryDir) return;
      const label = folderLabel(path);
      app.requestConfirm({
        message: t("Move this project to work in \"{label}\"?", { label }),
        details: [
          t("All project conversations move together."),
          t("Alt will ask for permissions again in the new folder."),
          t("Files already on disk are not moved."),
          t("A conversation that is working right now refuses the move; try again when it is idle."),
        ],
        confirmLabel: t("Move"),
        onConfirm: () => {
          void app
            .repointProject(project.id, path)
            .then(() => getWorkingFolders().then((value) => setFolders(value)))
            .catch((err) => setNotice(err instanceof Error ? err.message : t("Could not save.")));
        },
      });
    });
  };
  const commitRename = (project: ProjectFolder) => {
    const name = renameValue.trim();
    setRenaming(null);
    setProject(
      name && name !== folderLabel(project.primaryDir)
        ? { ...project, name }
        : { ...project, name: undefined },
    );
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
      <h2>{t("Projects and global folders")}</h2>
      {notice ? <p className="sub">{notice}</p> : null}

      <div className="set-card">
        <div className="row2">
          <div>
            <h4>{t("Projects")}</h4>
            <p>{t("Main and companion folders are visible to the project's conversations.")}</p>
          </div>
          <button className="flat" onClick={newProject}>
            <i className="ph ph-plus" aria-hidden="true" /> {t("New project")}
          </button>
        </div>
        {projects.length === 0 ? (
          <p className="fine">{t("No projects yet.")}</p>
        ) : (
          projects.map((project) => (
            <div className="proj" key={project.id}>
              <div className="proj-head">
                <i className="ph ph-stack" aria-hidden="true" />
                {renaming === project.id ? (
                  <form
                    className="session-rename-inline"
                    onSubmit={(event) => {
                      event.preventDefault();
                      commitRename(project);
                    }}
                  >
                    <input
                      autoFocus
                      aria-label={t("Project name")}
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setRenaming(null);
                      }}
                    />
                    <button type="button" data-tip={t("Cancel")} onClick={() => setRenaming(null)}>
                      <i className="ph ph-x" />
                    </button>
                    <button type="submit" data-tip={t("Save")}>
                      <i className="ph ph-check" />
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="pname">{displayName(project)}</span>
                    <button
                      className="icon-x"
                      data-tip={t("Rename")}
                      aria-label={t("Rename")}
                      onClick={() => {
                        setRenameValue(displayName(project));
                        setRenaming(project.id);
                      }}
                    >
                      <i className="ph ph-pencil-simple" aria-hidden="true" />
                    </button>
                  </>
                )}
                <span className="sp" />
                <button className="flat" onClick={() => addCompanion(project)}>
                  <i className="ph ph-plus" aria-hidden="true" /> {t("Add a folder")}
                </button>
              </div>
              <div className="sf">
                <i className="ph ph-folder" aria-hidden="true" />
                <span className="lbl">{project.primaryDir}</span>
                <span className="role">{t("Main folder")}</span>
                <button className="flat" onClick={() => changeMainFolder(project)}>
                  {t("Change")}
                </button>
              </div>
              {project.available === false ? (
                <div className="sf">
                  <span className="lbl quiet">{t("Main folder not found. Change its location.")}</span>
                </div>
              ) : null}
              {companionsOf(project).map((dir) => (
                <div className="sf" key={dir}>
                  <i className="ph ph-folder" aria-hidden="true" />
                  <span className="lbl">{dir}</span>
                  <button
                    className="icon-x"
                    data-tip={removeTip}
                    aria-label={removeTip}
                    onClick={() =>
                      setProject({
                        ...project,
                        secondaryDirs: companionsOf(project).filter((item) => item !== dir),
                      })
                    }
                  >
                    <i className="ph ph-x" aria-hidden="true" />
                  </button>
                </div>
              ))}
              {companionsOf(project).length === 0 ? (
                <div className="sf"><span className="lbl quiet">{t("No companion folders yet.")}</span></div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="set-card">
        <div className="row2">
          <div>
            <h4>{t("Global folders")}</h4>
            <p>{t("Readable by all conversations by default.")}</p>
          </div>
          <button className="flat" onClick={addGlobal} disabled={!folders}>
            <i className="ph ph-plus" aria-hidden="true" /> {t("Add a folder")}
          </button>
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
        {folders && folders.global.length > 0 ? (
          <p className="fine">{t("In a read-only conversation, every change still asks first.")}</p>
        ) : null}
      </div>
    </div>
  );
}
