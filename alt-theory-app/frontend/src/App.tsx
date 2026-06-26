import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LoginOverlay } from "@/components/auth/LoginOverlay";
import { AppShell } from "@/components/shell/AppShell";
import { ConversationPanel } from "@/components/shell/ConversationPanel";
import { InspectorPanel } from "@/components/shell/InspectorPanel";
import { LeftPanel } from "@/components/shell/LeftPanel";
import { MobileBar } from "@/components/shell/MobileBar";
import { HintText } from "@/components/ui/Typography";
import { AppProvider, useApp } from "@/context/AppProvider";
import { usePaneLayout } from "@/hooks/usePaneLayout";
import { ConfigRoute } from "@/pages/ConfigRoute";

function MainApp() {
  const app = useApp();
  const pane = usePaneLayout();

  if (app.loading) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <HintText>Loading app state...</HintText>
      </div>
    );
  }

  const roleLabel =
    app.auth.role === "anonymous"
      ? undefined
      : `${app.auth.displayLabel || app.auth.accountId || ""} · ${app.auth.role}`;

  return (
    <>
      <AppShell
        mobileBar={
          <MobileBar
            onToggleLeft={() => pane.toggleMobilePanel("left")}
            onToggleRight={() => pane.toggleMobilePanel("right")}
            authLabel={roleLabel}
          />
        }
        left={<LeftPanel onCollapse={pane.collapseLeft} />}
        center={<ConversationPanel />}
        right={<InspectorPanel onCollapse={pane.collapseRight} />}
        leftWidth={pane.paneState.leftWidth}
        rightWidth={pane.paneState.rightWidth}
        leftCollapsed={pane.paneState.leftCollapsed}
        rightCollapsed={pane.paneState.rightCollapsed}
        mobilePanel={pane.mobilePanel}
        resizing={pane.resizing}
        onBeginResizeLeft={(clientX) => pane.beginResize("left", clientX)}
        onBeginResizeRight={(clientX) => pane.beginResize("right", clientX)}
        onRestoreLeft={pane.restoreLeft}
        onRestoreRight={pane.restoreRight}
        onCloseMobilePanels={pane.closeMobilePanels}
      />
      {app.loginRequired ? (
        <LoginOverlay onLogin={app.login} error={app.authError} />
      ) : null}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <AppProvider>
              <MainApp />
            </AppProvider>
          }
        />
        <Route path="/config" element={<ConfigRoute />} />
      </Routes>
    </BrowserRouter>
  );
}