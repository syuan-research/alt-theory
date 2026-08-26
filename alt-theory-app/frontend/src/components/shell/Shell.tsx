import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useApp } from "@/context/AppProvider";
import { RIGHT_PANE, useShell } from "@/context/ShellContext";
import { t } from "@/i18n";
import { LeftNav } from "@/components/shell/LeftNav";
import { ConversationPanel } from "@/components/shell/ConversationPanel";
import { InspectorPanel } from "@/components/shell/InspectorPanel";
import { SettingsView } from "@/components/shell/SettingsView";
import { ReviewPage } from "@/components/shell/ReviewPage";
import { SearchOverlay } from "@/components/shell/SearchOverlay";
import { LoginOverlay } from "@/components/auth/LoginOverlay";
import { ExternalAiSetupDialog } from "@/components/shell/ExternalAiSetupDialog";
import { ApprovalNotice } from "@/components/shell/ApprovalNotice";

type PaneSide = "left" | "right";

const LEFT_PANE = {
  key: "alt-theory-left-width",
  initial: 264,
  min: 200,
  max: 420,
  collapsed: 52,
} as const;

function readLeftWidth(): number {
  try {
    const stored = localStorage.getItem(LEFT_PANE.key);
    if (stored === null) return LEFT_PANE.initial;
    const value = Number(stored);
    return Number.isFinite(value)
      ? Math.min(LEFT_PANE.max, Math.max(LEFT_PANE.min, value))
      : LEFT_PANE.initial;
  } catch {
    return LEFT_PANE.initial;
  }
}

function saveLeftWidth(width: number): void {
  try {
    localStorage.setItem(LEFT_PANE.key, String(width));
  } catch {
    /* ignore */
  }
}

export function Shell() {
  const app = useApp();
  const shell = useShell();
  const [leftWidth, setLeftWidth] = useState(() => readLeftWidth());
  const lastRightPanel = useRef(shell.rightPanel ?? "workspace");
  if (shell.rightPanel) lastRightPanel.current = shell.rightPanel;

  const setLeftPaneWidth = (value: number, persist = false) => {
    const width = Math.min(LEFT_PANE.max, Math.max(LEFT_PANE.min, value));
    setLeftWidth(width);
    if (persist) saveLeftWidth(width);
  };

  const beginResize = (side: PaneSide, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    let collapsed = side === "left" ? shell.leftCollapsed : !shell.rightPanel;
    const min = side === "left" ? LEFT_PANE.min : RIGHT_PANE.min;
    const max = side === "left" ? LEFT_PANE.max : RIGHT_PANE.max;
    const collapsedW = side === "left" ? LEFT_PANE.collapsed : RIGHT_PANE.collapsed;
    const startWidth = collapsed
      ? collapsedW
      : side === "left"
        ? leftWidth
        : shell.rightWidth;
    let nextWidth = side === "left" ? leftWidth : shell.rightWidth;
    document.body.classList.add("resizing-pane");

    const move = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const raw = startWidth + (side === "left" ? delta : -delta);
      const nextCollapsed = raw < min / 2;
      if (nextCollapsed !== collapsed) {
        if (side === "left") shell.setLeftCollapsed(nextCollapsed);
        else if (nextCollapsed) shell.closeRight();
        else shell.openRail(lastRightPanel.current);
        collapsed = nextCollapsed;
      }
      if (!collapsed) {
        nextWidth = Math.min(max, Math.max(min, raw));
        if (side === "left") setLeftPaneWidth(nextWidth);
        else shell.setRightPaneWidth(nextWidth);
      }
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      document.body.classList.remove("resizing-pane");
      if (side === "left") saveLeftWidth(nextWidth);
      else shell.setRightPaneWidth(nextWidth, true);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const resizeKey = (side: PaneSide, key: string) => {
    if (key !== "ArrowLeft" && key !== "ArrowRight") return;
    if (side === "left" && shell.leftCollapsed) {
      if (key === "ArrowRight") shell.setLeftCollapsed(false);
      return;
    }
    if (side === "right" && !shell.rightPanel) {
      if (key === "ArrowLeft") shell.openRail(lastRightPanel.current);
      return;
    }
    // Left handle: ArrowRight grows left. Right handle sits on the panel's left
    // edge, so ArrowLeft grows the right pane and ArrowRight shrinks it.
    if (side === "left") {
      const direction = key === "ArrowRight" ? 16 : -16;
      setLeftPaneWidth(leftWidth + direction, true);
    } else {
      const delta = key === "ArrowLeft" ? 16 : -16;
      shell.setRightPaneWidth(shell.rightWidth + delta, true);
    }
  };

  if (app.loading) {
    return (
      <div className="app-root" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="rp-empty">{t("Loading app state…")}</div>
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
      <ExternalAiSetupDialog />
      {shell.surface === "app" ? null : <ApprovalNotice />}
      {shell.surface === "settings" ? (
        <SettingsView />
      ) : shell.surface === "review" ? (
        <ReviewPage />
      ) : null}
      {/* The conversation subtree stays mounted while Settings/Review is
          open — hidden, not unmounted — so the composer draft, DOM editing
          state, and browser undo survive the round trip (v1.4.7). */}
      <div
        className="cols"
        hidden={shell.surface !== "app"}
        style={
          {
            "--left-width": `${leftWidth}px`,
            "--right-width": `${shell.rightWidth}px`,
          } as CSSProperties
        }
      >
        <LeftNav />
        <div
          className="pane-resizer"
          role="separator"
          aria-label={t("Resize conversation list")}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={LEFT_PANE.max}
          aria-valuenow={shell.leftCollapsed ? 0 : leftWidth}
          tabIndex={0}
          onPointerDown={(event) => beginResize("left", event)}
          onKeyDown={(event) => resizeKey("left", event.key)}
        />
        <ConversationPanel />
        <div
          className="pane-resizer"
          role="separator"
          aria-label={t("Resize files and details panel")}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={RIGHT_PANE.max}
          aria-valuenow={shell.rightPanel ? shell.rightWidth : 0}
          tabIndex={0}
          onPointerDown={(event) => beginResize("right", event)}
          onKeyDown={(event) => resizeKey("right", event.key)}
        />
        <InspectorPanel />
      </div>
      {app.loginRequired ? (
        <LoginOverlay onLogin={app.login} error={app.authError} />
      ) : null}
    </div>
  );
}
