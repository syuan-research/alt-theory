import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SectionTitle } from "./Typography";

interface PanelProps {
  title?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({
  title,
  headerActions,
  children,
  className,
  bodyClassName,
}: PanelProps) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-panel",
        className
      )}
    >
      {title || headerActions ? (
        <header className="flex items-center justify-between gap-2 px-3 py-2.5">
          {title ? <SectionTitle>{title}</SectionTitle> : <span />}
          {headerActions ? <div className="shrink-0">{headerActions}</div> : null}
        </header>
      ) : null}
      <div className={cn("min-h-0 flex-1 overflow-auto p-3", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
