import { useCallback, useEffect, useState } from "react";
import {
  chooseAbCandidate,
  fetchSessionDetail,
  generateAbComparison,
  type AbArmConfig,
} from "@/api/sessions";
import type { AbComparisonRecord } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { Select, TextArea, TextInput } from "@/components/ui/Field";
import { HintText, MonoText, SectionTitle } from "@/components/ui/Typography";
import { useApp } from "@/context/AppProvider";
import { fmtTime, shortId } from "@/lib/format";
import { cn } from "@/lib/cn";

const INHERIT = "__inherit__";
const NONE = "__none__";

interface ArmDraft {
  label: string;
  soulSlug: string; // INHERIT | NONE | slug
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
    overrides.rolePresetSlug =
      arm.rolePresetSlug === NONE ? null : arm.rolePresetSlug;
  }
  if (arm.kbDomain !== INHERIT) {
    overrides.kbDomain = arm.kbDomain;
  }
  return {
    label: arm.label.trim() || null,
    ...(Object.keys(overrides).length ? { selectorOverrides: overrides } : {}),
  };
}

/**
 * Research console (M6 floor). Hidden from participants (advanced-gated tab).
 * Trigger is manual — a researcher/RA fires it per the study protocol; when
 * A/B should fire automatically is a bottom-up decision that consolidates
 * with the concrete research design (decision doc 2026-07-16 round 3).
 * Post-choice participant questions: placeholder — panel vs popup undecided.
 */
