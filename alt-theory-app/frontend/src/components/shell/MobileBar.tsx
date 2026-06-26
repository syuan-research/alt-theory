import { BrandTitle } from "@/components/ui/Typography";
import { cn } from "@/lib/cn";

interface MobileBarProps {
  onToggleLeft: () => void;
  onToggleRight: () => void;
  authLabel?: string;
  className?: string;
}

export function MobileBar({
  onToggleLeft,
  onToggleRight,
  authLabel,
  className,
}: MobileBarProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between border-b border-hairline bg-panel px-4 py-2.5 lg:hidden",
        className
      )}
    >
      <button
        type="button"
        className="rounded-md px-2 py-1 text-[1rem] text-text-secondary hover:bg-hover"
        onClick={onToggleLeft}
        title="Session / Config"
      >
        ☰
      </button>
      <BrandTitle className="text-[1.125rem]">
        Alt Theory{" "}
        <span
          className="align-middle rounded-md bg-card px-1.5 py-0.5 font-[family-name:var(--font-ui)] text-[0.6875rem] font-medium text-text-muted"
          title="v0.5.6 local bundle test UI. Visual polish is still in progress."
        >
          v0.5.6 test UI
        </span>
      </BrandTitle>
      <div className="flex items-center gap-2">
        {authLabel ? (
          <span
            className="max-w-24 truncate text-[0.75rem] text-text-muted"
            title={authLabel}
          >
            {authLabel}
          </span>
        ) : null}
        <button
          type="button"
          className="rounded-md px-2 py-1 text-[1rem] text-text-secondary hover:bg-hover"
          onClick={onToggleRight}
          title="Runtime Inspector"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
