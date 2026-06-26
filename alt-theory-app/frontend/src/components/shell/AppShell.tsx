import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface AppShellProps {
  mobileBar?: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  mobilePanel: "left" | "right" | null;
  resizing: "left" | "right" | null;
  onBeginResizeLeft: (clientX: number) => void;
  onBeginResizeRight: (clientX: number) => void;
  onRestoreLeft: () => void;
  onRestoreRight: () => void;
  onCloseMobilePanels: () => void;
}

function PaneResizer({
  hidden,
  dragging,
  onMouseDown,
}: {
  hidden?: boolean;
  dragging?: boolean;
  onMouseDown: (clientX: number) => void;
}) {
  if (hidden) return null;
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={cn(
        "hidden w-[5px] shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-hover lg:block",
        dragging && "bg-hover"
      )}
      onMouseDown={(event) => onMouseDown(event.clientX)}
      title="Resize pane"
    />
  );
}

export function AppShell({
  mobileBar,
  left,
  center,
  right,
  leftWidth,
  rightWidth,
  leftCollapsed,
  rightCollapsed,
  mobilePanel,
  resizing,
  onBeginResizeLeft,
  onBeginResizeRight,
  onRestoreLeft,
  onRestoreRight,
  onCloseMobilePanels,
}: AppShellProps) {
  const layoutStyle = {
    "--left-width": `${leftWidth}px`,
    "--right-width": `${rightWidth}px`,
  } as CSSProperties;

  return (
    <div className="flex h-full min-h-0 flex-col" style={layoutStyle}>
      {mobileBar}
      <div className="relative flex min-h-0 flex-1">
        <aside
          className={cn(
            "flex min-h-0 shrink-0 flex-col border-r border-hairline bg-panel",
            "max-lg:fixed max-lg:bottom-0 max-lg:top-12 max-lg:z-40 max-lg:hidden max-lg:w-[280px] max-lg:shadow-lg",
            mobilePanel === "left" && "max-lg:flex",
            leftCollapsed ? "lg:hidden" : "w-[var(--left-width)] max-lg:w-[280px]"
          )}
        >
          {left}
        </aside>

        <PaneResizer
          hidden={leftCollapsed}
          dragging={resizing === "left"}
          onMouseDown={onBeginResizeLeft}
        />

        <main className="min-w-0 flex-1">{center}</main>

        <PaneResizer
          hidden={rightCollapsed}
          dragging={resizing === "right"}
          onMouseDown={onBeginResizeRight}
        />

        <aside
          className={cn(
            "flex min-h-0 shrink-0 flex-col border-l border-hairline bg-panel",
            "max-lg:fixed max-lg:bottom-0 max-lg:right-0 max-lg:top-12 max-lg:z-40 max-lg:hidden max-lg:w-[300px] max-lg:shadow-lg",
            mobilePanel === "right" && "max-lg:flex",
            rightCollapsed ? "lg:hidden" : "w-[var(--right-width)] max-lg:w-[300px]"
          )}
        >
          {right}
        </aside>

        {mobilePanel ? (
          <button
            type="button"
            aria-label="Close panel"
            className="fixed inset-0 top-12 z-30 bg-ink/20 lg:hidden"
            onClick={onCloseMobilePanels}
          />
        ) : null}

        {leftCollapsed ? (
          <button
            type="button"
            className="fixed left-0 top-1/2 z-20 hidden -translate-y-1/2 rounded-r-md border border-l-0 border-hairline bg-panel px-1.5 py-3 text-[0.75rem] text-text-secondary hover:bg-hover lg:block"
            onClick={onRestoreLeft}
            title="Show sessions"
          >
            ▶
          </button>
        ) : null}

        {rightCollapsed ? (
          <button
            type="button"
            className="fixed right-0 top-1/2 z-20 hidden -translate-y-1/2 rounded-l-md border border-r-0 border-hairline bg-panel px-1.5 py-3 text-[0.75rem] text-text-secondary hover:bg-hover lg:block"
            onClick={onRestoreRight}
            title="Show inspector"
          >
            ◀
          </button>
        ) : null}
      </div>
    </div>
  );
}