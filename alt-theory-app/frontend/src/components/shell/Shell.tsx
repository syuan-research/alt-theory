import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { LeftNav } from "@/components/shell/LeftNav";
import { ConversationPanel } from "@/components/shell/ConversationPanel";
import { InspectorPanel } from "@/components/shell/InspectorPanel";
import { SettingsView } from "@/components/shell/SettingsView";
import { ReviewPage } from "@/components/shell/ReviewPage";
import { SearchOverlay } from "@/components/shell/SearchOverlay";
import { LoginOverlay } from "@/components/auth/LoginOverlay";

type PaneSide = "left" | "right";

const PANE_WIDTHS = {
  left: { key: "alt-theory-left-width", initial: 264, min: 200, max: 420 },
  right: { key: "alt-theory-right-width", initial: 400, min: 280, max: 640 },
} as const;

function readPaneWidth(side: PaneSide): number {
  const config = PANE_WIDTHS[side];
  try {
    const stored = localStorage.getItem(config.key);
    if (stored === null) return config.initial;
    const value = Number(stored);
    return Number.isFinite(value)
      ? Math.min(config.max, Math.max(config.min, value))
      : config.initial;
  } catch {
    return config.initial;
  }
}

function savePaneWidth(side: PaneSide, width: number): void {
  try {
    localStorage.setItem(PANE_WIDTHS[side].key, String(width));
  } catch {
    /* ignore */
  }
}

export function Shell() {
  const app = useApp();
  const shell = useShell();
  const [leftWidth, setLeftWidth] = useState(() => readPaneWidth("left"));
  const [rightWidth, setRightWidth] = useState(() => readPaneWidth("right"));

  const setPaneWidth = (side: PaneSide, value: number, persist = false) => {
    const { min, max } = PANE_WIDTHS[side];
    const width = Math.min(max, Math.max(min, value));
    if (side === "left") setLeftWidth(width);
    else setRightWidth(width);
    if (persist) savePaneWidth(side, width);
  };

  const beginResize = (side: PaneSide, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "left" ? leftWidth : rightWidth;
    let nextWidth = startWidth;
    document.body.classList.add("resizing-pane");

    const move = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const raw = startWidth + (side === "left" ? delta : -delta);
      const { min, max } = PANE_WIDTHS[side];
      nextWidth = Math.min(max, Math.max(min, raw));
      setPaneWidth(side, nextWidth);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      document.body.classList.remove("resizing-pane");
      savePaneWidth(side, nextWidth);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const resizeKey = (side: PaneSide, key: string) => {
    if (key !== "ArrowLeft" && key !== "ArrowRight") return;
    const direction = key === "ArrowRight" ? 16 : -16;
    const current = side === "left" ? leftWidth : rightWidth;
    setPaneWidth(side, current + (side === "left" ? direction : -direction), true);
  };

  if (app.loading) {
    return (
      <div className="app-root" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="rp-empty">Loading app state…</div>
      </div>
    );
  }

  const rootClass = [
    "app-root",
    shell.leftCollapsed ? "leftCol" : "",
    app.viewMode === "researcher" ? "researcher" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <SearchOverlay />
      {shell.surface === "settings" ? (
        <SettingsView />
      ) : shell.surface === "review" ? (
        <ReviewPage />
      ) : (
        <div
          className="cols"
          style={
            {
              "--left-width": `${leftWidth}px`,
              "--right-width": `${rightWidth}px`,
            } as CSSProperties
          }
        >
          <LeftNav />
          {!shell.leftCollapsed ? (
            <div
              className="pane-resizer"
              role="separator"
              aria-label="Resize conversation list"
              aria-orientation="vertical"
              aria-valuemin={PANE_WIDTHS.left.min}
              aria-valuemax={PANE_WIDTHS.left.max}
              aria-valuenow={leftWidth}
              tabIndex={0}
              onPointerDown={(event) => beginResize("left", event)}
              onKeyDown={(event) => resizeKey("left", event.key)}
            />
          ) : null}
          <ConversationPanel />
          {shell.rightPanel ? (
            <div
              className="pane-resizer"
              role="separator"
              aria-label="Resize files and details panel"
              aria-orientation="vertical"
              aria-valuemin={PANE_WIDTHS.right.min}
              aria-valuemax={PANE_WIDTHS.right.max}
              aria-valuenow={rightWidth}
              tabIndex={0}
              onPointerDown={(event) => beginResize("right", event)}
              onKeyDown={(event) => resizeKey("right", event.key)}
            />
          ) : null}
          <InspectorPanel />
        </div>
      )}
      {app.loginRequired ? (
        <LoginOverlay onLogin={app.login} error={app.authError} />
      ) : null}
    </div>
  );
}
