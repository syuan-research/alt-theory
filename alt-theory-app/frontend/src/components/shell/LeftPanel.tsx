import { Link } from "react-router-dom";
import { ConfigSelectors } from "@/components/left/ConfigSelectors";
import { SessionBrowser } from "@/components/left/SessionBrowser";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandTitle, HintText, MonoText } from "@/components/ui/Typography";
import { useApp } from "@/context/AppProvider";

const ROLE_CONDITION_LABELS: Record<string, string> = {
  "conceptual-theory": "Theory companion",
  "metatheory-oriented": "Metatheory-oriented",
};

function roleConditionLabel(condition: string | null | undefined): string {
  if (!condition) return "—";
  return ROLE_CONDITION_LABELS[condition] || condition;
}

interface LeftPanelProps {
  onCollapse?: () => void;
}

export function LeftPanel({ onCollapse }: LeftPanelProps) {
  const app = useApp();
  const roleLabel =
    app.auth.role === "anonymous"
      ? "Anonymous"
      : `${app.auth.displayLabel || app.auth.accountId || ""} · ${app.auth.role}`;

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel">
      <header className="space-y-3 px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <BrandTitle className="text-[1.25rem]">
              Alt Theory{" "}
              <a
                href="/changelog.html"
                target="_blank"
                rel="noreferrer"
                title="v0.5.6 local bundle test UI. Visual polish is still in progress."
                className="align-middle rounded-md bg-card px-1.5 py-0.5 font-[family-name:var(--font-ui)] text-[0.6875rem] font-medium text-text-muted no-underline"
              >
                v0.5.6 test UI
              </a>
            </BrandTitle>
            <StatusBadge
              status={app.connStatus}
              label={app.connLabel}
              className="mt-1"
            />
          </div>
          <div className="flex items-center gap-1">
            <a
              href="/help/"
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-surface px-2 py-1 text-[0.75rem] font-medium text-text-secondary hover:bg-hover"
            >
              Help
            </a>
            {app.appMode === "local" ? (
              <Link
                to="/config"
                className="rounded-md bg-surface px-2 py-1 text-[0.75rem] font-medium text-text-secondary hover:bg-hover"
              >
                Model setup
              </Link>
            ) : null}
            {onCollapse ? (
              <Button
                variant="ghost"
                className="hidden min-h-8 px-2 lg:inline-flex"
                onClick={onCollapse}
                title="Collapse sessions"
              >
                ◀
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <MonoText className="text-[0.75rem]">{roleLabel}</MonoText>
            <HintText>
              {app.appMode === "local" ? "Local mode" : "Hosted mode"}
            </HintText>
          </div>
          {app.auth.role !== "anonymous" ? (
            <Button
              variant="ghost"
              className="shrink-0 min-h-7 px-2 text-[0.75rem]"
              onClick={() => void app.logout()}
              title="Sign out"
            >
              Logout
            </Button>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-3 pb-3">
        <SessionBrowser />
      </div>

      <footer className="space-y-3 border-t border-hairline px-3 py-2">
        {app.discovery ? (
          <ConfigSelectors />
        ) : (
          <HintText>Discovery loads after auth is ready.</HintText>
        )}
        {app.viewMode === "participant" ? (
          <div>
            <span className="text-[0.6875rem] text-text-muted">
              Current role setup:{" "}
            </span>
            <MonoText className="text-[0.6875rem]">
              {roleConditionLabel(app.auth.defaultRoleCondition)}
            </MonoText>
          </div>
        ) : null}
      </footer>
    </section>
  );
}
