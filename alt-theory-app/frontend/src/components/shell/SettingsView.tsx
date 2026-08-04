import { useCallback, useEffect, useRef, useState } from "react";
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
  listConfigProviders,
  listProviderAuthStatus,
  logoutProviderAuth,
  respondToProviderAuth,
  saveAutoTitleSettings,
  saveSkillPrecedence,
  startProviderAuth,
  getAssetDirs,
  saveAssetDirs,
  uploadRolePreset,
  type AssetDirs,
  type AutoTitleSettings,
  type SkillPrecedence,
} from "@/api/config";
import type {
  ProviderAuthFlow,
  ProviderAuthId,
  SessionSummary,
} from "@/api/types";
import { ModelConfigPage } from "@/pages/ModelConfigPage";
import { hasNativeBridge, pickDirectory, pickFiles, revealPath } from "@/lib/native";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { t } from "@/i18n";
import {
  fetchTrashSessions,
  hydrateSessionDisplayName,
  permanentlyDeleteSession,
  restoreSession,
  type SessionDisplayName,
} from "@/api/sessions";
import { sessionTitle } from "@/lib/sessionList";

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
    { key: "models", label: t("Models"), icon: "ph-cpu" },
    { key: "general", label: t("General"), icon: "ph-gear" },
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
    { key: "features", label: t("What Alt can do"), icon: "ph-sparkle" },
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
      </nav>
      <div className="set-body">
        {shell.settingsPanel === "models" ? <ModelsPanel /> : null}
        {shell.settingsPanel === "general" ? <GeneralPanel /> : null}
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await fetchTrashSessions();
      setSessions(next);
      const entries = await Promise.all(
        next.map(async (session) => [
          session.sessionId,
          await hydrateSessionDisplayName(session.sessionId),
        ] as const),
      );
      setNames(Object.fromEntries(entries));
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
      await Promise.all([load(), app.refreshSessions()]);
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
          .then(load)
          .catch((reason) =>
            setError(reason instanceof Error ? reason.message : String(reason)),
          );
      },
    });
  };

  return (
    <div className="set-panel">
      <h2>{t("Trash")}</h2>
      <p className="sub">{t("Deleted conversations are kept for 30 days.")}</p>
      {error ? <p className="fine">{error}</p> : null}
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
                <div>
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
  const refreshConfig = useCallback(
    () => setConfigVersion((version) => version + 1),
    []
  );

  return (
    <div className="set-panel models-panel">
      {local ? (
        <ModelConfigPage
          embedded
          key={configVersion}
          addProviderTop={<AuthConnectCard onChanged={refreshConfig} />}
        />
      ) : (
        <div className="set-card">
          <p>{t("Model configuration is managed by this deployment.")}</p>
        </div>
      )}
    </div>
  );
}

export function AuthConnectCard({ onChanged }: { onChanged: () => void }) {
  const PROVIDERS = [
    {
      id: "openrouter",
      name: t("OpenRouter"),
      icon: "ph-compass",
    },
    { id: "xai", name: t("Grok"), icon: "ph-lightning" },
    {
      id: "openai-codex",
      name: t("Codex"),
      icon: "ph-code",
    },
  ] as const;
  const [flow, setFlow] = useState<{
    provider: (typeof PROVIDERS)[number];
    step: "link" | "waiting" | "done";
    auth?: ProviderAuthFlow;
    error?: string;
  } | null>(null);
  const [connected, setConnected] = useState<Set<ProviderAuthId>>(new Set());
  const [input, setInput] = useState("");
  const popup = useRef<Window | null>(null);
  const openedUrl = useRef<string | null>(null);

  const refreshStatus = async () => {
    const result = await listProviderAuthStatus();
    setConnected(
      new Set(
        result.providers
          .filter((provider) => provider.connected)
          .map((provider) => provider.provider)
      )
    );
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

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
    popup.current = window.open("about:blank", "_blank");
    setFlow({ ...flow, step: "waiting", error: undefined });
    try {
      const auth = await startProviderAuth(flow.provider.id);
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

  return (
    <div className="oauth-options">
      {!flow ? (
        <div className="auth-providers">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              className="auth-provider"
              onClick={() =>
                setFlow({ provider: p, step: "link", error: undefined })
              }
            >
              <i className={`ph ${p.icon}`} />
              <span className="apn">{p.name}</span>
              {connected.has(p.id) ? <span className="aps">{t("Connected")}</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="auth-flow">
          <div className="auth-flow-head">
            <span>
              {t("Sign in to ")} <strong>{flow.provider.name}</strong>
            </span>
            <button className="link-btn" onClick={cancel}>
              {t("Cancel")}
            </button>
          </div>
          {flow.step === "link" ? (
            <>
              <p className="auth-step">
                {connected.has(flow.provider.id)
                  ? t("This account is connected. Reconnect or disconnect it.")
                  : t("Open the provider sign-in flow and approve access.")}
              </p>
              <div className="auth-linkrow">
                <button
                  className="add-btn"
                  onClick={start}
                >
                  <i className="ph ph-arrow-square-out" />
                  {connected.has(flow.provider.id)
                    ? t("Reconnect")
                    : t("Open in browser")}
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
                {latestEvent?.type === "progress"
                  ? latestEvent.message
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
                    aria-label={flow.auth.prompt.message}
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
                <p className="fine">{flow.auth.prompt.message}</p>
              ) : null}
              {flow.error ? <p className="fine">{flow.error}</p> : null}
            </>
          ) : (
            <>
              <p className="auth-step auth-done">
                <i className="ph ph-check-circle" /> {t("Connected to ")}
                {flow.provider.name}
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
                      title={t("Stop scanning this folder (the folder itself is not deleted)")}
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
  return (
    <div className="set-panel">
      <h2>{t("What Alt can do")}</h2>
      <p className="sub">
        {t("A short guide. For anything here, you can also just ask — open a Helper conversation from the right panel and Alt will answer from the current documentation.")}
      </p>
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
    </div>
  );
}
