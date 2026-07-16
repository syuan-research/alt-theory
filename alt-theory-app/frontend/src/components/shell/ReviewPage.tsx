import { useMemo } from "react";
import type { AbComparisonRecord } from "@/api/types";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { fmtTime, shortId } from "@/lib/format";

/**
 * Review page (M7 §2): reads the records layer only. v1-alpha reads the loaded
 * session's comparison records; a cross-study aggregate endpoint is a later
 * backend addition (see researcher-console.md).
 */
export function ReviewPage() {
  const app = useApp();
  const shell = useShell();
  const comparisons = useMemo<AbComparisonRecord[]>(
    () => app.selectedSessionDetail?.abComparisons ?? [],
    [app.selectedSessionDetail]
  );

  const chosenLabel = (rec: AbComparisonRecord): string | null => {
    if (!rec.selectedCandidateId) return null;
    const c = rec.candidates.find((x) => x.candidateId === rec.selectedCandidateId);
    return c?.label || shortId(rec.selectedCandidateId);
  };
  const armsLabel = (rec: AbComparisonRecord): string =>
    rec.candidates.map((c) => c.label || c.role || "arm").join(" vs ");

  return (
    <div className="page">
      <div className="page-inner">
        <h2>Review</h2>
        <p className="sub">
          Comparisons and records for the open conversation. Reads records only;
          nothing here touches live conversations.
        </p>
        <div className="filters">
          <button className="export" onClick={shell.openApp}>
            <i className="ph ph-arrow-left" />
            Back to app
          </button>
        </div>
        {comparisons.length === 0 ? (
          <div className="rp-empty">
            No comparison records for this conversation.
          </div>
        ) : (
          <table className="review">
            <tbody>
              <tr>
                <th>Comparison</th>
                <th>Created</th>
                <th>Arms</th>
                <th>Chosen</th>
                <th>Decided</th>
              </tr>
              {comparisons.map((rec) => {
                const chosen = chosenLabel(rec);
                return (
                  <tr key={rec.comparisonId}>
                    <td>{shortId(rec.comparisonId)}</td>
                    <td>{fmtTime(rec.createdAt)}</td>
                    <td>{armsLabel(rec)}</td>
                    <td className={chosen ? "chosen" : undefined}>
                      {chosen ?? "undecided"}
                    </td>
                    <td>{rec.decidedAt ? fmtTime(rec.decidedAt) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
