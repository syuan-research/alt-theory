import { useEffect, useRef, useState } from "react";

export interface MenuSelectOption {
  value: string;
  label: string;
}

/** 复用 .menu 模式的下拉选择，替换原生 <select>（OS 弹层不吃应用主题）。
 *  交互与 Composer 的 .menu 一致：Esc / 点击外部关闭；行、勾选、hover 走既有样式。 */
export function MenuSelect(props: {
  value: string;
  options: MenuSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const { value, options, onChange, ariaLabel, disabled } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((option) => option.value === value);
  return (
    <span className="msel" ref={rootRef}>
      <button
        type="button"
        className="msel-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className="msel-label">{current ? current.label : value}</span>
        <i className="ph ph-caret-down" aria-hidden="true" />
      </button>
      <div className={`menu msel-menu${open ? " on" : ""}`}>
        {options.map((option) => (
          <div
            key={option.value}
            className="mi"
            onClick={() => {
              setOpen(false);
              if (option.value !== value) onChange(option.value);
            }}
          >
            <span>{option.label}</span>
            {option.value === value ? <i className="ph ph-check check" aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
    </span>
  );
}
