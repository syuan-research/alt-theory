import type { AssemblyManifest, DiscoveryLists, SessionMetrics } from "@/api/types";
import { t } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { StatusBadge, type ConnStatus } from "@/components/ui/StatusBadge";
import { HintText, MonoText, SectionTitle } from "@/components/ui/Typography";
import { formatCost, formatNumber } from "@/lib/format";
import { displayKb, displaySlug } from "@/lib/manifest";
interface RuntimePanelProps {
  sessionId: string | null;
  connStatus: ConnStatus;
  connLabel: string;
  manifest: AssemblyManifest | null;
  currentDomain?: string | null;
  metrics: SessionMetrics | null;
  approvalMarkers?: string[];
  discovery?: DiscoveryLists | null;
  onRefresh: () => void;
  disabled?: boolean;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-[0.75rem] text-text-muted">{label}</span>
      <MonoText className="text-right">{value}</MonoText>
    </>
  );
}

export function RuntimePanel({
  sessionId,
  connStatus,
  connLabel,
  manifest,
  currentDomain,
  metrics,
  approvalMarkers = [],
  discovery,
  onRefresh,
  disabled,
}: RuntimePanelProps) {
  const kbDomain =
    currentDomain || manifest?.kb?.domain || manifest?.kbDomain || null;
  const soulSlug = manifest?.soul?.slug ?? null;
  const roleSlug = manifest?.rolePreset?.slug ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>{t("Runtime")}</SectionTitle>
        <Button
          variant="ghost"
          className="min-h-7 px-2 text-[0.75rem]"
          onClick={onRefresh}
          disabled={disabled}
          title={t("Refresh metadata & metrics")}
        >
          ↻
        </Button>
      </div>

      <section className="space-y-1">
        <p className="text-[0.75rem] font-semibold text-text-secondary">
          {t("Session ID")}
        </p>
        <MonoText
          className="block break-all"
          title={sessionId ?? undefined}
        >
          {sessionId ?? t("draft")}
        </MonoText>
      </section>

      <section className="space-y-1">
        <p className="text-[0.75rem] font-semibold text-text-secondary">
          {t("Connection Status")}
        </p>
        <StatusBadge status={connStatus} label={connLabel} />
      </section>

      <section className="space-y-1">
        <p className="text-[0.75rem] font-semibold text-text-secondary">
          {t("Active KB / Soul / Role")}
        </p>
        <MonoText className="block">{displayKb(kbDomain, discovery)}</MonoText>
        <MonoText className="block">{displaySlug(soulSlug)}</MonoText>
        <MonoText className="block">{displaySlug(roleSlug)}</MonoText>
      </section>

      <section className="space-y-1">
        <p className="text-[0.75rem] font-semibold text-text-secondary">
          {t("Model / Provider")}
        </p>
        <MonoText className="block">{manifest?.model ?? "—"}</MonoText>
        <MonoText className="block">{manifest?.provider ?? "—"}</MonoText>
      </section>

      <section className="space-y-2">
        <p className="text-[0.75rem] font-semibold text-text-secondary">
          {t("Counters")}
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <MetricRow label={t("Turns")} value={formatNumber(metrics?.turnCount)} />
          <MetricRow
            label={t("Messages")}
            value={formatNumber(metrics?.messageCount)}
          />
          <MetricRow
            label={t("Tool Calls")}
            value={formatNumber(metrics?.toolCallCount)}
          />
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-[0.75rem] font-semibold text-text-secondary">
          {t("Tokens")}
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <MetricRow label={t("Input")} value={formatNumber(metrics?.tokens.input)} />
          <MetricRow label={t("Output")} value={formatNumber(metrics?.tokens.output)} />
          <MetricRow
            label={t("Cache Read")}
            value={formatNumber(metrics?.tokens.cacheRead)}
          />
          <MetricRow
            label={t("Cache Write")}
            value={formatNumber(metrics?.tokens.cacheWrite)}
          />
          <MetricRow label={t("Total")} value={formatNumber(metrics?.tokens.total)} />
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-[0.75rem] font-semibold text-text-secondary">
          {t("Context")}
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <MetricRow
            label={t("Tokens")}
            value={formatNumber(metrics?.contextUsage?.tokens)}
          />
          <MetricRow
            label={t("Window")}
            value={formatNumber(metrics?.contextUsage?.contextWindow)}
          />
          <MetricRow
            label={t("Usage")}
            value={
              metrics?.contextUsage?.percent != null
                ? `${metrics.contextUsage.percent.toFixed(1)}%`
                : "—"
            }
          />
        </div>
      </section>

      <section className="space-y-1">
        <p className="text-[0.75rem] font-semibold text-text-secondary">{t("Cost")}</p>
        <MonoText>{formatCost(metrics?.cost)}</MonoText>
      </section>

      {approvalMarkers.length > 0 ? (
        <details className="text-[0.75rem] text-text-muted">
          <summary className="cursor-pointer">{t("Conversation permissions")}</summary>
          <ul className="mt-2 space-y-1 pl-4">
            {approvalMarkers.map((marker) => (
              <li key={marker}>{marker}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {!manifest && !metrics ? (
        <HintText>
          {t("Metadata appears after a session is materialized or when you refresh.")}
        </HintText>
      ) : null}
    </div>
  );
}
