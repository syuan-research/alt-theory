import { useEffect, useState } from "react";
import type { ProviderView, ThinkingLevel } from "@/api/types";
import { listConfigProviders } from "@/api/config";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";

interface ModelOption {
  provider: string;
  modelId: string;
  label: string;
  reasoning: boolean;
}

const THINKING_LEVELS: ThinkingLevel[] = ["off", "low", "high"];

function flatten(providers: ProviderView[]): ModelOption[] {
  const out: ModelOption[] = [];
  for (const p of providers) {
    if (!p.hasKey && p.keyState !== "env-set") continue;
    for (const m of p.models) {
      out.push({
        provider: p.name,
        modelId: m.id,
        label: m.name || m.id,
        reasoning: m.reasoning ?? false,
      });
    }
  }
  return out;
}

/** Model chip + dropdown (M7 §3), backed by WS set_session_model. */
export function ModelChip({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const app = useApp();
  const shell = useShell();
  const [options, setOptions] = useState<ModelOption[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || options || error) return;
    let cancelled = false;
    listConfigProviders()
      .then((res) => {
        if (!cancelled) setOptions(flatten(res.providers));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, options, error]);

  const current = app.modelOverride;
  const defaultLabel = app.localConfig?.activeModel
    ? `Default · ${app.localConfig.activeModel}`
    : "Default model";
  const label = current
    ? current.thinkingLevel && current.thinkingLevel !== "off"
      ? `${current.modelId} · ${current.thinkingLevel}`
      : current.modelId
    : defaultLabel;

  const pick = (opt: ModelOption, thinkingLevel?: ThinkingLevel) => {
    app.setSessionModel({
      provider: opt.provider,
      modelId: opt.modelId,
      ...(thinkingLevel ? { thinkingLevel } : {}),
    });
    onToggle();
  };

  const isActive = (opt: ModelOption) =>
    current?.provider === opt.provider && current?.modelId === opt.modelId;

  return (
    <>
      <button
        className="flat"
        style={{ marginLeft: "auto" }}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        disabled={!app.sessionReady}
      >
        {label}
        <i className="ph ph-caret-down caret" />
      </button>
      <div
        className={`menu${open ? " on" : ""}`}
        style={{ right: 40, bottom: 36, left: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mi" onClick={() => (app.setSessionModel(null), onToggle())}>
          <span style={{ fontWeight: current ? 400 : 500 }}>{defaultLabel}</span>
          {!current ? <i className="ph ph-check check" /> : null}
        </div>
        <div className="sep" />
        {error ? (
          <div className="rp-empty" style={{ padding: "8px 10px" }}>
            Models unavailable here.
          </div>
        ) : !options ? (
          <div className="rp-empty" style={{ padding: "8px 10px" }}>
            Loading…
          </div>
        ) : options.length === 0 ? (
          <div className="rp-empty" style={{ padding: "8px 10px" }}>
            No models configured.
          </div>
        ) : (
          options.map((opt) => (
            <div
              key={`${opt.provider}:${opt.modelId}`}
              className="mi"
              onClick={() => pick(opt)}
            >
              <span style={{ fontWeight: isActive(opt) ? 500 : 400 }}>
                {opt.label}
              </span>
              {opt.reasoning && isActive(opt) ? (
                <span className="think">
                  <span className="levels">
                    {THINKING_LEVELS.map((lvl) => (
                      <span
                        key={lvl}
                        className={
                          (current?.thinkingLevel ?? "off") === lvl ? "on" : ""
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          pick(opt, lvl);
                        }}
                      >
                        {lvl}
                      </span>
                    ))}
                  </span>
                </span>
              ) : null}
              {isActive(opt) ? <i className="ph ph-check check" /> : null}
            </div>
          ))
        )}
        <div className="sep" />
        <div className="mi" onClick={() => shell.openSettings("models")}>
          <i className="ph ph-cpu" />
          Manage models
        </div>
      </div>
    </>
  );
}
