import { useEffect, useState } from "react";
import type { AbComparisonRecord } from "@/api/types";
import { chooseAbCandidate, fetchSessionDetail } from "@/api/sessions";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { shortId } from "@/lib/format";

/**
 * Full-width side-by-side reader of an A/B comparison (M6/M7 §5). "Continue with
 * this response" records the choice and switches the mainline to that arm
 * (prelim continue-from-choice); non-chosen arms stay as evidence.
 */
export function ArmSplit() {
  const app = useApp();
  const shell = useShell();
  const comparisonId = shell.armsComparisonId;
  const [record, setRecord] = useState<AbComparisonRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    if (!app.sessionId || !comparisonId) return;
    let cancelled = false;
    fetchSessionDetail(app.sessionId)
      .then((detail) => {
        if (cancelled) return;
        const found = (detail.abComparisons ?? []).find(
          (c) => c.comparisonId === comparisonId
        );
        setRecord(found ?? null);
        if (!found) setError("Comparison not found.");
      })
      .catch((e) => !cancelled && setError(e?.message ?? "Failed to load comparison"));
    return () => {
      cancelled = true;
    };
  }, [app.sessionId, comparisonId]);

  const choose = async (candidateId: string) => {
    if (!app.sessionId || !record) return;
    setChoosing(true);
    try {
      await chooseAbCandidate(app.sessionId, record.comparisonId, candidateId);
      await app.refreshSessions();
      shell.closeArms();
      app.openCatalogSession(candidateId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to choose");
      setChoosing(false);
    }
  };

  if (error) {
    return (
      <div className="arm-split">
        <div className="rp-empty" style={{ margin: "auto" }}>
          {error}{" "}
          <button className="cmp-add" onClick={shell.closeArms}>
            Close
          </button>
        </div>
      </div>
    );
  }
  if (!record) {
    return (
      <div className="arm-split">
        <div className="rp-empty" style={{ margin: "auto" }}>
          Loading comparison…
        </div>
      </div>
    );
  }

  const decided = Boolean(record.selectedCandidateId);

  return (
    <div className="arm-split">
      {record.candidates.map((cand, i) => {
        const chosen = record.selectedCandidateId === cand.candidateId;
        return (
          <div className="arm-pane" key={cand.candidateId}>
            <div className="ah">
              <i className="ph ph-user-circle" />
              {cand.label || `Arm ${i + 1}`}
              {cand.role ? ` · ${cand.role}` : ""}
              {chosen ? <span className="badge-run">chosen</span> : null}
              {i === record.candidates.length - 1 ? (
                <button className="close" onClick={shell.closeArms} title="Close">
                  <i className="ph ph-x" />
                </button>
              ) : null}
            </div>
            <div className="ab">{cand.outputText || "(no output)"}</div>
            <div className="af">
              <button
                disabled={decided || choosing}
                onClick={() => choose(cand.candidateId)}
                title="Record this choice and continue the conversation in this arm"
              >
                {chosen
                  ? "Chosen"
                  : decided
                    ? shortId(record.selectedCandidateId ?? "")
                    : "Continue with this response"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
