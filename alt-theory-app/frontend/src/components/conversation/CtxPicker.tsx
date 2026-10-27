import type { ReactNode } from "react";
import { PendingMark } from "@/components/ui/PendingMark";

/** A compact composer picker: icon, ellipsized label and a menu under it. */
export function CtxPicker({
  className = "",
  icon,
  label,
  open,
  onToggle,
  disabled = false,
  pending = false,
  children,
}: {
  className?: string;
  icon: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Show the mid-run pending mark beside the label. */
  pending?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`ctx-picker ${className}`}>
      <button
        className="ctx-item"
        data-tip={label}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        <i className={`ph ${icon}`} />
        <span className="ctx-label">{label}</span>
        <PendingMark when={pending} />
        <i className="ph ph-caret-down caret" />
      </button>
      <div
        className={`menu${open ? " on" : ""}`}
        style={{ left: 0, bottom: "auto", top: 22 }}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </span>
  );
}
