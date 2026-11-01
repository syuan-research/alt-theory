import { useEffect, useLayoutEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { useMainView } from "@/context/MainView";
import { attention, trackAttention } from "@/lib/attention";
import { LEFT_PANE, RIGHT_PANE, type PaneSide } from "@/lib/pane-layout";
import { t } from "@/i18n";
import { applyTitlebarVar, getViewSize } from "@/lib/native";
import { LeftNav } from "@/components/shell/LeftNav";
import { ConversationPanel } from "@/components/shell/ConversationPanel";
import { InspectorPanel } from "@/components/shell/InspectorPanel";
import { SettingsView } from "@/components/shell/SettingsView";
import { ReviewPage } from "@/components/shell/ReviewPage";
import { ConversationFilesPage } from "@/components/shell/ConversationFilesPage";

import { ExternalAiSetupDialog } from "@/components/shell/ExternalAiSetupDialog";
import { VersionsDialog } from "@/components/shell/VersionsDialog";
import { ApprovalNotice } from "@/components/shell/ApprovalNotice";
import { FindBar } from "@/components/shell/FindBar";

export function Shell() {
  const app = useApp();
  const shell = useShell();
  const main = useMainView();
  const rootRef = useRef<HTMLDivElement>(null);
  const latest = useRef(shell);
  latest.current = shell;
  const dragCleanup = useRef<(() => void) | null>(null);
  const { state: layout, geometry, measure } = shell.layout;

  useEffect(() => trackAttention(), []);
  useEffect(() => () => dragCleanup.current?.(), []);
  useLayoutEffect(() => { attention.forget("right"); }, [main.conversation.sessionId]);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = () => measure(root.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [app.loading, shell.surface, measure]);

  const beginResize = (side: PaneSide, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (layout.single) return;
    dragCleanup.current?.();
    let lastX = event.clientX;
    const pane = side === "left" ? LEFT_PANE : RIGHT_PANE;
    let collapsed = side === "left" ? shell.leftCollapsed : !shell.rightPanel;
    let gesture = side === "left" ? geometry.left : geometry.right;
    let changed = false;
    document.body.classList.add("resizing-pane");

    const move = (moveEvent: PointerEvent) => {
      const current = latest.current;
      if (current.layout.state.single) { cancel(); return; }
      const delta = moveEvent.clientX - lastX;
      lastX = moveEvent.clientX;
      gesture += side === "left" ? delta : -delta;
      const nextCollapsed = gesture < pane.min / 2;
      if (nextCollapsed !== collapsed) {
        if (side === "left") current.setLeftCollapsed(nextCollapsed);
        else if (nextCollapsed) current.closeRight();
        else current.reopenRight();
        collapsed = nextCollapsed;
        gesture = collapsed ? (side === "left" ? LEFT_PANE.collapsed : 0) : pane.min;
      }
      if (!collapsed) {
        const actual = current.layout.geometry;
        const max = side === "left" ? actual.leftMax : actual.rightMax;
        if (max < pane.min) return;
        // Discard upper-bound overshoot, so reversing the pointer moves immediately.
        gesture = Math.min(max, gesture);
        const next = Math.max(pane.min, gesture);
        changed ||= next !== (side === "left" ? actual.left : actual.right);
        current.layout.setWidth(side, next);
      } else {
        gesture = Math.max(0, gesture);
      }
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      document.body.classList.remove("resizing-pane");
      dragCleanup.current = null;
    };
    const cancel = () => cleanup();
    const end = () => {
      cleanup();
      if (changed) latest.current.layout.commitWidth(side);
    };

    dragCleanup.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
    window.addEventListener("blur", cancel, { once: true });
  };

  const resizeKey = (side: PaneSide, key: string) => {
    if (key !== "ArrowLeft" && key !== "ArrowRight") return;
    if (side === "left" && shell.leftCollapsed) {
      if (key === "ArrowRight") shell.setLeftCollapsed(false);
      return;
    }
    if (side === "right" && !shell.rightPanel) {
      if (key === "ArrowLeft") shell.reopenRight();
      return;
    }
    // Left handle: ArrowRight grows left. Right handle sits on the panel's left
    // edge, so ArrowLeft grows the right pane and ArrowRight shrinks it.
    if (side === "left") {
      const direction = key === "ArrowRight" ? 16 : -16;
      shell.layout.setWidth("left", geometry.left + direction, true);
    } else {
      const delta = key === "ArrowLeft" ? 16 : -16;
      shell.layout.setWidth("right", geometry.right + delta, true);
    }
  };

  // Reserve the right height for the OS overlay-button band at any zoom level.
  useEffect(() => {
    void getViewSize().then(applyTitlebarVar);
  }, []);

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
    geometry.left <= 240 ? "leftNarrow" : "",
    app.viewMode === "researcher" ? "researcher" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClass}
      ref={rootRef}
      data-single-pane={layout.single ?? undefined}
      style={
        {
          "--left-width": `${geometry.left}px`,
          "--right-width": `${geometry.right}px`,
          "--right-rail-width": `${geometry.rail}px`,
          visibility: layout.width > 0 ? undefined : "hidden",
        } as CSSProperties
      }
    >

      <ExternalAiSetupDialog />
      <VersionsDialog />
      <FindBar />
      {shell.surface === "app" ? null : <ApprovalNotice />}
      {/* One persistent left rail shared by the app and settings surfaces;
          review stays full width this round (hidden, not unmounted). */}
      <LeftNav hidden={shell.surface === "review"} />
      <div
        className="pane-resizer"
        hidden={shell.surface === "review" || layout.single !== null}
        role="separator"
        aria-label={t("Resize conversation list")}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={geometry.leftMax}
        aria-valuenow={shell.leftCollapsed ? 0 : geometry.left}
        tabIndex={0}
        onPointerDown={(event) => beginResize("left", event)}
        onDoubleClick={() => shell.leftCollapsed && shell.setLeftCollapsed(false)}
        onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") event.preventDefault(); resizeKey("left", event.key); }}
      />
      {shell.surface === "settings" ? (
        <SettingsView />
      ) : shell.surface === "review" ? (
        <ReviewPage />
      ) : shell.surface === "files" ? (
        <ConversationFilesPage />
      ) : null}
      {/* The conversation subtree stays mounted while Settings/Review is
          open — hidden, not unmounted — so the composer draft, DOM editing
          state, and browser undo survive the round trip (v1.4.7). */}
      <div
        className="cols a2cols"
        hidden={shell.surface !== "app"}
      >
        <ConversationPanel />
        <div
          className="pane-resizer"
          hidden={layout.single !== null}
          role="separator"
          aria-label={t("Resize files and details panel")}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={geometry.rightMax}
          aria-valuenow={shell.rightPanel ? geometry.right : 0}
          tabIndex={0}
          onPointerDown={(event) => beginResize("right", event)}
          onDoubleClick={() => !shell.rightPanel && shell.reopenRight()}
          onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") event.preventDefault(); resizeKey("right", event.key); }}
        />
        <InspectorPanel />
      </div>
    </div>
  );
}
