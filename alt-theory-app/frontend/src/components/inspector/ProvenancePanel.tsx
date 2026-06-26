import { useCallback, useEffect, useState } from "react";
import { fetchSessionDetail } from "@/api/sessions";
import type { DiscoveryLists, SessionDetailResponse } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { HintText, MonoText, SectionTitle } from "@/components/ui/Typography";
import { displayKb } from "@/lib/manifest";

interface ProvenancePanelProps {
  sessionId: string | null;
  sessionReady: boolean;
  discovery?: DiscoveryLists | null;
  tabActive?: boolean;
}

function ProvenanceItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-surface px-2 py-1.5">
      <p className="text-[0.75rem] font-semibold text-text-secondary">{label}</p>
      <MonoText className="block break-words">{value || "—"}</MonoText>
    </div>
  );
}

export function ProvenancePanel({
  sessionId,
  sessionReady,
  discovery,
  tabActive = false,
}: ProvenancePanelProps) {
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setDetail(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await fetchSessionDetail(sessionId);
      setDetail(next);
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : "Could not load provenance.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (tabActive) void refresh();
  }, [tabActive, refresh]);

  const effective = detail?.effectiveConfig;
  const warnings = [
    ...(detail?.session?.warnings || []),
    ...(detail?.warnings || []),
  ].filter((value, index, array) => value && array.indexOf(value) === index);

  const summaryItems: Array<[string, string]> = detail
    ? [
        ["Project", detail.session.projectId || "none"],
        ["Branch", detail.activeBranch?.branchId || "main"],
        ["Workspace", detail.activeBranch?.workspaceMode || "shared"],
        ["Role", effective?.rolePresetSlug || "none"],
        ["Soul", effective?.soulSlug || "none"],
        ["KB", displayKb(effective?.kbDomain || "all", discovery)],
        ["Instruction", effective?.customInstruction?.ref || "none"],
        ["Warnings", warnings.length ? warnings.join(" | ") : "none"],
      ]
    : [];

  const runs = Array.isArray(detail?.runs)
    ? detail.runs.slice(-8).reverse()
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>Effective Configuration</SectionTitle>
        <Button
          variant="ghost"
          className="min-h-7 px-2 text-[0.75rem]"
          onClick={() => void refresh()}
          disabled={!sessionReady || !sessionId || loading}
          title="Refresh provenance"
        >
          ↻
        </Button>
      </div>

      {!sessionId ? (
        <HintText>No session selected.</HintText>
      ) : loading && !detail ? (
        <HintText>Loading...</HintText>
      ) : error ? (
        <HintText className="text-danger">{error}</HintText>
      ) : (
        <div className="space-y-2">
          {summaryItems.map(([label, value]) => (
            <ProvenanceItem key={label} label={label} value={value} />
          ))}
        </div>
      )}

      <div className="space-y-2">
        <SectionTitle>Recent Runs</SectionTitle>
        {!sessionId ? (
          <HintText>No run history.</HintText>
        ) : runs.length === 0 ? (
          <HintText>No run history.</HintText>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <ProvenanceItem
                key={run.runId}
                label={`${run.status} ${run.runId}`}
                value={`${run.branchId} | ${run.turnId} | ${run.revisionId}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}