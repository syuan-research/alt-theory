import { useState } from "react";
import { generateAbComparison, type AbArmConfig } from "@/api/sessions";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";

const INHERIT = "__inherit__";
const NONE = "__none__";

interface ArmDraft {
  label: string;
  soulSlug: string;
  rolePresetSlug: string;
  kbDomain: string;
}

const emptyArm = (label: string): ArmDraft => ({
  label,
  soulSlug: INHERIT,
  rolePresetSlug: INHERIT,
  kbDomain: INHERIT,
});

function toArmConfig(arm: ArmDraft): AbArmConfig {
  const overrides: NonNullable<AbArmConfig["selectorOverrides"]> = {};
  if (arm.soulSlug !== INHERIT) {
    overrides.soulSlug = arm.soulSlug === NONE ? null : arm.soulSlug;
  }
  if (arm.rolePresetSlug !== INHERIT) {
    overrides.rolePresetSlug = arm.rolePresetSlug === NONE ? null : arm.rolePresetSlug;
  }
  if (arm.kbDomain !== INHERIT) overrides.kbDomain = arm.kbDomain;
  return {
    label: arm.label.trim() || null,
    ...(Object.keys(overrides).length ? { selectorOverrides: overrides } : {}),
  };
}

/**
 * A/B comparison setup (float-cmp, M6/M7 §5). Researcher fires it per protocol;
 * arms branch from the live conversation via the copy-fork substrate. On
 * generate, opens the side-by-side reader.
 */
export function Comparison() {
  const app = useApp();
  const shell = useShell();
  const [prompt, setPrompt] = useState("");
  const [arms, setArms] = useState<ArmDraft[]>([emptyArm("A"), emptyArm("B")]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = generating || app.isRunning;
  const canGenerate =
    app.sessionReady && !busy && prompt.trim().length > 0 && arms.length >= 2;

  const updateArm = (i: number, patch: Partial<ArmDraft>) =>
    setArms((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  const generate = async () => {
    if (!app.sessionId) return;
    setGenerating(true);
    setError(null);
    try {
      const record = await generateAbComparison(
        app.sessionId,
        prompt,
        arms.map(toArmConfig)
      );
      await app.refreshSessions();
      shell.openArms(record.comparisonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const armOption = (
    assets: Array<{ slug: string; displayName: string }>,
    allowNone: boolean
  ) => (
    <>
      <option value={INHERIT}>(inherit)</option>
      {allowNone ? <option value={NONE}>(none)</option> : null}
      {assets.map((a) => (
        <option key={a.slug} value={a.slug}>
          {a.displayName || a.slug}
        </option>
      ))}
    </>
  );

  return (
    <div className="float-cmp cmp-setup">
      <div className="t">
        <i className="ph ph-git-fork" />
        Compare responses
        <button className="close" onClick={shell.closeCompare}>
          <i className="ph ph-x" />
        </button>
      </div>
      <textarea
        className="cmp-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Prompt every arm will answer (arms branch from this conversation)"
        disabled={busy}
      />
      <div className="cmp-arms">
        {arms.map((arm, i) => (
          <div className="cmp-arm" key={i}>
            <input
              className="cmp-label"
              value={arm.label}
              onChange={(e) => updateArm(i, { label: e.target.value })}
              placeholder={`Arm ${i + 1}`}
              disabled={busy}
            />
            <select
              value={arm.rolePresetSlug}
              onChange={(e) => updateArm(i, { rolePresetSlug: e.target.value })}
              disabled={busy}
              title="Role"
            >
              {armOption(app.discovery?.rolePresets ?? [], true)}
            </select>
            <select
              value={arm.kbDomain}
              onChange={(e) => updateArm(i, { kbDomain: e.target.value })}
              disabled={busy}
              title="Knowledge base"
            >
              {armOption(app.discovery?.kbDomains ?? [], false)}
            </select>
            {arms.length > 2 ? (
              <button
                className="cmp-rm"
                onClick={() => setArms((prev) => prev.filter((_, idx) => idx !== i))}
                disabled={busy}
                title="Remove arm"
              >
                <i className="ph ph-x" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {error ? <div className="cmp-error">{error}</div> : null}
      <div className="cmp-actions">
        <button
          className="cmp-add"
          disabled={busy || arms.length >= 4}
          onClick={() =>
            setArms((prev) => [...prev, emptyArm(String.fromCharCode(65 + prev.length))])
          }
        >
          + Arm
        </button>
        <button className="go" disabled={!canGenerate} onClick={generate}>
          {generating ? "Generating…" : "Generate & read side by side"}
        </button>
      </div>
    </div>
  );
}
