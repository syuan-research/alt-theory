import { useApp } from "@/context/AppProvider";
import { t } from "@/i18n";

/**
 * How full the conversation's context is (v1.3.0-alpha.3).
 *
 * The backend has published this all along (session-metrics.ts →
 * SessionMetrics.contextUsage); nothing in the UI showed it, so a compaction
 * always arrived as a surprise. A ring, not a number: the question being
 * answered is "how much room is left", not "how many tokens".
 */
export function ContextRing() {
  const metrics = useApp().metrics;
  const usage = metrics?.contextUsage;
  if (!metrics) return null;
  // Unknown is a state, not an absence: right after a compaction the fill is
  // unknown until the next reply reports usage. Draw the ring empty, say so.
  if (!usage || usage.percent === null) {
    return (
      <span
        className="ctx-ring unknown"
        data-tip-title={t("Context usage")}
        data-tip={t("Context usage is unknown until the next reply.")}
      >
        <span className="ctx-ring-dial" style={{ ["--pct" as string]: "0deg" }} />
        –
      </span>
    );
  }

  const percent = Math.max(0, Math.min(100, Math.round(usage.percent)));
  const tone = percent >= 90 ? "danger" : percent >= 75 ? "warn" : "";
  const tokens = usage.tokens ?? 0;
  // Cost rides along in the tooltip: an unattended job that flails for an hour
  // is exactly the surprise both user lenses named as a reason to stop paying.
  // The styled tooltip (data-tip) honors \n via white-space: pre-line, so the
  // fill line and the cost line stay separate paragraphs.
  const cost = metrics?.cost
    ? `\nThis conversation has cost about $${metrics.cost.toFixed(2)} so far.`
    : "";

  return (
    <span
      className={`ctx-ring ${tone}`}
      data-tip-title={t("Context usage")}
      data-tip={`Context ${percent}% full — ${tokens.toLocaleString()} of ${usage.contextWindow.toLocaleString()} tokens. Older messages are summarized automatically when it fills up.${cost}`}
    >
      <span
        className="ctx-ring-dial"
        style={{ ["--pct" as string]: `${percent * 3.6}deg` }}
      />
      {percent}%
    </span>
  );
}
