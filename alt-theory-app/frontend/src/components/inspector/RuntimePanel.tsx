import type { AssemblyManifest, DiscoveryLists, SessionMetrics } from "@/api/types";
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
        <SectionTitle>Runtime</SectionTitle>
        <Button
          variant="ghost"
          className="min-h-7 px-2 text-[0.75rem]"
          onClick={onRefresh}
          disabled={disabled}
          title="Refresh metadata & metrics"
        >
          ↻
        </Button>
      </div>

      <section className="space-y-1">
        <p className="text-[0.75rem] font-semibold text-text-secondary">
          Session ID
        </p>
        <MonoText
          className="block break-all"
          title={sessionId ?? undefined}
        >
          {sessionId ?? "draft"}
        </MonoText>
      </section>

      <section className="space-y-1">
        <p className="text-[0.75rem] font-semibold text-text-secondary">
          Connection Status
        </p>
        <StatusBadge status={connStatus} label={connLabel} />
      </section>

      <section className="space-y-1">
        <p className="text-[0.75rem] font-semibold text-text-secondary">
          Active KB / Soul / Role
        </p>
        <MonoText className="block">{displayKb(kbDomain, discovery)}</MonoText>
        <MonoText className="block">{displaySlug(soulSlug)}</MonoText>
        <MonoText className="block">{displaySlug(roleSlug)}</MonoText>
      </section>

      <section className="space-y-1">
        <p className="text-[0.75rem] font-semibold text-text-secondary">
          Model / Provider
        </p>
        <MonoText className="block">{manifest?.model ?? "—"}</MonoText>
        <MonoText className="block">{manifest?.provider ?? "—"}</MonoText>
      </section>

      <section className="space-y-2">
        <p className="text-[0.75rem] font-semibold text-text-secondary">
          Counters
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <MetricRow label="Turns" value={formatNumber(metrics?.turnCount)} />
          <MetricRow
            label="Messages"
            value={formatNumber(metrics?.messageCount)}
          />
          <MetricRow
            label="Tool Calls"
            value={formatNumber(metrics?.toolCallCount)}
          />
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-[0.75rem] font-semibold text-text-secondary">
          Tokens
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <MetricRow label="Input" value={formatNumber(metrics?.tokens.input)} />
          <MetricRow label="Output" value={formatNumber(metrics?.tokens.output)} />
          <MetricRow
            label="Cache Read"
            value={formatNumber(metrics?.tokens.cacheRead)}
          />
          <MetricRow
            label="Cache Write"
            value={formatNumber(metrics?.tokens.cacheWrite)}
          />
          <MetricRow label="Total" value={formatNumber(metrics?.tokens.total)} />
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-[0.75rem] font-semibold text-text-secondary">
          Context
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <MetricRow
            label="Tokens"
            value={formatNumber(metrics?.contextUsage?.tokens)}
          />
          <MetricRow
            label="Window"
            value={formatNumber(metrics?.contextUsage?.contextWindow)}
          />
          <MetricRow
            label="Usage"
            value={
              metrics?.contextUsage?.percent != null
                ? `${metrics.contextUsage.percent.toFixed(1)}%`
                : "—"
            }
          />
        </div>
      </section>

      <section className="space-y-1">
        <p className="text-[0.75rem] font-semibold text-text-secondary">Cost</p>
        <MonoText>{formatCost(metrics?.cost)}</MonoText>
      </section>

      <section className="space-y-2">
        <p className="text-[0.75rem] font-semibold text-text-secondary">
          Core-Soul Modules
        </p>
        {manifest?.coreSoul?.modules?.length ? (
          <div className="space-y-2">
            {manifest.coreSoul.modules.map((mod) => (
              <div
                key={`${mod.slug}-${mod.variable}`}
                className="rounded-md border border-hairline bg-surface px-2 py-1.5"
              >
                <MonoText className="block font-semibold text-ink">
                  {mod.slug}
                </MonoText>
                <HintText className="text-text-secondary">{mod.variable}</HintText>
                <MonoText className="block break-all">{mod.value}</MonoText>
              </div>
            ))}
          </div>
        ) : (
          <MonoText>—</MonoText>
        )}
      </section>

      {!manifest && !metrics ? (
        <HintText>
          Metadata appears after a session is materialized or when you refresh.
        </HintText>
      ) : null}
    </div>
  );
}
