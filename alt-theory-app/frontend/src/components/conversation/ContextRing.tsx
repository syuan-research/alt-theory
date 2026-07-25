import { useApp } from "@/context/AppProvider";

/**
 * How full the conversation's context is (v1.3.0-alpha.3).
 *
 * The backend has published this all along (session-metrics.ts →
 * SessionMetrics.contextUsage); nothing in the UI showed it, so a compaction
 * always arrived as a surprise. A ring, not a number: the question being
 * answered is "how much room is left", not "how many tokens".
 */
export function ContextRing() {
  const usage = useApp().metrics?.contextUsage;
  if (!usage || usage.percent === null) return null;

  const percent = Math.max(0, Math.min(100, Math.round(usage.percent)));
  const tone = percent >= 90 ? "danger" : percent >= 75 ? "warn" : "";
  const tokens = usage.tokens ?? 0;

  return (
    <span
      className={`ctx-ring ${tone}`}
      title={`Context ${percent}% full — ${tokens.toLocaleString()} of ${usage.contextWindow.toLocaleString()} tokens. Older messages are summarized automatically when it fills up.`}
    >
      <span
        className="ctx-ring-dial"
        style={{ ["--pct" as string]: `${percent * 3.6}deg` }}
      />
      {percent}%
    </span>
  );
}
