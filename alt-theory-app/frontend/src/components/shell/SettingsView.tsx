import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ProviderView } from "@/api/types";
import {
  getAutoTitleSettings,
  listConfigProviders,
  saveAutoTitleSettings,
  type AutoTitleSettings,
} from "@/api/config";
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
  const navigate = useNavigate();
  const [providers, setProviders] = useState<ProviderView[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listConfigProviders()
      .then((res) => !cancelled && setProviders(res.providers))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="set-panel">
      <h2>Models</h2>
      <p className="sub">
        Providers and models Alt can use. Also reachable from the model selector
        in any conversation.
      </p>
      <div className="set-card">
        {error ? (
          <p>Model configuration is managed by this deployment.</p>
        ) : !providers ? (
          <p>Loading…</p>
        ) : providers.length === 0 ? (
          <p>No providers configured yet.</p>
        ) : (
          providers.map((p) => (
            <div
              className={`model-row${app.appMode === "local" ? " clickable" : ""}`}
              key={p.name}
              role={app.appMode === "local" ? "button" : undefined}
              onClick={
                app.appMode === "local" ? () => navigate("/config") : undefined
              }
            >
              <div>
                <div className="name">{p.name}</div>
                <div className="meta">
                  {p.hasKey || p.keyState === "env-set"
                    ? `${p.models.length} model${p.models.length === 1 ? "" : "s"}`
                    : "Not configured"}
                </div>
              </div>
              {p.active ? <span className="default">default</span> : null}
              {app.appMode === "local" ? (
                <i className="ph ph-caret-right caret" aria-hidden="true" />
              ) : null}
            </div>
          ))
        )}
        {app.appMode === "local" ? (
          <button className="add-btn" onClick={() => navigate("/config")}>
            <i className="ph ph-plus" />
            Manage providers
          </button>
        ) : null}
      </div>
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
  return (
    <div className="set-panel">
      <h2>About</h2>
      <p className="sub">Alt Theory, v1 alpha.</p>
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
