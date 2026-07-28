import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelProviderAuth,
  getAutoTitleSettings,
  getDefaultMode,
  saveDefaultMode,
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
} from "@/api/types";
import { ModelConfigPage } from "@/pages/ModelConfigPage";
import { hasNativeBridge, pickDirectory, pickFiles, revealPath } from "@/lib/native";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";

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
    { key: "models", label: "Models", icon: "ph-cpu" },
    { key: "general", label: "General", icon: "ph-gear" },
    { key: "rolekb", label: "Role & Knowledge", icon: "ph-books" },
    ...(shell.participantTabEnabled
      ? [
          {
            key: "participant",
            label: "Participant mode",
            icon: "ph-identification-badge",
          },
        ]
      : []),
    { key: "features", label: "What Alt can do", icon: "ph-sparkle" },
    { key: "about", label: "About", icon: "ph-info" },
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
          Back to app
        </button>
        {items.map((item) => (
          <button
            key={item.key}
            className={`set-item${shell.settingsPanel === item.key ? " on" : ""}`}
            onClick={() => shell.setSettingsPanel(item.key)}
          >
            <i className={`ph ${item.icon}`} />
            {item.label}
            {item.soon ? <span className="soon">soon</span> : null}
          </button>
        ))}
      </nav>
      <div className="set-body">
        {shell.settingsPanel === "models" ? <ModelsPanel /> : null}
        {shell.settingsPanel === "general" ? <GeneralPanel /> : null}
        {shell.settingsPanel === "rolekb" ? <RoleKbPanel /> : null}
        {shell.settingsPanel === "participant" ? (
          <ParticipantPanel designated={app.participant?.designated ?? false} label={app.participant?.label ?? null} local={app.appMode === "local"} />
        ) : null}
        {shell.settingsPanel === "features" ? <FeaturesPanel /> : null}
        {shell.settingsPanel === "about" ? <AboutPanel /> : null}
      </div>
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
          <p>Model configuration is managed by this deployment.</p>
        </div>
      )}
    </div>
  );
}

