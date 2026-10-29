import altTheoryMark from "@/assets/alt-theory-mark.svg";
import { t } from "@/i18n";

export function BrandMark({ count }: { count: number }) {
  const label = count > 0
    ? t("Running or waiting for approval: {count}", { count })
    : t("Alt Theory");
  return (
    <span className="brand-activity" role="img" aria-label={label} data-tip={count > 0 ? label : undefined}>
      <span
        className={`brand-mark${count > 0 ? " brand-mark-active" : ""}`}
        style={{ maskImage: `url(${altTheoryMark})`, WebkitMaskImage: `url(${altTheoryMark})` }}
        aria-hidden="true"
      />
      {count > 0 ? <span className="brand-count" aria-hidden="true">{count}</span> : null}
    </span>
  );
}
