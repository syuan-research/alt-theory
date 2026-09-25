import { useEffect, useState } from "react";
import { fetchSessionDetail } from "@/api/sessions";
import type { AbComparisonRecord } from "@/api/types";
import { useMainView } from "@/context/MainView";
import { useShell } from "@/context/ShellContext";
import { fmtTime, shortId } from "@/lib/format";
import { t } from "@/i18n";

/**
 * Review page (M7 §2): reads the records layer only. v1-alpha reads the loaded
 * session's comparison records; a cross-study aggregate endpoint is a later
 * backend addition (see researcher-console.md).
 */
export function ReviewPage() {
  const main = useMainView();
  const shell = useShell();
  // Records are read when the page opens, not kept fresh behind every
  // conversation event (perf plan WP 1.3).
  const target = main.selectedCatalogSessionId;
  const [comparisons, setComparisons] = useState<AbComparisonRecord[]>([]);
  useEffect(() => {
    let live = true;
    setComparisons([]);
    if (target) {
      fetchSessionDetail(target).then(
        (detail) => live && setComparisons(detail.abComparisons ?? []),
        () => {},
      );
    }
    return () => {
      live = false;
    };
  }, [target]);

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
        <h2>{t("Review")}</h2>
        <p className="sub">
          {t("Comparisons and records for the open conversation. Reads records only; nothing here touches live conversations.")}
        </p>
        <div className="filters">
          <button className="export" onClick={shell.openApp}>
            <i className="ph ph-arrow-left" />
            {t("Back to app")}
          </button>
        </div>
        {comparisons.length === 0 ? (
          <div className="rp-empty">
            {t("No comparison records for this conversation.")}
          </div>
        ) : (
          <table className="review">
            <tbody>
              <tr>
                <th>{t("Comparison")}</th>
                <th>{t("Created")}</th>
                <th>{t("Arms")}</th>
                <th>{t("Chosen")}</th>
                <th>{t("Decided")}</th>
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
