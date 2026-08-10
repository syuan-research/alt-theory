import { useApp } from "@/context/AppProvider";
import { useShell } from "@/context/ShellContext";
import { t } from "@/i18n";

export function HelpMenu({
  compact = false,
  attachToCenter = true,
}: {
  compact?: boolean;
  attachToCenter?: boolean;
}) {
  const app = useApp();
  const shell = useShell();
  const close = (target: HTMLElement) =>
    target.closest("details")?.removeAttribute("open");

  return (
    <details
      className={"help-menu" + (compact ? " compact" : "")}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.currentTarget.removeAttribute("open");
      }}
    >
      <summary title={t("Help")}>
        <i className="ph ph-lifebuoy" />
        {compact ? null : t("Help")}
      </summary>
      <div className="help-popover">
        <button
          onClick={(event) => {
            close(event.currentTarget);
            shell.openApp();
            app.openHelper(undefined, attachToCenter);
          }}
        >
          <i className="ph ph-chats-circle" />
          <span>
            {t("Ask Helper")}
            <small>{t("A fresh conversation about Alt and setup")}</small>
          </span>
        </button>
        <button
          onClick={(event) => {
            close(event.currentTarget);
            shell.openSettings("features");
          }}
        >
          <i className="ph ph-book-open-text" />
          <span>{t("Help center")}</span>
        </button>
      </div>
    </details>
  );
}
