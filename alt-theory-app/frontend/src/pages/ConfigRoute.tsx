import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAuthMe } from "@/api/auth";
import { AuthConnectCard } from "@/components/shell/SettingsView";
import { BodyText, HintText, PageTitle } from "@/components/ui/Typography";
import { ModelConfigPage } from "@/pages/ModelConfigPage";
import { t } from "@/i18n";

export function ConfigRoute() {
  const [mode, setMode] = useState<"loading" | "local" | "hosted">("loading");
  const [configVersion, setConfigVersion] = useState(0);

  useEffect(() => {
    void fetchAuthMe()
      .then((me) => {
        setMode(me.app?.mode === "local" ? "local" : "hosted");
      })
      .catch(() => setMode("hosted"));
  }, []);

  if (mode === "loading") {
    return (
      <div className="flex min-h-full items-center justify-center bg-canvas">
        <HintText>{t("Loading...")}</HintText>
      </div>
    );
  }

  if (mode === "hosted") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <PageTitle>{t("Model setup unavailable")}</PageTitle>
        <BodyText className="mt-3 text-text-secondary">
          {t("Model and API key configuration is only available in local mode. Hosted deployments manage provider credentials on the server.")}
        </BodyText>
        <Link
          to="/"
          className="mt-6 inline-block text-[0.8125rem] text-text-secondary hover:text-ink"
        >
          {t("← Back to app")}
        </Link>
      </div>
    );
  }

  return (
    <ModelConfigPage
      key={configVersion}
      addProviderTop={
        <AuthConnectCard
          onChanged={() => setConfigVersion((version) => version + 1)}
        />
      }
    />
  );
}
