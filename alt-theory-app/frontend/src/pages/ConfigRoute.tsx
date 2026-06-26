import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAuthMe } from "@/api/auth";
import { BodyText, HintText, PageTitle } from "@/components/ui/Typography";
import { ModelConfigPage } from "@/pages/ModelConfigPage";

export function ConfigRoute() {
  const [mode, setMode] = useState<"loading" | "local" | "hosted">("loading");

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
        <HintText>Loading...</HintText>
      </div>
    );
  }

  if (mode === "hosted") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <PageTitle>Model setup unavailable</PageTitle>
        <BodyText className="mt-3 text-text-secondary">
          Model and API key configuration is only available in local mode. Hosted
          deployments manage provider credentials on the server.
        </BodyText>
        <Link
          to="/"
          className="mt-6 inline-block text-[0.8125rem] text-text-secondary hover:text-ink"
        >
          ← Back to app
        </Link>
      </div>
    );
  }

  return <ModelConfigPage />;
}