export function ResearchPanel({ tabActive = false }: { tabActive?: boolean }) {
  const app = useApp();
  const [comparisons, setComparisons] = useState<AbComparisonRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [arms, setArms] = useState<ArmDraft[]>([
    emptyArm("A"),
    emptyArm("B"),
  ]);
  const [generating, setGenerating] = useState(false);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (!app.sessionId) {
      setComparisons([]);
      return;
    }
    try {
      const detail = await fetchSessionDetail(app.sessionId);
      setComparisons([...(detail.abComparisons ?? [])].reverse());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [app.sessionId]);

  useEffect(() => {
    if (tabActive) void refresh();
  }, [tabActive, refresh]);

  const generate = async () => {
    if (!app.sessionId) return;
    setGenerating(true);
    setError(null);
    try {
      await generateAbComparison(app.sessionId, prompt, arms.map(toArmConfig));
      setPrompt("");
      await refresh();
      await app.refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  // PRELIM continue-from-choice (decision doc 2026-07-16): record the
  // choice, then switch the mainline to the chosen arm. Ids are untouched;
  // non-chosen arms stay in the browser and the records as evidence.
  const choose = async (record: AbComparisonRecord, candidateId: string) => {
    if (!app.sessionId) return;
    setError(null);
    try {
      await chooseAbCandidate(
        app.sessionId,
        record.comparisonId,
        candidateId,
        notesDraft[record.comparisonId]?.trim() || undefined
      );
      await refresh();
      app.openCatalogSession(candidateId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const assetOptions = (
    assets: Array<{ slug: string; displayName: string }>,
    allowNone: boolean
  ) => (
    <>
      <option value={INHERIT}>(inherit)</option>
      {allowNone ? <option value={NONE}>(none)</option> : null}
      {assets.map((asset) => (
        <option key={asset.slug} value={asset.slug}>
          {asset.displayName || asset.slug}
        </option>
      ))}
    </>
  );

  const updateArm = (index: number, patch: Partial<ArmDraft>) => {
    setArms((prev) =>
      prev.map((arm, i) => (i === index ? { ...arm, ...patch } : arm))
    );
  };

  const busy = generating || app.isRunning;
  const canGenerate =
    app.sessionReady && !busy && prompt.trim().length > 0 && arms.length >= 2;

  return (
    <div className="space-y-4 overflow-auto p-3">
      <HintText>
        Researcher-triggered comparisons for this conversation, per study
        protocol. Participants do not see this tab.
      </HintText>

      <section className="space-y-2">
        <SectionTitle>New comparison</SectionTitle>
        <TextArea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Prompt every arm will answer (arms branch from the current conversation)"
          className="min-h-16"
          disabled={busy}
        />
        {arms.map((arm, index) => (
          <div
            key={index}
            className="flex flex-wrap items-center gap-1 rounded-md border border-hairline bg-surface p-1.5"
          >
            <TextInput
              value={arm.label}
              onChange={(event) => updateArm(index, { label: event.target.value })}
              className="w-14 text-[0.8125rem]"
              placeholder={`Arm ${index + 1}`}
              disabled={busy}
            />
            <Select
              className="w-auto min-w-24 text-[0.75rem]"
              value={arm.soulSlug}
              onChange={(event) => updateArm(index, { soulSlug: event.target.value })}
              title="Soul"
              disabled={busy}
            >
              {assetOptions(app.discovery?.souls ?? [], true)}
            </Select>
            <Select
              className="w-auto min-w-24 text-[0.75rem]"
              value={arm.rolePresetSlug}
              onChange={(event) =>
                updateArm(index, { rolePresetSlug: event.target.value })
              }
              title="Role preset"
              disabled={busy}
            >
              {assetOptions(app.discovery?.rolePresets ?? [], true)}
            </Select>
            <Select
              className="w-auto min-w-24 text-[0.75rem]"
              value={arm.kbDomain}
              onChange={(event) => updateArm(index, { kbDomain: event.target.value })}
              title="KB domain"
              disabled={busy}
            >
              {assetOptions(app.discovery?.kbDomains ?? [], false)}
            </Select>
            {arms.length > 2 ? (
              <Button
                variant="ghost"
                className="h-7 w-7 px-0 text-danger"
                onClick={() => setArms((prev) => prev.filter((_, i) => i !== index))}
                disabled={busy}
                title="Remove arm"
              >
                ×
              </Button>
            ) : null}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            disabled={busy || arms.length >= 4}
            onClick={() =>
              setArms((prev) => [
                ...prev,
                emptyArm(String.fromCharCode(65 + prev.length)),
              ])
            }
          >
            + Arm
          </Button>
          <Button variant="primary" disabled={!canGenerate} onClick={() => void generate()}>
            {generating ? "Generating…" : "Generate comparison"}
          </Button>
        </div>
      </section>

      {error ? <p className="text-[0.75rem] text-danger">{error}</p> : null}

      <section className="space-y-3">
        <SectionTitle>Comparisons</SectionTitle>
        {comparisons.length === 0 ? (
          <HintText>None yet for this conversation.</HintText>
        ) : (
          comparisons.map((record) => (
            <div
              key={record.comparisonId}
              className="space-y-2 rounded-md border border-hairline bg-card p-2"
            >
              <MonoText className="block text-[0.6875rem] text-text-muted">
                {fmtTime(record.createdAt)} · {shortId(record.comparisonId)}
                {record.selectedCandidateId
                  ? ` · chosen: ${
                      record.candidates.find(
                        (c) => c.candidateId === record.selectedCandidateId
                      )?.label || shortId(record.selectedCandidateId)
                    }`
                  : ""}
              </MonoText>
              {record.prompt ? (
                <p className="text-[0.75rem] text-ink">{record.prompt}</p>
              ) : null}
              {record.candidates.map((candidate) => (
                <div
                  key={candidate.candidateId}
                  className={cn(
                    "space-y-1 rounded-md border p-2",
                    record.selectedCandidateId === candidate.candidateId
                      ? "border-ink-soft bg-selected"
                      : "border-hairline bg-surface"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <MonoText className="text-[0.6875rem]">
                      {candidate.label || shortId(candidate.candidateId)}
                      {candidate.kbDomain ? ` · kb:${candidate.kbDomain}` : ""}
                      {candidate.role ? ` · ${candidate.role}` : ""}
                    </MonoText>
                    {!record.selectedCandidateId ? (
                      <Button
                        variant="secondary"
                        className="px-2 py-0.5 text-[0.6875rem]"
                        disabled={app.isRunning}
                        onClick={() => void choose(record, candidate.candidateId)}
                        title="Record this choice and continue the conversation in this arm (prelim behavior)"
                      >
                        Choose &amp; continue
                      </Button>
                    ) : null}
                  </div>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[0.6875rem] text-text-secondary">
                    {candidate.outputText || "(no output)"}
                  </pre>
                </div>
              ))}
              {!record.selectedCandidateId ? (
                <TextInput
                  value={notesDraft[record.comparisonId] ?? ""}
                  onChange={(event) =>
                    setNotesDraft((prev) => ({
                      ...prev,
                      [record.comparisonId]: event.target.value,
                    }))
                  }
                  placeholder="Notes with the choice (optional)"
                  className="text-[0.75rem]"
                />
              ) : record.notes ? (
                <HintText>Notes: {record.notes}</HintText>
              ) : null}
            </div>
          ))
        )}
        <HintText>
          Post-choice participant questions: not designed yet (same panel vs
          dialog undecided — waits for the study protocol).
        </HintText>
      </section>
    </div>
  );
}
