import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { LeftNav } from "@/components/shell/LeftNav";
import { ConversationPanel } from "@/components/shell/ConversationPanel";
import { InspectorPanel } from "@/components/shell/InspectorPanel";
import { SettingsView } from "@/components/shell/SettingsView";
import { ReviewPage } from "@/components/shell/ReviewPage";
import { SearchOverlay } from "@/components/shell/SearchOverlay";
import { LoginOverlay } from "@/components/auth/LoginOverlay";

export function Shell() {
  const app = useApp();
  const shell = useShell();

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
        <div className="cols">
          <LeftNav />
          <ConversationPanel />
          <InspectorPanel />
        </div>
      )}
      {app.loginRequired ? (
        <LoginOverlay onLogin={app.login} error={app.authError} />
      ) : null}
    </div>
  );
}