export function AuthConnectCard({ onChanged }: { onChanged: () => void }) {
  const PROVIDERS = [
    {
      id: "openrouter",
      name: "OpenRouter",
      icon: "ph-compass",
    },
    { id: "xai", name: "Grok", icon: "ph-lightning" },
    {
      id: "openai-codex",
      name: "Codex",
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
              {connected.has(p.id) ? <span className="aps">Connected</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="auth-flow">
          <div className="auth-flow-head">
            <span>
              Sign in to <strong>{flow.provider.name}</strong>
            </span>
            <button className="link-btn" onClick={cancel}>
              Cancel
            </button>
          </div>
          {flow.step === "link" ? (
            <>
              <p className="auth-step">
                {connected.has(flow.provider.id)
                  ? "This account is connected. Reconnect or disconnect it."
                  : "Open the provider sign-in flow and approve access."}
              </p>
              <div className="auth-linkrow">
                <button
                  className="add-btn"
                  onClick={start}
                >
                  <i className="ph ph-arrow-square-out" />
                  {connected.has(flow.provider.id)
                    ? "Reconnect"
                    : "Open in browser"}
                </button>
                {connected.has(flow.provider.id) ? (
                  <button className="link-btn" onClick={disconnect}>
                    Disconnect
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
                      "Finish signing in in your browser."
                    : latestEvent?.type === "device_code"
                      ? "Enter this code in the provider page:"
                      : "Preparing the secure sign-in flow…"}
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
                    Continue
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
                <i className="ph ph-check-circle" /> Connected to{" "}
                {flow.provider.name}
              </p>
              <p className="fine">
                Connected. Choose one of this provider&apos;s models below.
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
      <h2>General</h2>
      <p className="sub">App behavior and appearance.</p>
      <div className="set-card">
        <div className="row2">
          <div>
            <h4>Language</h4>
            <p>English. More languages later.</p>
          </div>
        </div>
      </div>
      <div className="set-card">
        <div className="row2">
          <div>
            <h4>Dark appearance</h4>
            <p>Use a dark color theme for the app.</p>
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
            <h4>Show thinking</h4>
            <p>
              Show Alt&apos;s thinking as a collapsible block above each reply.
              Off by default — some models think at great length.
            </p>
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
            <h4>Expand thinking</h4>
            <p>
              Show the assistant&apos;s thinking blocks expanded by default.
              When off, thinking stays collapsed and can be opened per block.
            </p>
          </div>
          <button
            className={`toggle${shell.thinkingExpanded ? " on" : ""}`}
            aria-pressed={shell.thinkingExpanded}
            onClick={() => shell.setThinkingExpanded(!shell.thinkingExpanded)}
          />
        </div>
      </div>
      <DefaultModeCard />
      <AutoTitleCard />
      <SkillPrecedenceCard />
      <div className="set-card">
        <div className="row2">
          <div>
            <h4>Study participant options</h4>
            <p>
              Show the Participant mode settings. Only turn this on if you take
              part in a study; it stays hidden otherwise.
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

function DefaultModeCard() {
  const shell = useShell();
  const [mode, setMode] = useState<"pure" | "full" | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    getDefaultMode()
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

  const persist = (next: "pure" | "full") => {
    setMode(next);
    shell.setNewMode(next);
    void saveDefaultMode(next).catch(() => {});
  };

  return (
    <div className="set-card">
      <div className="row2">
        <div>
          <h4>New conversations start in</h4>
          <p>
            Understand talks things through without changing files; Work can
            act in your working folders. Each conversation can still switch
            its own mode.
          </p>
        </div>
        <select
          value={mode ?? shell.newMode}
          disabled={!loaded}
          onChange={(e) => persist(e.target.value as "pure" | "full")}
        >
          <option value="pure">Understand</option>
          <option value="full">Work</option>
        </select>
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
          <h4>Auto-name conversations</h4>
          <p>
            Name a conversation automatically after the first message, using its
            own model. Falls back to the first few words if naming fails.
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
            <h4>Naming model</h4>
            <p>A small model is recommended — cheaper and faster.</p>
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
            <option value="">Same as conversation</option>
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
          <h4>When two skills overlap</h4>
          <p>
            Alt Theory ships its own skills, and you can install your own. This
            decides which one is used when both fit the same job. Applies to new
            and reopened conversations.
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
          <option value="prefer-bundled">Prefer Alt Theory&apos;s</option>
          <option value="prefer-user">Prefer the ones I installed</option>
          <option value="ask">Ask me each time</option>
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

  const roles = (app.discovery?.rolePresets ?? []).filter((r) => !r.snapshot);
  const kbDomains = (app.discovery?.kbDomains ?? []).filter(
    (d) => d.slug !== "off" && d.slug !== "all",
  );

  const addRoleFile = () => {
    void pickFiles("Full path of the role file (.md) to add:").then(
      async (paths) => {
        for (const path of paths) {
          try {
            const result = await uploadRolePreset(path);
            setNotice(`Added role "${result.slug}".`);
          } catch (err) {
            setNotice(err instanceof Error ? err.message : "Could not add role");
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
              ? "Knowledge folder added."
              : "That folder could not be added (does it exist?).",
          );
          void app.refreshDiscovery();
        } catch (err) {
          setNotice(err instanceof Error ? err.message : "Could not add folder");
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
      <h2>Role &amp; Knowledge</h2>
      <p className="sub">
        What Alt speaks as, and what it draws on. New conversations start with
        no role and the bundled knowledge set until you pick otherwise above
        the composer. Adding here never changes the bundled files.
      </p>
      {notice ? <p className="sub">{notice}</p> : null}
      <div className="set-card">
        <div className="row2">
          <div>
            <h4>Roles</h4>
            <p>
              A role is a Markdown file describing who Alt should be for a
              conversation. Files you add are stored in your own folder and
              appear in the role picker.
            </p>
            <ul className="asset-list">
              {roles.map((role) => (
                <li key={role.slug}>
                  {role.displayName}
                  {role.source === "added" ? <em> · added by you</em> : null}
                </li>
              ))}
              {roles.length === 0 ? <li>No roles found.</li> : null}
            </ul>
          </div>
          <button className="flat" onClick={addRoleFile}>
            <i className="ph ph-plus" aria-hidden="true" /> Add role file
          </button>
        </div>
      </div>
      <div className="set-card">
        <div className="row2">
          <div>
            <h4>Knowledge sets</h4>
            <p>
              Each knowledge set is a folder of material Alt can ground its
              answers in. Add a folder of your own to make it selectable; the
              bundled sets stay untouched.
            </p>
            <ul className="asset-list">
              {kbDomains.map((domain) => (
                <li key={domain.slug}>
                  {domain.displayName}
                  {domain.source === "added" ? <em> · added by you</em> : null}
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
                      title="Stop scanning this folder (the folder itself is not deleted)"
                      onClick={() => removeKbDir(dir)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button className="flat" onClick={addKbDir}>
            <i className="ph ph-plus" aria-hidden="true" /> Add knowledge folder
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
      <h2>Participant mode</h2>
      <p className="sub">
        Only relevant if you take part in a study. If you are not in a study, you
        can leave this hidden.
      </p>

      {designated ? (
        <>
          <div className="set-card">
            <div className="row2">
              <div>
                <h4>Display label</h4>
                <p>
                  The name or code that identifies your data in the study. Set by
                  your study when the app was installed.
                </p>
              </div>
              <span className="participant-label">{label || "Not set"}</span>
            </div>
          </div>
          <div className="set-card">
            <h4>Sharing conversations with the research team</h4>
            <p>
              This install is designated as a study participant, so new
              conversations are shared with the research team by default. You can
              make any single conversation private with the Shared/Private control
              next to the composer.
            </p>
            <div className="fine">
              {local
                ? "On this local install, sharing only MARKS a conversation; nothing is uploaded automatically. You send an export to the research team yourself later."
                : "On the hosted (account) version, shared conversations reach the research team automatically."}{" "}
              Installs obtained outside a study never share anything.
            </div>
          </div>
        </>
      ) : (
        <div className="set-card">
          <h4>This install is not part of a study</h4>
          <p>
            You got Alt outside a study, so there is nothing to share and no label
            to set. Conversations stay on this machine.
          </p>
          <div className="fine">
            If you later join a study, they will provide an install that turns
            these options on.
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
      <h2>About</h2>
      <p className="sub">Alt Theory, v1 alpha.</p>
      {dataDir ? (
        <div className="set-card">
          <div className="row2">
            <div>
              <h4>Your data folder</h4>
              <p>Conversations and settings are stored on this machine at {dataDir}.</p>
            </div>
            <button
              className="add-btn"
              onClick={() => {
                if (hasNativeBridge()) void revealPath(dataDir);
                else void navigator.clipboard?.writeText(dataDir);
              }}
            >
              <i className={`ph ${hasNativeBridge() ? "ph-folder-open" : "ph-copy"}`} />
              {hasNativeBridge() ? "Show in file manager" : "Copy path"}
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
      <h2>What Alt can do</h2>
      <p className="sub">
        A short guide. For anything here, you can also just ask — open a
        Helper conversation from the right panel and Alt will answer from the
        current documentation.
      </p>
      <div className="set-card">
        <h4>Think through research questions with you</h4>
        <p>
          In <strong>Understand</strong>, Alt works only with what you bring
          into the conversation. It separates what it found from what it
          inferred, marks uncertainty instead of papering over it, and moves
          in steps you can steer — built for research design, framing, and
          interpretation, where being agreeably wrong is worse than being
          slower.
        </p>
      </div>
      <div className="set-card">
        <h4>Do concrete work on your materials</h4>
        <p>
          In <strong>Work</strong>, the same conversation can read and produce
          documents, work through the files in your working folders, and
          search the web and literature. Actions that cross a boundary ask
          for your approval first. Switching modes never moves or changes
          your folders.
        </p>
      </div>
      <div className="set-card">
        <h4>Keep every direction you explore</h4>
        <p>
          Conversations are durable: close the app and pick any of them up
          later. From any reply you can edit your message, try the same
          prompt again, or branch into a related conversation — the original
          always stays intact. Related conversations live in the right panel.
        </p>
      </div>
      <div className="set-card">
        <h4>Delegate parts of a task</h4>
        <p>
          On larger Work tasks, Alt can hand a bounded piece to a worker
          agent and keep going. Workers appear in the right panel like any
          related conversation — you can watch them, message them directly,
          or stop them at any point.
        </p>
      </div>
      <div className="set-card">
        <h4>Draw on roles, knowledge sets, and skills</h4>
        <p>
          A role shapes who Alt speaks as; a knowledge set gives it material
          to ground answers in; skills are readable instruction files that
          carry its working methods. You can read every bundled skill and add
          your own — see the Role &amp; Knowledge panel here in Settings.
        </p>
      </div>
      <div className="set-card">
        <h4>What Alt will not do</h4>
        <p>
          It will not invent citations, silently act outside its approved
          folders, or paper over what it could not verify. When something is
          genuinely open, it says so and offers realistic options.
        </p>
      </div>
    </div>
  );
}
