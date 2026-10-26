import type { TranscriptMessage } from "@/api/types";
import { t } from "@/i18n";

export function ApprovalMark({ approval }: { approval?: TranscriptMessage["approval"] }) {
  if (!approval) return null;
  const title = [
    approval.outcome === "allow" ? t("Smart approval: allowed") : t("Smart approval: denied"),
    approval.reused ? t("Reused an earlier approval in this conversation.") : null,
    approval.reason,
    approval.model ? t("Reviewer: {model}", { model: approval.model }) : null,
  ].filter(Boolean).join("\n");
  return <span className={`approval-mark${approval.outcome === "deny" ? " danger" : ""}`}
    data-tip={title} aria-label={title} tabIndex={0}>
    <i className="ph ph-shield-star" aria-hidden="true" />
  </span>;
}
