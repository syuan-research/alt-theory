import { t } from "@/i18n";

/** Quiet marker next to a switch accepted mid-run: it applies when the turn ends. */
export function PendingMark({ when }: { when: boolean }) {
  if (!when) return null;
  return (
    <i
      className="ph ph-clock"
      style={{ opacity: 0.6, marginLeft: 4 }}
      data-tip={t("Applies after this turn")}
      aria-label={t("Applies after this turn")}
    />
  );
}
