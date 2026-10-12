import { useMainView } from "@/context/MainView";
import { useShell } from "@/context/ShellContext";
import { t } from "@/i18n";

export function HelpMenu({
  compact = false,
}: {
  compact?: boolean;
}) {
  const main = useMainView();
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
      <summary data-tip={t("Help")}>
        <i className="ph ph-lifebuoy" />
        {compact ? null : t("Help")}
      </summary>
      <div className="help-popover">
        <button
          onClick={(event) => {
            close(event.currentTarget);
            shell.openApp();
            main.askAboutAlt();
          }}
        >
          <i className="ph ph-chats-circle" />
          <span>
            {t("Ask Alt")}
            <small>{t("A fresh conversation about Alt and setup")}</small>
          </span>
        </button>
        <button
          onClick={(event) => {
            close(event.currentTarget);
            shell.openSettings("features");
          }}
        >
          <i className="ph ph-lifebuoy" />
          <span>{t("Help center")}</span>
        </button>
      </div>
    </details>
  );
}
