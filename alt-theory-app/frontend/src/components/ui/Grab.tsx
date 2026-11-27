import { useRef } from "react";
import { t } from "@/i18n";

/**
 * A fold handle (owner 2026-11-26/27): click to fold or unfold, or drag
 * toward where the block folds (`up` for the left list's desks, `down` for
 * the composer) and back to unfold.
 */
export function Grab({ folded, onFold, toward, className }: { folded: boolean; onFold: (next: boolean) => void; toward: "up" | "down"; className: string }) {
  const from = useRef<number | null>(null);
  const label = folded ? t("Unfold") : t("Fold");
  return (
    <span
      className={className}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-expanded={!folded}
      data-tip={label}
      onPointerDown={(event) => { from.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerUp={(event) => {
        const start = from.current;
        from.current = null;
        if (start === null) return;
        const dy = (event.clientY - start) * (toward === "up" ? -1 : 1);
        if (Math.abs(dy) < 4) onFold(!folded);
        else if (dy > 8) onFold(true);
        else if (dy < -8) onFold(false);
      }}
      onPointerCancel={() => { from.current = null; }}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onFold(!folded); } }}
    />
  );
}
