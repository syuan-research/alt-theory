import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelProviderAuth,
  getAutoTitleSettings,
  getDataFolder,
  getProviderAuthFlow,
  listConfigProviders,
  listProviderAuthStatus,
  logoutProviderAuth,
  respondToProviderAuth,
  saveAutoTitleSettings,
  startProviderAuth,
  type AutoTitleSettings,
} from "@/api/config";
import type {
  ProviderAuthFlow,
  ProviderAuthId,
} from "@/api/types";
import { ModelConfigPage } from "@/pages/ModelConfigPage";
import { hasNativeBridge, revealPath } from "@/lib/native";
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
    { key: "rolekb", label: "Role & Knowledge", icon: "ph-books", soon: true },
    ...(shell.participantTabEnabled
      ? [
          {
            key: "participant",
            label: "Participant mode",
            icon: "ph-identification-badge",
          },
        ]
      : []),
    { key: "features", label: "What Alt can do", icon: "ph-sparkle", soon: true },
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
    <div className="set-panel">
      <h2>Models</h2>
      <p className="sub">
        Connect a provider and choose the model Alt uses — all in one place.
      </p>
      {local ? (
        <>
          <AuthConnectCard onChanged={refreshConfig} />
          {/* The provider list, always-visible picker, and inline editor live
              here now (embedded from the config page) — no separate /config trip. */}
          <ModelConfigPage embedded key={configVersion} />
        </>
      ) : (
        <div className="set-card">
          <p>Model configuration is managed by this deployment.</p>
        </div>
      )}
    </div>
  );
}

function AuthConnectCard({ onChanged }: { onChanged: () => void }) {
  const PROVIDERS = [
    {
      id: "openrouter",
      name: "OpenRouter",
      sub: "OpenRouter",
      icon: "ph-compass",
    },
    { id: "xai", name: "Grok", sub: "xAI", icon: "ph-lightning" },
    {
      id: "openai-codex",
      name: "Codex",
      sub: "OpenAI",
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
    <div className="set-card auth-card">
      <div className="row2">
        <div>
          <h4>
            Sign in to a provider
          </h4>
          <p>
            Connect an account through Pi instead of pasting an API key.
          </p>
        </div>
      </div>

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
              <span className="aps">
                {connected.has(p.id) ? "Connected" : p.sub}
              </span>
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
                Pi stored the connection in its native auth file. You can now
                choose one of this provider&apos;s models below.
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
      <AutoTitleCard />
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

function RoleKbPanel() {
  return (
    <div className="set-panel">
      <h2>Role &amp; Knowledge</h2>
      <p className="sub">
        Managing roles, knowledge sets, and extra scanned paths lands in a later
        version. The pickers above the composer already cover daily use.
      </p>
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

// Reserved placeholder (owner 2026-07-24): a plain-language guide to what Alt
// can do. Marked "soon" until the copy lands, alongside the user-docs pass.
function FeaturesPanel() {
  return (
    <div className="set-panel">
      <h2>What Alt can do</h2>
      <p className="sub">
        A short guide to what Alt can help with is coming here. For now, the
        Understand and Work modes on the new-conversation screen explain the
        basics before you send your first message.
      </p>
    </div>
  );
}
